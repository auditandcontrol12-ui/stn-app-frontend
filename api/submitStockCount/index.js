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

app.http("submitStockCount", {
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
      const lines = Array.isArray(body?.lines) ? body.lines : [];

      if (!stockCountId || Number.isNaN(stockCountId)) {
        return {
          status: 400,
          jsonBody: { success: false, message: "Valid stockCountId is required." }
        };
      }

      if (!lines.length) {
        return {
          status: 400,
          jsonBody: { success: false, message: "At least one counted line is required." }
        };
      }

      for (const [i, line] of lines.entries()) {
        if (line.countedQty === "" || line.countedQty === null || line.countedQty === undefined) {
          return {
            status: 400,
            jsonBody: { success: false, message: `Line ${i + 1}: counted qty is required.` }
          };
        }

        if (Number(line.countedQty) < 0) {
          return {
            status: 400,
            jsonBody: { success: false, message: `Line ${i + 1}: counted qty cannot be negative.` }
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

      const headerResult = await pool.request()
        .input("StockCountId", sql.BigInt, stockCountId)
        .query(`
          SELECT TOP 1
              StockCountId,
              CountNumber,
              BusinessArea,
              Status,
              AssignedToUserEmail,
              AssignedByEmail,
              StartedByEmail,
              ManagerEmail,
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
      const currentEmail = (sessionUser.UserEmail || "").toLowerCase();
      const isAssignee = currentEmail === (header.AssignedToUserEmail || "").toLowerCase();
      const isStarter = currentEmail === (header.StartedByEmail || "").toLowerCase();

      if (!isAssignee && !isStarter && !sessionUser.IsManager) {
        return {
          status: 403,
          jsonBody: { success: false, message: "Access denied." }
        };
      }

      if (
        (header.BusinessArea === "Manufacturing" && !sessionUser.IsAllowedManufacturing && !sessionUser.IsManager) ||
        (header.BusinessArea === "Distribution" && !sessionUser.IsAllowedDistribution && !sessionUser.IsManager)
      ) {
        return {
          status: 403,
          jsonBody: { success: false, message: "Access denied for selected business area." }
        };
      }

      if (header.IsDeleted || header.Status === "Deleted") {
        return {
          status: 400,
          jsonBody: { success: false, message: "Deleted stock count cannot be submitted." }
        };
      }

      if (header.Status === "Submitted") {
        return {
          status: 400,
          jsonBody: { success: false, message: "Stock count is already submitted." }
        };
      }

      if (!["Assigned", "In Progress"].includes(header.Status)) {
        return {
          status: 400,
          jsonBody: { success: false, message: "Only assigned or in progress stock counts can be submitted." }
        };
      }

      transaction = new sql.Transaction(pool);
      await transaction.begin();

      for (const line of lines) {
        await new sql.Request(transaction)
          .input("StockCountLineId", sql.BigInt, Number(line.stockCountLineId))
          .input("CountedQty", sql.Decimal(19, 6), Number(line.countedQty))
          .query(`
            UPDATE STNAPP.StockCountLine
            SET CountedQty = @CountedQty
            WHERE StockCountLineId = @StockCountLineId;
          `);
      }

      await new sql.Request(transaction)
        .input("StockCountId", sql.BigInt, stockCountId)
        .input("SubmittedBy", sql.NVarChar(400), sessionUser.UserName || "")
        .input("SubmittedByEmail", sql.NVarChar(510), sessionUser.UserEmail || "")
        .query(`
          UPDATE STNAPP.StockCountHeader
          SET
              Status = 'Submitted',
              StartedBy = CASE WHEN StartedBy IS NULL THEN @SubmittedBy ELSE StartedBy END,
              StartedByEmail = CASE WHEN StartedByEmail IS NULL THEN @SubmittedByEmail ELSE StartedByEmail END,
              StartedDateTime = CASE WHEN StartedDateTime IS NULL THEN SYSDATETIME() ELSE StartedDateTime END,
              SubmittedBy = @SubmittedBy,
              SubmittedByEmail = @SubmittedByEmail,
              SubmittedDateTime = SYSDATETIME(),
              UpdatedBy = @SubmittedBy,
              UpdatedByEmail = @SubmittedByEmail,
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

      context.log("submitStockCount error", error);

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