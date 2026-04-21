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

app.http("updateWarehouse", {
  methods: ["POST"],
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
        return { status: 403, jsonBody: { success: false, message: "Only super user can update warehouse." } };
      }

      const body = await request.json();
      const { WarehouseId, WarehouseName, IsActive } = body || {};

      if (!WarehouseId || !WarehouseName) {
        return { status: 400, jsonBody: { success: false, message: "WarehouseId and WarehouseName are required." } };
      }

      await pool.request()
        .input("WarehouseId", sql.BigInt, WarehouseId)
        .input("WarehouseName", sql.NVarChar(400), WarehouseName)
        .input("IsActive", sql.Bit, !!IsActive)
        .input("UpdatedBy", sql.NVarChar(255), sessionUser.UserEmail)
        .query(`
          UPDATE STNAPP.Warehouse
          SET
              WarehouseName = @WarehouseName,
              IsActive = @IsActive,
              UpdatedDateTime = SYSDATETIME(),
              UpdatedBy = @UpdatedBy
          WHERE WarehouseId = @WarehouseId;
        `);

      return {
        status: 200,
        jsonBody: {
          success: true
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