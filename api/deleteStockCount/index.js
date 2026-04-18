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

  if (!result.recordset.length) return null;

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

app.http("deleteStockCount", {
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
      const stockCountId = Number(body?.stockCountId);

      if (!stockCountId || Number.isNaN(stockCountId)) {
        return {
          status: 400,
          jsonBody: { success: false, message: "Valid stockCountId is required." }
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

      if (!sessionUser.IsManager) {
        return {
          status: 403,
          jsonBody: { success: false, message: "Only managers can delete stock counts." }
        };
      }

      const headerResult = await pool.request()
        .input("StockCountId", sql.BigInt, stockCountId)
        .query(`
          SELECT TOP 1
              StockCountId,
              CountNumber,
              Status,
              BusinessArea,
              AssignedToUserEmail,
              AssignedToUserName,
              AssignedByEmail,
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

      if (header.IsDeleted || header.Status === "Deleted") {
        return {
          status: 400,
          jsonBody: { success: false, message: "Stock count is already deleted." }
        };
      }

      transaction = new sql.Transaction(pool);
      await transaction.begin();

      await new sql.Request(transaction)
        .input("StockCountId", sql.BigInt, stockCountId)
        .input("DeletedBy", sql.NVarChar(400), sessionUser.UserName || "")
        .input("DeletedByEmail", sql.NVarChar(510), sessionUser.UserEmail || "")
        .query(`
          UPDATE STNAPP.StockCountHeader
          SET
              Status = 'Deleted',
              IsDeleted = 1,
              DeletedBy = @DeletedBy,
              DeletedByEmail = @DeletedByEmail,
              DeletedDateTime = SYSDATETIME(),
              UpdatedBy = @DeletedBy,
              UpdatedByEmail = @DeletedByEmail,
              UpdatedDateTime = SYSDATETIME()
          WHERE StockCountId = @StockCountId;
        `);

      await transaction.commit();

      return {
        status: 200,
        jsonBody: {
          success: true,
          stockCountId
        }
      };
    } catch (error) {
      try {
        if (transaction) await transaction.rollback();
      } catch {}

      context.log("deleteStockCount error", error);

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