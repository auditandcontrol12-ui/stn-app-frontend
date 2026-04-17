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
    allowedAreas
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
                Status,
                IsDeleted
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

        if (!sessionUser.allowedAreas.includes(existing.BusinessArea)) {
          await transaction.rollback();
          return {
            status: 403,
            jsonBody: { success: false, message: "Access denied." }
          };
        }

        finalStnId = existing.STNId;
        finalStnSeqNo = existing.STNSeqNo;
        finalStnNumber = existing.STNNumber;

        await new sql.Request(transaction)
          .input("STNId", sql.BigInt, Number(stnId))
          .input("STNType", sql.NVarChar(40), stnType)
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
        finalStnNumber = buildSTNNumber(stnType, warehouseFrom, warehouseTo, finalStnSeqNo);

        const headerResult = await new sql.Request(transaction)
          .input("STNNumber", sql.NVarChar(400), finalStnNumber)
          .input("STNSeqNo", sql.Int, finalStnSeqNo)
          .input("STNType", sql.NVarChar(40), stnType)
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
          .input("SubmittedBy", sql.NVarChar(800), status === "Submitted" ? sessionUser.userName : null)
          .input("SubmittedByEmail", sql.NVarChar(1020), status === "Submitted" ? sessionUser.userEmail : null)
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
                CASE WHEN @Status = 'Submitted' THEN SYSDATETIME() ELSE NULL END,
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