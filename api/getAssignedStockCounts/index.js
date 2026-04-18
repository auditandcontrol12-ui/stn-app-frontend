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

app.http("getAssignedStockCounts", {
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
          jsonBody: { success: false, message: "Only managers can view assigned stock counts." }
        };
      }

      const url = new URL(request.url);
      const status = (url.searchParams.get("status") || "").trim();

      const allowedStatuses = ["Assigned", "In Progress", "Submitted", "Deleted"];
      const useStatusFilter = allowedStatuses.includes(status);

      const query = `
        SELECT
            H.StockCountId,
            H.CountNumber,
            H.CountSeqNo,
            H.BusinessArea,
            H.WarehouseCode,
            H.WarehouseName,
            H.Status,
            H.Remarks,
            H.ManagerEmail,

            H.AssignedToUserName,
            H.AssignedToUserEmail,
            H.AssignedBy,
            H.AssignedByEmail,
            H.AssignedDateTime,

            H.StartedBy,
            H.StartedByEmail,
            H.StartedDateTime,

            H.SubmittedBy,
            H.SubmittedByEmail,
            H.SubmittedDateTime,

            H.CreatedBy,
            H.CreatedByEmail,
            H.CreatedDateTime,

            H.UpdatedBy,
            H.UpdatedByEmail,
            H.UpdatedDateTime,

            H.DeletedBy,
            H.DeletedByEmail,
            H.DeletedDateTime,
            H.IsDeleted
        FROM STNAPP.StockCountHeader H
        WHERE
            LOWER(ISNULL(H.AssignedByEmail, '')) = LOWER(@UserEmail)
            AND (@UseStatusFilter = 0 OR H.Status = @Status)
        ORDER BY
            CASE H.Status
                WHEN 'Assigned' THEN 1
                WHEN 'In Progress' THEN 2
                WHEN 'Submitted' THEN 3
                WHEN 'Deleted' THEN 4
                ELSE 9
            END,
            ISNULL(H.UpdatedDateTime, H.CreatedDateTime) DESC,
            H.StockCountId DESC;
      `;

      const result = await pool.request()
        .input("UserEmail", sql.NVarChar(1020), sessionUser.UserEmail || "")
        .input("Status", sql.NVarChar(30), useStatusFilter ? status : null)
        .input("UseStatusFilter", sql.Bit, useStatusFilter ? 1 : 0)
        .query(query);

      const counts = {
        assigned: 0,
        inProgress: 0,
        submitted: 0,
        deleted: 0,
        total: result.recordset.length
      };

      for (const row of result.recordset) {
        if (row.Status === "Assigned") counts.assigned += 1;
        else if (row.Status === "In Progress") counts.inProgress += 1;
        else if (row.Status === "Submitted") counts.submitted += 1;
        else if (row.Status === "Deleted") counts.deleted += 1;
      }

      return {
        status: 200,
        jsonBody: {
          success: true,
          counts,
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