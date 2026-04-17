const { app } = require("@azure/functions");
const { getPool, sql } = require("../shared/db");
const { readCookie } = require("../shared/session");

app.http("getMe", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    try {
      const cookieName = process.env.SESSION_COOKIE_NAME || "stn_session";
      const sessionId = readCookie(request, cookieName);

      if (!sessionId) {
        return {
          status: 401,
           headers: {
              "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
              "Pragma": "no-cache",
              "Expires": "0"
            },
          jsonBody: {
            authenticated: false
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
              s.LastAccessOn,
              u.UserID,
              u.UserEmail,
              u.UserName,
              u.HoldingName,
              u.UserRole,
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

      if (result.recordset.length === 0) {
        return {
          status: 401,
           headers: {
              "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
              "Pragma": "no-cache",
              "Expires": "0"
            },
          jsonBody: {
            authenticated: false
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
           headers: {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    "Pragma": "no-cache",
    "Expires": "0"
  },
          jsonBody: {
            authenticated: false
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
         headers: {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    "Pragma": "no-cache",
    "Expires": "0"
                  },
        jsonBody: {
          authenticated: true,
          userId: row.UserID,
          userDetails: row.UserName || "",
          email: row.UserEmail || "",
          userRoles: row.UserRole ? [row.UserRole] : [],
          user: {
            UserID: row.UserID,
            UserEmail: row.UserEmail,
            UserName: row.UserName,
            HoldingName: row.HoldingName,
            UserRole: row.UserRole,
            IsAllowedManufacturing: row.IsAllowedManufacturing,
            IsAllowedDistribution: row.IsAllowedDistribution,
            IsManager: row.IsManager,
            IsActive: row.IsActive
          }
        }
      };
    } catch (error) {
      context.log("getMe error", error);

      return {
        status: 500,
         headers: {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    "Pragma": "no-cache",
    "Expires": "0"
  },
        jsonBody: {
          authenticated: false,
          message: "Internal server error."
        }
      };
    }
  }
});