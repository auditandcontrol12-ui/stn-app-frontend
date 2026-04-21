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

app.http("saveUserAccess", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (request) => {
    let transaction;

    try {
      const sessionId = readCookie(request, process.env.SESSION_COOKIE_NAME || "stn_session");
      if (!sessionId) {
        return { status: 401, jsonBody: { success: false, message: "Unauthorized." } };
      }

      const pool = await getPool();
      const sessionUser = await getSessionUser(pool, sessionId);
      if (!sessionUser || !sessionUser.IsSuperUser) {
        return { status: 403, jsonBody: { success: false, message: "Only super user can save user access." } };
      }

      const body = await request.json();
      const {
        UserID,
        UserName,
        HoldingName,
        UserRole,
        IsAllowedManufacturing,
        IsAllowedDistribution,
        IsManager,
        IsSuperUser,
        IsActive,
        WarehouseAccessRows
      } = body || {};

      if (!UserID) {
        return { status: 400, jsonBody: { success: false, message: "UserID is required." } };
      }

      transaction = new sql.Transaction(pool);
      await transaction.begin();

      await new sql.Request(transaction)
        .input("UserID", sql.BigInt, UserID)
        .input("UserName", sql.NVarChar(255), UserName || "")
        .input("HoldingName", sql.NVarChar(255), HoldingName || "")
        .input("UserRole", sql.NVarChar(255), UserRole || "")
        .input("IsAllowedManufacturing", sql.Bit, !!IsAllowedManufacturing)
        .input("IsAllowedDistribution", sql.Bit, !!IsAllowedDistribution)
        .input("IsManager", sql.Bit, !!IsManager)
        .input("IsSuperUser", sql.Bit, !!IsSuperUser)
        .input("IsActive", sql.Bit, !!IsActive)
        .input("UpdatedBy", sql.NVarChar(255), sessionUser.UserEmail)
        .query(`
          UPDATE STNAPP.Users
          SET
              UserName = @UserName,
              HoldingName = @HoldingName,
              UserRole = @UserRole,
              IsAllowedManufacturing = @IsAllowedManufacturing,
              IsAllowedDistribution = @IsAllowedDistribution,
              IsManager = @IsManager,
              IsSuperUser = @IsSuperUser,
              IsActive = @IsActive,
              UpdatedOn = SYSDATETIME(),
              UpdatedBy = @UpdatedBy
          WHERE UserID = @UserID;
        `);

      await new sql.Request(transaction)
        .input("UserID", sql.BigInt, UserID)
        .query(`
          DELETE FROM STNAPP.UserWarehouseAccess
          WHERE UserId = @UserID;
        `);

      if (!IsSuperUser && Array.isArray(WarehouseAccessRows)) {
        for (const row of WarehouseAccessRows) {
          const allowInbound = !!row.AllowInboundTo;
          const allowOutbound = !!row.AllowOutboundFrom;

          if (!allowInbound && !allowOutbound) {
            continue;
          }

          await new sql.Request(transaction)
            .input("UserID", sql.BigInt, UserID)
            .input("BusinessArea", sql.NVarChar(100), row.BusinessArea)
            .input("WarehouseCode", sql.NVarChar(100), row.WarehouseCode)
            .input("AllowInboundTo", sql.Bit, allowInbound)
            .input("AllowOutboundFrom", sql.Bit, allowOutbound)
            .input("CreatedBy", sql.NVarChar(255), sessionUser.UserEmail)
            .query(`
              INSERT INTO STNAPP.UserWarehouseAccess
              (
                  UserId,
                  BusinessArea,
                  WarehouseCode,
                  AllowInboundTo,
                  AllowOutboundFrom,
                  IsActive,
                  CreatedDateTime,
                  CreatedBy
              )
              VALUES
              (
                  @UserID,
                  @BusinessArea,
                  @WarehouseCode,
                  @AllowInboundTo,
                  @AllowOutboundFrom,
                  1,
                  SYSDATETIME(),
                  @CreatedBy
              );
            `);
        }
      }

      await transaction.commit();

      return {
        status: 200,
        jsonBody: {
          success: true
        }
      };
    } catch (error) {
      try {
        if (transaction) await transaction.rollback();
      } catch {}

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