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

  const allowedAreas = [];
  if (row.IsAllowedManufacturing) allowedAreas.push("Manufacturing");
  if (row.IsAllowedDistribution) allowedAreas.push("Distribution");

  return {
    userId: row.UserID,
    userEmail: row.UserEmail,
    userName: row.UserName,
    allowedAreas
  };
}

app.http("getSTN", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: async (request) => {
    try {
      const stnId = Number(request.query.get("stnId"));

      if (!stnId || Number.isNaN(stnId)) {
        return {
          status: 400,
          jsonBody: { success: false, message: "Valid stnId is required." }
        };
      }

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

      if (!sessionUser || sessionUser.allowedAreas.length === 0) {
        return {
          status: 403,
          jsonBody: { success: false, message: "Access denied." }
        };
      }

      const headerResult = await pool.request()
        .input("STNId", sql.BigInt, stnId)
        .query(`
          SELECT TOP 1
              STNId,
              STNNumber,
              STNSeqNo,
              STNType,
              BusinessArea,
              STNDate,
              WarehouseFrom,
              WarehouseTo,
              WarehouseFromCustom,
              WarehouseToCustom,
              Remarks,
              Status,
              CreatedBy,
              CreatedByEmail,
              CreatedDateTime,
              UpdatedBy,
              UpdatedByEmail,
              UpdatedDateTime,
              SubmittedBy,
              SubmittedByEmail,
              SubmittedDateTime,
              DeletedBy,
              DeletedByEmail,
              DeletedDateTime,
              IsDeleted
          FROM STNAPP.STNHeader
          WHERE STNId = @STNId;
        `);

      if (headerResult.recordset.length === 0) {
        return {
          status: 404,
          jsonBody: { success: false, message: "STN not found." }
        };
      }

      const header = headerResult.recordset[0];

      if (header.IsDeleted) {
        return {
          status: 404,
          jsonBody: { success: false, message: "STN not found." }
        };
      }

      if (!sessionUser.allowedAreas.includes(header.BusinessArea)) {
        return {
          status: 403,
          jsonBody: { success: false, message: "Access denied." }
        };
      }

      const lineResult = await pool.request()
        .input("STNId", sql.BigInt, stnId)
        .query(`
          SELECT
              STNLineId,
              STNId,
              LineNu,
              ItemCode,
              ItemName,
              UOM,
              BatchNumber,
              Qty,
              LineRemarks,
              CreatedDateTime
          FROM STNAPP.STNLine
          WHERE STNId = @STNId
          ORDER BY LineNu;
        `);

      return {
        status: 200,
        jsonBody: {
          success: true,
          header,
          lines: lineResult.recordset
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