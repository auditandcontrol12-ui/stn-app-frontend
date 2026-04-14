const { app } = require("@azure/functions");
const { getPool, sql } = require("../shared/db");
const { readCookie } = require("../shared/session");

async function getManagerAccess(pool, sessionId) {
  const result = await pool.request()
    .input("SessionID", sql.UniqueIdentifier, sessionId)
    .query(`
      SELECT TOP 1
          s.SessionID,
          s.ExpiresOn,
          s.IsRevoked,
          u.UserEmail,
          a.IsAllowedManufacturing,
          a.IsAllowedDistribution,
          a.IsManager,
          a.IsActive
      FROM app.UserSession s
      INNER JOIN app.Users u
          ON s.UserID = u.UserID
      INNER JOIN app.STNUserAccess a
          ON a.UserEmail = u.UserEmail
      WHERE s.SessionID = @SessionID
    `);

  if (result.recordset.length === 0) return null;

  const row = result.recordset[0];

  if (row.IsRevoked || !row.IsActive || new Date(row.ExpiresOn) < new Date()) {
    return null;
  }

  return row;
}

app.http("deleteSTN", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    const pool = await getPool();
    const transaction = new sql.Transaction(pool);

    try {
      const cookieName = process.env.SESSION_COOKIE_NAME || "stn_session";
      const sessionId = readCookie(request, cookieName);

      if (!sessionId) {
        return {
          status: 403,
          jsonBody: { success: false, message: "Not authorized." }
        };
      }

      const access = await getManagerAccess(pool, sessionId);

      if (!access || !access.IsManager) {
        return {
          status: 403,
          jsonBody: { success: false, message: "Manager access required." }
        };
      }

      const body = await request.json();
      const stnId = body?.stnId;

      if (!stnId) {
        return {
          status: 400,
          jsonBody: { success: false, message: "stnId is required." }
        };
      }

      const headerResult = await pool.request()
        .input("STNId", sql.BigInt, Number(stnId))
        .query(`
          SELECT TOP 1
              STNId,
              BusinessArea
          FROM app.STNHeader
          WHERE STNId = @STNId;
        `);

      if (headerResult.recordset.length === 0) {
        return {
          status: 404,
          jsonBody: { success: false, message: "STN not found." }
        };
      }

      const header = headerResult.recordset[0];

      if (
        (header.BusinessArea === "Manufacturing" && !access.IsAllowedManufacturing) ||
        (header.BusinessArea === "Distribution" && !access.IsAllowedDistribution)
      ) {
        return {
          status: 404,
          jsonBody: { success: false, message: "STN not found." }
        };
      }

      await transaction.begin();

      await new sql.Request(transaction)
        .input("STNId", sql.BigInt, Number(stnId))
        .query(`
          DELETE FROM app.STNPrintLog WHERE STNId = @STNId;
          DELETE FROM app.STNLine WHERE STNId = @STNId;
          DELETE FROM app.STNHeader WHERE STNId = @STNId;
        `);

      await transaction.commit();

      return {
        status: 200,
        jsonBody: {
          success: true,
          message: "STN deleted successfully."
        }
      };
    } catch (error) {
      try {
        if (transaction._aborted !== true) {
          await transaction.rollback();
        }
      } catch {}

      context.log("deleteSTN error", error);

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