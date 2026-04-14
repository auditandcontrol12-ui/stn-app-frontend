const { app } = require("@azure/functions");
const { getPool, sql } = require("../shared/db");
const { readCookie } = require("../shared/session");

async function getAuthorizedAreas(pool, sessionId) {
  const result = await pool.request()
    .input("SessionID", sql.UniqueIdentifier, sessionId)
    .query(`
      SELECT TOP 1
          s.SessionID,
          s.ExpiresOn,
          s.IsRevoked,
          u.UserEmail,
          a.IsAllowedManufacturing,
          a.IsAllowedDistribution,
          a.IsActive
      FROM app.UserSession s
      INNER JOIN app.Users u
          ON s.UserID = u.UserID
      INNER JOIN app.STNUserAccess a
          ON a.UserEmail = u.UserEmail
      WHERE s.SessionID = @SessionID
    `);

  if (result.recordset.length === 0) return null;

  const row = result.recordset[0];

  if (row.IsRevoked || !row.IsActive || new Date(row.ExpiresOn) < new Date()) {
    return null;
  }

  const areas = [];
  if (row.IsAllowedManufacturing) areas.push("Manufacturing");
  if (row.IsAllowedDistribution) areas.push("Distribution");
  return areas;
}

app.http("getSTNBySeq", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: async (request) => {
    try {
      const seqNo = request.query.get("seqNo");

      if (!seqNo) {
        return {
          status: 400,
          jsonBody: { success: false, message: "seqNo is required." }
        };
      }

      const cookieName = process.env.SESSION_COOKIE_NAME || "stn_session";
      const sessionId = readCookie(request, cookieName);

      if (!sessionId) {
        return {
          status: 404,
          jsonBody: { success: false, message: "No data found." }
        };
      }

      const pool = await getPool();
      const allowedAreas = await getAuthorizedAreas(pool, sessionId);

      if (!allowedAreas || allowedAreas.length === 0) {
        return {
          status: 404,
          jsonBody: { success: false, message: "No data found." }
        };
      }

      const headerResult = await pool.request()
        .input("STNSeqNo", sql.Int, Number(seqNo))
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
              SubmittedDateTime
          FROM app.STNHeader
          WHERE STNSeqNo = @STNSeqNo
          ORDER BY STNId DESC;
        `);

      if (headerResult.recordset.length === 0) {
        return {
          status: 404,
          jsonBody: { success: false, message: "No data found." }
        };
      }

      const header = headerResult.recordset[0];

      if (!allowedAreas.includes(header.BusinessArea)) {
        return {
          status: 404,
          jsonBody: { success: false, message: "No data found." }
        };
      }

      const lineResult = await pool.request()
        .input("STNId", sql.BigInt, Number(header.STNId))
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
          FROM app.STNLine
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