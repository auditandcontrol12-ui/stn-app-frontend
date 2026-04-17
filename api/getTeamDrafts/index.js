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

app.http("getTeamDrafts", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: async (request) => {
    try {
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

      if (!sessionUser.IsManager) {
        return {
          status: 403,
          jsonBody: { success: false, message: "Manager access required." }
        };
      }

      const area = (request.query.get("area") || "").trim();

      let areaFilterSql = "";
      if (area === "Manufacturing" || area === "Distribution") {
        areaFilterSql = " AND h.BusinessArea = @BusinessArea ";
      }

      const req = pool.request();

      if (area === "Manufacturing" || area === "Distribution") {
        req.input("BusinessArea", sql.NVarChar(200), area);
      }

      const result = await req.query(`
        SELECT
            h.STNId,
            h.STNNumber,
            h.STNSeqNo,
            h.STNType,
            h.STNDate,
            h.BusinessArea,
            h.WarehouseFrom,
            h.WarehouseTo,
            h.Status,
            h.CreatedBy,
            h.CreatedByEmail,
            h.CreatedDateTime,
            h.UpdatedBy,
            h.UpdatedByEmail,
            h.UpdatedDateTime,
            h.SubmittedDateTime,
            (
              SELECT COUNT(1)
              FROM STNAPP.STNLine l
              WHERE l.STNId = h.STNId
            ) AS LineCount
        FROM STNAPP.STNHeader h
        WHERE h.Status = 'Draft'
          AND h.IsDeleted = 0
          ${areaFilterSql}
        ORDER BY
            h.CreatedBy ASC,
            ISNULL(h.UpdatedDateTime, h.CreatedDateTime) DESC,
            h.STNId DESC;
      `);

      return {
        status: 200,
        jsonBody: {
          success: true,
          drafts: result.recordset
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