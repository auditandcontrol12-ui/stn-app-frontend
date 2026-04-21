const { app } = require("@azure/functions");
const { getPool, sql } = require("../shared/db");
const { readCookie } = require("../shared/session");

function buildSTNNumber(stnType, warehouseFrom, warehouseTo, seqNo) {
  const fromPart = warehouseFrom === "__OTHER__" ? "OTHER" : (warehouseFrom || "NA");
  const toPart = warehouseTo === "__OTHER__" ? "OTHER" : (warehouseTo || "NA");
  return `STN-${stnType}-${fromPart}-${toPart}-${seqNo}`;
}

async function getSessionUser(pool, sessionId) {
  const result = await pool.request()
    .input("SessionID", sql.UniqueIdentifier, sessionId)
    .query(`
      SELECT TOP 1
          s.SessionID,
          s.ExpiresOn,
          s.IsRevoked,
          u.UserID,
          u.UserEmail,
          u.UserName,
          u.IsAllowedManufacturing,
          u.IsAllowedDistribution,
          u.IsSuperUser,
          u.IsActive,
          u.IsDeleted
      FROM STNAPP.UserSession s
      INNER JOIN STNAPP.Users u
          ON s.UserID = u.UserID
      WHERE s.SessionID = @SessionID;
    `);

  if (result.recordset.length === 0) return null;

  const row = result.recordset[0];

  if (
    row.IsRevoked ||
    !row.IsActive ||
    row.IsDeleted ||
    new Date(row.ExpiresOn) < new Date()
  ) {
    return null;
  }

  const allowedAreas = [];
  if (row.IsAllowedManufacturing) allowedAreas.push("Manufacturing");
  if (row.IsAllowedDistribution) allowedAreas.push("Distribution");

  return {
    userId: row.UserID,
    userEmail: row.UserEmail,
    userName: row.UserName,
    isSuperUser: !!row.IsSuperUser,
    allowedAreas
  };
}

async function validateWarehousePermission(pool, sessionUser, businessArea, stnType, warehouseCode) {
  if (!warehouseCode || warehouseCode === "__OTHER__") {
    return { ok: true };
  }

  if (!["IN", "OB"].includes(stnType)) {
    return { ok: false, message: "Invalid STN Type." };
  }

  const permissionColumn = stnType === "IN" ? "AllowInboundTo" : "AllowOutboundFrom";

  const warehouseResult = await pool.request()
    .input("BusinessArea", sql.NVarChar(100), businessArea)
    .input("WarehouseCode", sql.NVarChar(100), warehouseCode)
    .query(`
      SELECT TOP 1
          WarehouseId,
          WarehouseCode,
          WarehouseName,
          IsActive
      FROM STNAPP.Warehouse
      WHERE
          BusinessArea = @BusinessArea
          AND WarehouseCode = @WarehouseCode;
    `);

  if (warehouseResult.recordset.length === 0) {
    return {
      ok: false,
      message: `Warehouse ${warehouseCode} is not valid for ${businessArea}.`
    };
  }

  const warehouse = warehouseResult.recordset[0];
  if (!warehouse.IsActive) {
    return {
      ok: false,
      message: `Warehouse ${warehouseCode} is inactive.`
    };
  }

  if (sessionUser.isSuperUser) {
    return { ok: true };
  }

  const accessResult = await pool.request()
    .input("UserId", sql.BigInt, sessionUser.userId)
    .input("BusinessArea", sql.NVarChar(100), businessArea)
    .input("WarehouseCode", sql.NVarChar(100), warehouseCode)
    .query(`
      SELECT TOP 1
          UserWarehouseAccessId
      FROM STNAPP.UserWarehouseAccess
      WHERE
          UserId = @UserId
          AND BusinessArea = @BusinessArea
          AND WarehouseCode = @WarehouseCode
          AND IsActive = 1
          AND ${permissionColumn} = 1;
    `);

  if (accessResult.recordset.length > 0) {
    return { ok: true };
  }

  const anyAccessRowsResult = await pool.request()
    .input("UserId", sql.BigInt, sessionUser.userId)
    .input("BusinessArea", sql.NVarChar(100), businessArea)
    .query(`
      SELECT COUNT(1) AS Cnt
      FROM STNAPP.UserWarehouseAccess
      WHERE
          UserId = @UserId
          AND BusinessArea = @BusinessArea
          AND IsActive = 1;
    `);

  const hasAnyAreaAccessRows = Number(anyAccessRowsResult.recordset[0]?.Cnt || 0) > 0;

  // Safe transition fallback:
  // if no explicit access rows exist yet for this user/area, allow current behavior.
  if (!hasAnyAreaAccessRows) {
    return { ok: true };
  }

  return {
    ok: false,
    message:
      stnType === "IN"
        ? `You do not have inbound access to warehouse ${warehouseCode}.`
        : `You do not have outbound access from warehouse ${warehouseCode}.`
  };
}

