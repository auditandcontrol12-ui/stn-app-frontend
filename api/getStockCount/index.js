const { app } = require("@azure/functions");
const { getPool, sql } = require("../shared/db");
const { readCookie } = require("../shared/session");

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

app.http("getStockCount", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: async (request) => {
    try {
      const stockCountId = Number(request.query.get("stockCountId"));

      if (!stockCountId || Number.isNaN(stockCountId)) {
        return {
          status: 400,
          jsonBody: { success: false, message: "Valid stockCountId is required." }
        };
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

      const headerResult = await pool.request()
        .input("StockCountId", sql.BigInt, stockCountId)
        .query(`
          SELECT TOP 1
              StockCountId,
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
              SubmittedBy,
              SubmittedByEmail,
              SubmittedDateTime,
              UpdatedBy,
              UpdatedByEmail,
              UpdatedDateTime,
              DeletedBy,
              DeletedByEmail,
              DeletedDateTime,
              IsDeleted
          FROM STNAPP.StockCountHeader
          WHERE StockCountId = @StockCountId;
        `);

      if (!headerResult.recordset.length) {
        return {
          status: 404,
          jsonBody: { success: false, message: "Stock count not found." }
        };
      }

      const header = headerResult.recordset[0];

      if (header.IsDeleted) {
        return {
          status: 404,
          jsonBody: { success: false, message: "Stock count not found." }
        };
      }

      const isCreator =
        (sessionUser.UserEmail || "").toLowerCase() ===
        (header.CreatedByEmail || "").toLowerCase();

      if (!isCreator && !sessionUser.IsManager) {
        return {
          status: 403,
          jsonBody: { success: false, message: "Access denied." }
        };
      }

      const lineResult = await pool.request()
        .input("StockCountId", sql.BigInt, stockCountId)
        .query(`
          SELECT
              StockCountLineId,
              StockCountId,
              LineNu,
              ItemCode,
              ItemName,
              UOM,
              BatchNumber,
              SystemQtyAtStart,
              CountedQty,
              VarianceQty,
              CreatedDateTime
          FROM STNAPP.StockCountLine
          WHERE StockCountId = @StockCountId
          ORDER BY LineNu;
        `);

      return {
        status: 200,
        jsonBody: {
          success: true,
          header,
          lines: lineResult.recordset
        }
      };
    } catch (error) {
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