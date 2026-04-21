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
              u.HoldingName,
              u.UserRole,
              u.IsAllowedManufacturing,
              u.IsAllowedDistribution,
              u.IsManager,
              u.IsSuperUser,
              u.IsActive,
              u.IsDeleted
          FROM STNAPP.UserSession s
          INNER JOIN STNAPP.Users u
              ON s.UserID = u.UserID
          WHERE s.SessionID = @SessionID;
        `);

      if (result.recordset.length === 0) {
        return {
          status: 401,
          jsonBody: {
            success: false,
            message: "Invalid session."
          }
        };
      }

      const row = result.recordset[0];

      if (
        row.IsRevoked ||
        !row.IsActive ||
        row.IsDeleted ||
        new Date(row.ExpiresOn) < new Date()
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
          UPDATE STNAPP.UserSession
          SET LastAccessOn = SYSUTCDATETIME()
          WHERE SessionID = @SessionID;
        `);

      return {
        status: 200,
        jsonBody: {
          success: true,
          data: {
            UserID: row.UserID,
            UserEmail: row.UserEmail,
            UserName: row.UserName,
            HoldingName: row.HoldingName,
            UserRole: row.UserRole,
            IsAllowedManufacturing: row.IsAllowedManufacturing,
            IsAllowedDistribution: row.IsAllowedDistribution,
            IsManager: row.IsManager,
            IsSuperUser: row.IsSuperUser,
            IsActive: row.IsActive
          }
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