app.http("submitSTN", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    let transaction;

    try {
      const body = await request.json();

      if (!body) {
        return {
          status: 400,
          jsonBody: { success: false, message: "Request body is required." }
        };
      }

      const {
        stnId,
        stnType,
        businessArea,
        stnDate,
        warehouseFrom,
        warehouseTo,
        warehouseFromCustom,
        warehouseToCustom,
        remarks,
        status,
        lines
      } = body;

      if (!stnType) {
        return { status: 400, jsonBody: { success: false, message: "STN Type is required." } };
      }

      if (!businessArea) {
        return { status: 400, jsonBody: { success: false, message: "Business Area is required." } };
      }

      if (!warehouseFrom) {
        return { status: 400, jsonBody: { success: false, message: "Warehouse From is required." } };
      }

      if (!warehouseTo) {
        return { status: 400, jsonBody: { success: false, message: "Warehouse To is required." } };
      }

      if (!Array.isArray(lines) || lines.length === 0) {
        return { status: 400, jsonBody: { success: false, message: "At least one line is required." } };
      }

      if (!["Draft", "Submitted"].includes(status)) {
        return { status: 400, jsonBody: { success: false, message: "Status must be Draft or Submitted." } };
      }

      for (const line of lines) {
        if (!line.itemCode) {
          return {
            status: 400,
            jsonBody: { success: false, message: `Line ${line.lineNu}: ItemCode is required.` }
          };
        }

        if (!line.qty || Number(line.qty) <= 0) {
          return {
            status: 400,
            jsonBody: { success: false, message: `Line ${line.lineNu}: Qty must be greater than 0.` }
          };
        }
      }

      const cookieName = process.env.SESSION_COOKIE_NAME || "stn_session";
      const sessionId = readCookie(request, cookieName);

      if (!sessionId) {
        return {
          status: 401,
          jsonBody: { success: false, message: "Unauthorized." }
        };
      }

      const pool = await getPool();
      const sessionUser = await getSessionUser(pool, sessionId);

      if (!sessionUser) {
        return {
          status: 401,
          jsonBody: { success: false, message: "Unauthorized." }
        };
      }

      if (!sessionUser.allowedAreas.includes(businessArea)) {
        return {
          status: 403,
          jsonBody: { success: false, message: "Access denied for selected business area." }
        };
      }

      const normalizedType = String(stnType || "").trim().toUpperCase();

      if (!["IN", "OB"].includes(normalizedType)) {
        return {
          status: 400,
          jsonBody: { success: false, message: "STN Type must be IN or OB." }
        };
      }

      const restrictedWarehouse =
        normalizedType === "IN" ? warehouseTo : warehouseFrom;

      const permissionCheck = await validateWarehousePermission(
        pool,
        sessionUser,
        businessArea,
        normalizedType,
        restrictedWarehouse
      );

      if (!permissionCheck.ok) {
        return {
          status: 403,
          jsonBody: { success: false, message: permissionCheck.message }
        };
      }

      transaction = new sql.Transaction(pool);
      await transaction.begin();

      let finalStnId = null;
      let finalStnSeqNo = null;
      let finalStnNumber = null;

      if (stnId) {
        const existingResult = await new sql.Request(transaction)
          .input("STNId", sql.BigInt, Number(stnId))
          .query(`
            SELECT TOP 1
                STNId,
                STNNumber,
                STNSeqNo,
                BusinessArea,
                STNType,
                WarehouseFrom,
                WarehouseTo,
                Status,
                IsDeleted,
                IsSignedDocumentUploaded,
                SignedDocumentBlobName
            FROM STNAPP.STNHeader
            WHERE STNId = @STNId;
          `);

        if (existingResult.recordset.length === 0) {
          await transaction.rollback();
          return {
            status: 404,
            jsonBody: { success: false, message: "Existing STN not found." }
          };
        }

        const existing = existingResult.recordset[0];

        if (existing.IsDeleted) {
          await transaction.rollback();
          return {
            status: 400,
            jsonBody: { success: false, message: "Deleted STN cannot be updated." }
          };
        }

        if (existing.Status === "Submitted") {
          await transaction.rollback();
          return {
            status: 400,
            jsonBody: { success: false, message: "Submitted STN cannot be modified." }
          };
        }

        if (!sessionUser.allowedAreas.includes(existing.BusinessArea)) {
          await transaction.rollback();
          return {
            status: 403,
            jsonBody: { success: false, message: "Access denied." }
          };
        }

        if (status === "Submitted" && (!existing.IsSignedDocumentUploaded || !existing.SignedDocumentBlobName)) {
          await transaction.rollback();
          return {
            status: 400,
            jsonBody: { success: false, message: "Signed PDF must be uploaded before submit." }
          };
        }

        finalStnId = existing.STNId;
        finalStnSeqNo = existing.STNSeqNo;
        finalStnNumber = existing.STNNumber;

        await new sql.Request(transaction)
          .input("STNId", sql.BigInt, Number(stnId))
          .input("STNType", sql.NVarChar(40), normalizedType)
          .input("BusinessArea", sql.NVarChar(200), businessArea)
          .input("STNDate", sql.Date, stnDate)
          .input("WarehouseFrom", sql.NVarChar(400), warehouseFrom)
          .input("WarehouseTo", sql.NVarChar(400), warehouseTo)
          .input("WarehouseFromCustom", sql.NVarChar(800), warehouseFromCustom || null)
          .input("WarehouseToCustom", sql.NVarChar(800), warehouseToCustom || null)
          .input("Remarks", sql.NVarChar(2000), remarks || null)
          .input("Status", sql.NVarChar(120), status)
          .input("UpdatedBy", sql.NVarChar(800), sessionUser.userName)
          .input("UpdatedByEmail", sql.NVarChar(1020), sessionUser.userEmail)
          .input("SubmittedBy", sql.NVarChar(800), status === "Submitted" ? sessionUser.userName : null)
          .input("SubmittedByEmail", sql.NVarChar(1020), status === "Submitted" ? sessionUser.userEmail : null)
          .query(`
            UPDATE STNAPP.STNHeader
            SET
                STNType = @STNType,
                BusinessArea = @BusinessArea,
                STNDate = @STNDate,
                WarehouseFrom = @WarehouseFrom,
                WarehouseTo = @WarehouseTo,
                WarehouseFromCustom = @WarehouseFromCustom,
                WarehouseToCustom = @WarehouseToCustom,
                Remarks = @Remarks,
                Status = @Status,
                UpdatedBy = @UpdatedBy,
                UpdatedByEmail = @UpdatedByEmail,
                UpdatedDateTime = SYSDATETIME(),
                SubmittedBy = CASE WHEN @Status = 'Submitted' THEN @SubmittedBy ELSE SubmittedBy END,
                SubmittedByEmail = CASE WHEN @Status = 'Submitted' THEN @SubmittedByEmail ELSE SubmittedByEmail END,
                SubmittedDateTime = CASE
                    WHEN @Status = 'Submitted' AND SubmittedDateTime IS NULL THEN SYSDATETIME()
                    WHEN @Status = 'Draft' THEN NULL
                    ELSE SubmittedDateTime
                END
            WHERE STNId = @STNId;
          `);

        await new sql.Request(transaction)
          .input("STNId", sql.BigInt, Number(stnId))
          .query(`
            DELETE FROM STNAPP.STNLine
            WHERE STNId = @STNId;
          `);
      } else {
        if (status === "Submitted") {
          await transaction.rollback();
          return {
            status: 400,
            jsonBody: { success: false, message: "Save as Draft first before submit." }
          };
        }

        const seqResult = await new sql.Request(transaction).query(`
          UPDATE STNAPP.STNSequence
          SET LastNumber = LastNumber + 1
          OUTPUT INSERTED.LastNumber AS NewSeqNo
          WHERE SequenceId = (SELECT TOP 1 SequenceId FROM STNAPP.STNSequence ORDER BY SequenceId);
        `);

        if (seqResult.recordset.length === 0) {
          await transaction.rollback();
          return {
            status: 500,
            jsonBody: { success: false, message: "Failed to generate STN sequence." }
          };
        }

        finalStnSeqNo = seqResult.recordset[0].NewSeqNo;
        finalStnNumber = buildSTNNumber(normalizedType, warehouseFrom, warehouseTo, finalStnSeqNo);

        const headerResult = await new sql.Request(transaction)
          .input("STNNumber", sql.NVarChar(400), finalStnNumber)
          .input("STNSeqNo", sql.Int, finalStnSeqNo)
          .input("STNType", sql.NVarChar(40), normalizedType)
          .input("BusinessArea", sql.NVarChar(200), businessArea)
          .input("STNDate", sql.Date, stnDate)
          .input("WarehouseFrom", sql.NVarChar(400), warehouseFrom)
          .input("WarehouseTo", sql.NVarChar(400), warehouseTo)
          .input("WarehouseFromCustom", sql.NVarChar(800), warehouseFromCustom || null)
          .input("WarehouseToCustom", sql.NVarChar(800), warehouseToCustom || null)
          .input("Remarks", sql.NVarChar(2000), remarks || null)
          .input("Status", sql.NVarChar(120), status)
          .input("CreatedBy", sql.NVarChar(800), sessionUser.userName)
          .input("CreatedByEmail", sql.NVarChar(1020), sessionUser.userEmail)
          .input("SubmittedBy", sql.NVarChar(800), null)
          .input("SubmittedByEmail", sql.NVarChar(1020), null)
          .query(`
            INSERT INTO STNAPP.STNHeader
            (
                STNNumber,
                STNSeqNo,
                STNType,
                STNDate,
                WarehouseFrom,
                WarehouseTo,
                WarehouseFromCustom,
                WarehouseToCustom,
                Remarks,
                Status,
                BusinessArea,
                CreatedBy,
                CreatedByEmail,
                CreatedDateTime,
                SubmittedBy,
                SubmittedByEmail,
                SubmittedDateTime,
                IsDeleted
            )
            OUTPUT INSERTED.STNId
            VALUES
            (
                @STNNumber,
                @STNSeqNo,
                @STNType,
                @STNDate,
                @WarehouseFrom,
                @WarehouseTo,
                @WarehouseFromCustom,
                @WarehouseToCustom,
                @Remarks,
                @Status,
                @BusinessArea,
                @CreatedBy,
                @CreatedByEmail,
                SYSDATETIME(),
                @SubmittedBy,
                @SubmittedByEmail,
                NULL,
                0
            );
          `);

        finalStnId = headerResult.recordset[0].STNId;
      }

      for (const [index, line] of lines.entries()) {
        await new sql.Request(transaction)
          .input("STNId", sql.BigInt, finalStnId)
          .input("LineNu", sql.Int, Number(line.lineNu || index + 1))
          .input("ItemCode", sql.NVarChar(400), line.itemCode)
          .input("ItemName", sql.NVarChar(1200), line.itemName || "")
          .input("UOM", sql.NVarChar(200), line.uom || "")
          .input("BatchNumber", sql.NVarChar(400), line.batchNumber || null)
          .input("Qty", sql.Decimal(19, 6), Number(line.qty))
          .input("LineRemarks", sql.NVarChar(2000), line.lineRemarks || null)
          .query(`
            INSERT INTO STNAPP.STNLine
            (
                STNId,
                LineNu,
                ItemCode,
                ItemName,
                UOM,
                BatchNumber,
                Qty,
                LineRemarks,
                CreatedDateTime
            )
            VALUES
            (
                @STNId,
                @LineNu,
                @ItemCode,
                @ItemName,
                @UOM,
                @BatchNumber,
                @Qty,
                @LineRemarks,
                SYSDATETIME()
            );
          `);
      }

      await transaction.commit();

      return {
        status: 200,
        jsonBody: {
          success: true,
          stnId: finalStnId,
          stnNumber: finalStnNumber,
          stnSeqNo: finalStnSeqNo,
          status,
          businessArea
        }
      };
    } catch (error) {
      try {
        if (transaction) {
          await transaction.rollback();
        }
      } catch {}

      context.log("submitSTN error", error);

      return {
        status: 500,
        jsonBody: {
          success: false,
          message: error.message
        }
      };
    }
  }
});