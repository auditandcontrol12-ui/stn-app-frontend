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
          u.IsAllowedManufacturing,
          u.IsAllowedDistribution,
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

app.http("getLookups", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: async (request) => {
    try {
      const area = request.query.get("area");
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

      if (!area || !["Distribution", "Manufacturing"].includes(area)) {
        return {
          status: 400,
          jsonBody: {
            success: false,
            message: "Valid area is required."
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
          FROM dist.FactCustomItemAttribute
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
          FROM dist.FactCustomWhsAttributes
          WHERE IsActive = 1
          ORDER BY WhsCode;
        `;
      } else {
        itemQuery = `
          SELECT
              ItemCode,
              ItemName,
              UOM
          FROM manu.FactCustomItemAttribute
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
          FROM manu.FactCustomWhsAttributes
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