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

app.http("getPendingStockCounts", {
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

      const result = await pool.request()
        .input("UserEmail", sql.NVarChar(1020), sessionUser.UserEmail || "")
        .query(`
          SELECT
              H.StockCountId,
              H.CountNumber,
              H.CountSeqNo,
              H.BusinessArea,
              H.WarehouseCode,
              H.WarehouseName,
              H.Status,
              H.Remarks,
              H.AssignedToUserName,
              H.AssignedToUserEmail,
              H.AssignedBy,
              H.AssignedByEmail,
              H.AssignedDateTime,
              H.StartedBy,
              H.StartedByEmail,
              H.StartedDateTime,
              H.CreatedBy,
              H.CreatedByEmail,
              H.CreatedDateTime
          FROM STNAPP.StockCountHeader H
          WHERE
              H.IsDeleted = 0
              AND H.Status IN ('Assigned', 'In Progress')
              AND (
                  LOWER(ISNULL(H.AssignedToUserEmail, '')) = LOWER(@UserEmail)
                  OR LOWER(ISNULL(H.StartedByEmail, '')) = LOWER(@UserEmail)
              )
          ORDER BY
              CASE H.Status
                  WHEN 'Assigned' THEN 1
                  WHEN 'In Progress' THEN 2
                  ELSE 9
              END,
              ISNULL(H.AssignedDateTime, H.CreatedDateTime) DESC,
              H.StockCountId DESC;
        `);

      return {
        status: 200,
        jsonBody: {
          success: true,
          items: result.recordset
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