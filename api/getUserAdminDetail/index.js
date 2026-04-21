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
          u.IsSuperUser,
          u.IsActive,
          u.IsDeleted
      FROM STNAPP.UserSession s
      INNER JOIN STNAPP.Users u ON s.UserID = u.UserID
      WHERE s.SessionID = @SessionID;
    `);

  if (!result.recordset.length) return null;
  const row = result.recordset[0];
  if (row.IsRevoked || !row.IsActive || row.IsDeleted || new Date(row.ExpiresOn) < new Date()) return null;
  return row;
}

app.http("getUserAdminDetail", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: async (request) => {
    try {
      const sessionId = readCookie(request, process.env.SESSION_COOKIE_NAME || "stn_session");
      if (!sessionId) {
        return { status: 401, jsonBody: { success: false, message: "Unauthorized." } };
      }

      const pool = await getPool();
      const sessionUser = await getSessionUser(pool, sessionId);
      if (!sessionUser || !sessionUser.IsSuperUser) {
        return { status: 403, jsonBody: { success: false, message: "Only super user can view detail." } };
      }

      const url = new URL(request.url);
      const userId = Number(url.searchParams.get("userId") || 0);

      if (!userId) {
        return { status: 400, jsonBody: { success: false, message: "userId is required." } };
      }

      const userResult = await pool.request()
        .input("UserID", sql.BigInt, userId)
        .query(`
          SELECT TOP 1
              UserID,
              UserEmail,
              UserName,
              HoldingName,
              UserRole,
              IsAllowedManufacturing,
              IsAllowedDistribution,
              IsManager,
              IsSuperUser,
              IsActive
          FROM STNAPP.Users
          WHERE UserID = @UserID
            AND ISNULL(IsDeleted, 0) = 0;
        `);

      if (!userResult.recordset.length) {
        return { status: 404, jsonBody: { success: false, message: "User not found." } };
      }

      const warehousesResult = await pool.request().query(`
        SELECT
            WarehouseId,
            BusinessArea,
            WarehouseCode,
            WarehouseName,
            IsActive
        FROM STNAPP.Warehouse
        WHERE IsActive = 1
        ORDER BY BusinessArea, WarehouseCode;
      `);

      const accessResult = await pool.request()
        .input("UserID", sql.BigInt, userId)
        .query(`
          SELECT
              BusinessArea,
              WarehouseCode,
              AllowInboundTo,
              AllowOutboundFrom,
              IsActive
          FROM STNAPP.UserWarehouseAccess
          WHERE UserId = @UserID
            AND IsActive = 1;
        `);

      return {
        status: 200,
        jsonBody: {
          success: true,
          user: userResult.recordset[0],
          warehouses: warehousesResult.recordset,
          accessRows: accessResult.recordset
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