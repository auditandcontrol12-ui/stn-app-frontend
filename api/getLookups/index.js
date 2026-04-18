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

app.http("getLookups", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    try {
      const url = new URL(request.url);
      const area = (url.searchParams.get("area") || "").trim();
      const mode = (url.searchParams.get("mode") || "").trim();

      const cookieName = process.env.SESSION_COOKIE_NAME || "stn_session";
      const sessionId = readCookie(request, cookieName);

      if (!sessionId) {
        return {
          status: 401,
          jsonBody: {
            success: false,
            message: "Unauthorized."
          }
        };
      }

      const pool = await getPool();
      const sessionUser = await getSessionUser(pool, sessionId);

      if (!sessionUser) {
        return {
          status: 401,
          jsonBody: {
            success: false,
            message: "Unauthorized."
          }
        };
      }

      if (mode === "assignableUsers") {
        if (!sessionUser.IsManager) {
          return {
            status: 403,
            jsonBody: {
              success: false,
              message: "Only managers can view assignable users."
            }
          };
        }

        const usersResult = await pool.request()
          .input("CurrentUserEmail", sql.NVarChar(1020), sessionUser.UserEmail || "")
          .query(`
            SELECT
                UserEmail,
                UserName,
                HoldingName,
                UserRole,
                IsAllowedManufacturing,
                IsAllowedDistribution,
                IsActive,
                IsManager
            FROM STNAPP.Users
            WHERE
                IsActive = 1
                AND ISNULL(IsDeleted, 0) = 0
                AND ISNULL(IsManager, 0) = 0
                AND LOWER(UserEmail) <> LOWER(@CurrentUserEmail)
            ORDER BY UserName, UserEmail;
          `);

        return {
          status: 200,
          jsonBody: {
            success: true,
            mode: "assignableUsers",
            users: usersResult.recordset
          }
        };
      }

      if (!area || !["Distribution", "Manufacturing"].includes(area)) {
        return {
          status: 400,
          jsonBody: {
            success: false,
            message: "Valid area is required."
          }
        };
      }

      if (
        (area === "Manufacturing" && !sessionUser.IsAllowedManufacturing) ||
        (area === "Distribution" && !sessionUser.IsAllowedDistribution)
      ) {
        return {
          status: 403,
          jsonBody: {
            success: false,
            message: "Access denied for selected business area."
          }
        };
      }

      let itemQuery = "";
      let whsQuery = "";

      if (area === "Distribution") {
        itemQuery = `
          SELECT
              ItemCode,
              ItemName,
              UOM
          FROM stnapp.FactItemAttributeDist
          WHERE IsActive = 1
          ORDER BY ItemCode;
        `;

        whsQuery = `
          SELECT
              WhsCode,
              WhsName,
              Branch,
              Location,
              WhsType
          FROM stnapp.FactWhsAttributeDist
          WHERE IsActive = 1
          ORDER BY WhsCode;
        `;
      } else {
        itemQuery = `
          SELECT
              ItemCode,
              ItemName,
              UOM
          FROM stnapp.FactItemAttributeManu
          WHERE IsActive = 1
          ORDER BY ItemCode;
        `;

        whsQuery = `
          SELECT
              WhsCode,
              WhsName,
              Branch,
              Location,
              WhsType
          FROM stnapp.FactWhsAttributeManu
          WHERE IsActive = 1
          ORDER BY WhsCode;
        `;
      }

      const itemResult = await pool.request().query(itemQuery);
      const whsResult = await pool.request().query(whsQuery);

      return {
        status: 200,
        jsonBody: {
          success: true,
          area,
          items: itemResult.recordset,
          warehouses: whsResult.recordset
        }
      };
    } catch (error) {
      context.log("getLookups error", error);

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