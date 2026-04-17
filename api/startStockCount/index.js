const { app } = require("@azure/functions");
const { getPool, sql } = require("../shared/db");
const { readCookie } = require("../shared/session");

const AREA_CONFIG = {
  Distribution: {
    whsObjectName: "dist.FactCustomWhsAttributes"
  },
  Manufacturing: {
    whsObjectName: "manu.FactCustomWhsAttributes"
  }
};

function buildCountNumber(seqNo) {
  return `SC-${String(seqNo).padStart(4, "0")}`;
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
          u.IsManager,
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

  return row;
}

async function getManagerEmail(pool, businessArea, creatorEmail) {
  const result = await pool.request()
    .input("CreatorEmail", sql.NVarChar(1020), creatorEmail)
    .query(`
      SELECT TOP 1 UserEmail
      FROM STNAPP.Users
      WHERE IsManager = 1
        AND IsActive = 1
        AND IsDeleted = 0
        AND LOWER(UserEmail) <> LOWER(@CreatorEmail)
      ORDER BY UserEmail;
    `);

  return result.recordset[0]?.UserEmail || null;
}

app.http("startStockCount", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    let transaction;

    try {
      const cookieName = process.env.SESSION_COOKIE_NAME || "stn_session";
      const sessionId = readCookie(request, cookieName);

      if (!sessionId) {
        return {
          status: 401,
          jsonBody: { success: false, message: "Unauthorized." }
        };
      }

      const body = await request.json();
      const area = (body?.area || "").trim();
      const warehouseCode = (body?.warehouseCode || "").trim();
      const lines = Array.isArray(body?.lines) ? body.lines : [];
      const remarks = (body?.remarks || "").trim();

      if (!AREA_CONFIG[area]) {
        return {
          status: 400,
          jsonBody: { success: false, message: "Valid business area is required." }
        };
      }

      if (!warehouseCode) {
        return {
          status: 400,
          jsonBody: { success: false, message: "Warehouse is required." }
        };
      }

      if (!lines.length) {
        return {
          status: 400,
          jsonBody: { success: false, message: "At least one item is required." }
        };
      }

      if (lines.length > 10) {
        return {
          status: 400,
          jsonBody: { success: false, message: "Maximum 10 lines allowed." }
        };
      }

      for (const [i, line] of lines.entries()) {
        if (!line.itemCode || !line.itemName || !line.uom || !line.batchNumber) {
          return {
            status: 400,
            jsonBody: { success: false, message: `Line ${i + 1}: item, name, UOM, and batch are required.` }
          };
        }
      }

      const pool = await getPool();
      const sessionUser = await getSessionUser(pool, sessionId);

      if (!sessionUser) {
        return {
          status: 401,
          jsonBody: { success: false, message: "Unauthorized." }
        };
      }

      if (
        (area === "Manufacturing" && !sessionUser.IsAllowedManufacturing) ||
        (area === "Distribution" && !sessionUser.IsAllowedDistribution)
      ) {
        return {
          status: 403,
          jsonBody: { success: false, message: "Access denied for selected business area." }
        };
      }

      transaction = new sql.Transaction(pool);
      await transaction.begin();

      const whsResult = await new sql.Request(transaction)
        .input("WhsCode", sql.NVarChar(400), warehouseCode)
        .query(`
          SELECT TOP 1
              WhsCode,
              WhsName
          FROM ${AREA_CONFIG[area].whsObjectName}
          WHERE WhsCode = @WhsCode;
        `);

      const warehouseName = whsResult.recordset[0]?.WhsName || warehouseCode;

      const seqResult = await new sql.Request(transaction).query(`
        UPDATE STNAPP.StockCountSequence
        SET LastNumber = LastNumber + 1
        OUTPUT INSERTED.LastNumber AS NewSeqNo
        WHERE SequenceId = (SELECT TOP 1 SequenceId FROM STNAPP.StockCountSequence ORDER BY SequenceId);
      `);

      if (!seqResult.recordset.length) {
        await transaction.rollback();
        return {
          status: 500,
          jsonBody: { success: false, message: "Failed to generate stock count sequence." }
        };
      }

      const countSeqNo = seqResult.recordset[0].NewSeqNo;
      const countNumber = buildCountNumber(countSeqNo);
      const managerEmail = await getManagerEmail(pool, area, sessionUser.UserEmail);

      const headerInsert = await new sql.Request(transaction)
        .input("CountNumber", sql.NVarChar(200), countNumber)
        .input("CountSeqNo", sql.Int, countSeqNo)
        .input("BusinessArea", sql.NVarChar(200), area)
        .input("WarehouseCode", sql.NVarChar(400), warehouseCode)
        .input("WarehouseName", sql.NVarChar(800), warehouseName)
        .input("ManagerEmail", sql.NVarChar(1020), managerEmail)
        .input("Remarks", sql.NVarChar(2000), remarks || null)
        .input("CreatedBy", sql.NVarChar(800), sessionUser.UserName || "")
        .input("CreatedByEmail", sql.NVarChar(1020), sessionUser.UserEmail || "")
        .query(`
          INSERT INTO STNAPP.StockCountHeader
          (
              CountNumber,
              CountSeqNo,
              BusinessArea,
              WarehouseCode,
              WarehouseName,
              Status,
              ManagerEmail,
              Remarks,
              CreatedBy,
              CreatedByEmail,
              CreatedDateTime,
              IsDeleted
          )
          OUTPUT INSERTED.StockCountId
          VALUES
          (
              @CountNumber,
              @CountSeqNo,
              @BusinessArea,
              @WarehouseCode,
              @WarehouseName,
              'Open',
              @ManagerEmail,
              @Remarks,
              @CreatedBy,
              @CreatedByEmail,
              SYSDATETIME(),
              0
          );
        `);

      const stockCountId = headerInsert.recordset[0].StockCountId;

      for (const [index, line] of lines.entries()) {
        const qtyResult = await new sql.Request(transaction)
          .input("WhsCode", sql.NVarChar(400), warehouseCode)
          .input("BusinessArea", sql.NVarChar(200), area)
          .input("ItemCode", sql.NVarChar(400), line.itemCode)
          .input("BatchNumber", sql.NVarChar(400), line.batchNumber || "")
          .query(`
            ;WITH BaseData AS (
              SELECT
                  h.WarehouseFrom,
                  h.WarehouseTo,
                  l.ItemCode,
                  ISNULL(l.BatchNumber, '') AS BatchNumber,
                  CAST(l.Qty AS decimal(19,6)) AS Qty
              FROM STNAPP.STNHeader h
              INNER JOIN STNAPP.STNLine l
                ON h.STNId = l.STNId
              WHERE h.Status = 'Submitted'
                AND h.IsDeleted = 0
                AND h.BusinessArea = @BusinessArea
                AND l.ItemCode = @ItemCode
                AND ISNULL(l.BatchNumber, '') = @BatchNumber
                AND (
                  h.WarehouseFrom = @WhsCode
                  OR h.WarehouseTo = @WhsCode
                )
            )
            SELECT
              ISNULL(
                SUM(CASE WHEN WarehouseTo = @WhsCode THEN Qty ELSE 0 END)
                - SUM(CASE WHEN WarehouseFrom = @WhsCode THEN Qty ELSE 0 END),
                0
              ) AS SystemQtyAtStart
            FROM BaseData;
          `);

        const systemQtyAtStart = Number(qtyResult.recordset[0]?.SystemQtyAtStart || 0);

        await new sql.Request(transaction)
          .input("StockCountId", sql.BigInt, stockCountId)
          .input("LineNu", sql.Int, index + 1)
          .input("ItemCode", sql.NVarChar(400), line.itemCode)
          .input("ItemName", sql.NVarChar(1200), line.itemName)
          .input("UOM", sql.NVarChar(200), line.uom)
          .input("BatchNumber", sql.NVarChar(400), line.batchNumber)
          .input("SystemQtyAtStart", sql.Decimal(19, 6), systemQtyAtStart)
          .query(`
            INSERT INTO STNAPP.StockCountLine
            (
                StockCountId,
                LineNu,
                ItemCode,
                ItemName,
                UOM,
                BatchNumber,
                SystemQtyAtStart,
                CountedQty,
                CreatedDateTime
            )
            VALUES
            (
                @StockCountId,
                @LineNu,
                @ItemCode,
                @ItemName,
                @UOM,
                @BatchNumber,
                @SystemQtyAtStart,
                NULL,
                SYSDATETIME()
            );
          `);
      }

      await transaction.commit();

      return {
        status: 200,
        jsonBody: {
          success: true,
          stockCountId,
          countNumber,
          countSeqNo
        }
      };
    } catch (error) {
      try {
        if (transaction) await transaction.rollback();
      } catch {}

      context.log("startStockCount error", error);

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