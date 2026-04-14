const { app } = require("@azure/functions");
const { getPool, sql } = require("../shared/db");

function getCookieValue(request, cookieName) {
  const cookieHeader = request.headers.get("cookie") || "";
  const cookies = cookieHeader.split(";").map(x => x.trim());

  for (const cookie of cookies) {
    const [name, ...rest] = cookie.split("=");
    if (name === cookieName) {
      return rest.join("=");
    }
  }

  return null;
}

app.http("getMe", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    try {
      const cookieName = process.env.SESSION_COOKIE_NAME || "stn_session";
      const sessionId = getCookieValue(request, cookieName);

      if (!sessionId) {
        return {
          status: 401,
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
              u.IsActive
          FROM app.UserSession s
          INNER JOIN app.Users u
              ON s.UserID = u.UserID
          WHERE s.SessionID = @SessionID
        `);

      if (result.recordset.length === 0) {
        return {
          status: 401,
          jsonBody: {
            authenticated: false
          }
        };
      }

      const row = result.recordset[0];

      if (
        row.IsRevoked ||
        !row.IsActive ||
        new Date(row.ExpiresOn) < new Date()
      ) {
        return {
          status: 401,
          jsonBody: {
            authenticated: false
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

      return {
        status: 200,
        jsonBody: {
          authenticated: true,
          userId: row.UserID,
          userDetails: row.UserName || "",
          email: row.UserEmail || "",
          userRoles: row.UserRole ? [row.UserRole] : [],
          user: {
            userId: row.UserID,
            userEmail: row.UserEmail,
            userName: row.UserName,
            holdingName: row.HoldingName,
            userRole: row.UserRole,
            isAllowedManufacturing: row.IsAllowedManufacturing,
            isAllowedDistribution: row.IsAllowedDistribution,
            isActive: row.IsActive
          }
        }
      };
    } catch (error) {
      context.log("getMe error", error);

      return {
        status: 500,
        jsonBody: {
          authenticated: false,
          message: "Internal server error."
        }
      };
    }
  }
});