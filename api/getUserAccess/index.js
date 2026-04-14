const { app } = require("@azure/functions");
const { getPool, sql } = require("../shared/db");
const { readCookie } = require("../shared/session");

app.http("getUserAccess", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    try {
      const cookieName = process.env.SESSION_COOKIE_NAME || "stn_session";
      const sessionId = readCookie(request, cookieName);

      if (!sessionId) {
        return {
          status: 401,
          jsonBody: {
            success: false,
            message: "User is not authenticated."
          }
        };
      }

      const pool = await getPool();

      const sessionResult = await pool.request()
        .input("SessionID", sql.UniqueIdentifier, sessionId)
        .query(`
          SELECT TOP 1
              s.SessionID,
              s.ExpiresOn,
              s.IsRevoked,
              u.UserID,
              u.UserEmail,
              u.IsActive
          FROM app.UserSession s
          INNER JOIN app.Users u
              ON s.UserID = u.UserID
          WHERE s.SessionID = @SessionID
        `);

      if (sessionResult.recordset.length === 0) {
        return {
          status: 401,
          jsonBody: {
            success: false,
            message: "Invalid session."
          }
        };
      }

      const sessionRow = sessionResult.recordset[0];

      if (
        sessionRow.IsRevoked ||
        !sessionRow.IsActive ||
        new Date(sessionRow.ExpiresOn) < new Date()
      ) {
        return {
          status: 401,
          jsonBody: {
            success: false,
            message: "Session expired or revoked."
          }
        };
      }

      await pool.request()
        .input("SessionID", sql.UniqueIdentifier, sessionId)
        .query(`
          UPDATE app.UserSession
          SET LastAccessOn = SYSUTCDATETIME()
          WHERE SessionID = @SessionID
        `);

      const accessResult = await pool.request()
        .input("UserEmail", sql.NVarChar(510), sessionRow.UserEmail)
        .query(`
          SELECT TOP 1
              UserEmail,
              UserName,
              HoldingName,
              UserRole,
              IsAllowedManufacturing,
              IsAllowedDistribution,
              IsActive
          FROM app.STNUserAccess
          WHERE UserEmail = @UserEmail
        `);

      if (accessResult.recordset.length === 0) {
        return {
          status: 403,
          jsonBody: {
            success: false,
            message: "User is not allowed.",
            userEmail: sessionRow.UserEmail
          }
        };
      }

      const row = accessResult.recordset[0];

      if (!row.IsActive) {
        return {
          status: 403,
          jsonBody: {
            success: false,
            message: "User is inactive.",
            userEmail: sessionRow.UserEmail
          }
        };
      }

      return {
        status: 200,
        jsonBody: {
          success: true,
          data: row
        }
      };
    } catch (error) {
      context.log("getUserAccess error", error);

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