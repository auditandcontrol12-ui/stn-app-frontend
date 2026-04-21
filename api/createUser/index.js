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
          u.IsSuperUser,
          u.IsActive,
          u.IsDeleted
      FROM STNAPP.UserSession s
      INNER JOIN STNAPP.Users u
          ON s.UserID = u.UserID
      WHERE s.SessionID = @SessionID;
    `);

  if (!result.recordset.length) return null;

  const row = result.recordset[0];

  if (row.IsRevoked || !row.IsActive || row.IsDeleted || new Date(row.ExpiresOn) < new Date()) {
    return null;
  }

  return row;
}

app.http("createUser", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (request) => {
    try {
      const cookieName = process.env.SESSION_COOKIE_NAME || "stn_session";
      const sessionId = readCookie(request, cookieName);
      if (!sessionId) {
        return { status: 401, jsonBody: { success: false, message: "Unauthorized." } };
      }

      const pool = await getPool();
      const sessionUser = await getSessionUser(pool, sessionId);
      if (!sessionUser || !sessionUser.IsSuperUser) {
        return { status: 403, jsonBody: { success: false, message: "Only super user can create users." } };
      }

      const body = await request.json();
      const {
        UserEmail,
        UserName,
        HoldingName,
        UserRole,
        IsAllowedManufacturing,
        IsAllowedDistribution,
        IsManager,
        IsSuperUser,
        IsActive
      } = body || {};

      if (!UserEmail || !UserName) {
        return { status: 400, jsonBody: { success: false, message: "UserEmail and UserName are required." } };
      }

      const existing = await pool.request()
        .input("UserEmail", sql.NVarChar(255), UserEmail)
        .query(`
          SELECT TOP 1 UserID
          FROM STNAPP.Users
          WHERE LOWER(UserEmail) = LOWER(@UserEmail);
        `);

      if (existing.recordset.length) {
        return { status: 400, jsonBody: { success: false, message: "User email already exists." } };
      }

      const result = await pool.request()
        .input("UserEmail", sql.NVarChar(255), UserEmail)
        .input("UserName", sql.NVarChar(255), UserName)
        .input("HoldingName", sql.NVarChar(255), HoldingName || "Maggadit Holding")
        .input("UserRole", sql.NVarChar(255), UserRole || "Supervisor")
        .input("IsAllowedManufacturing", sql.Bit, !!IsAllowedManufacturing)
        .input("IsAllowedDistribution", sql.Bit, !!IsAllowedDistribution)
        .input("IsActive", sql.Bit, IsActive === false ? 0 : 1)
        .input("IsManager", sql.Bit, !!IsManager)
        .input("IsSuperUser", sql.Bit, !!IsSuperUser)
        .input("CreatedBy", sql.NVarChar(255), sessionUser.UserEmail)
        .query(`
          INSERT INTO STNAPP.Users
          (
              UserEmail,
              UserName,
              HoldingName,
              UserRole,
              IsAllowedManufacturing,
              IsAllowedDistribution,
              IsActive,
              IsManager,
              CreatedOn,
              CreatedBy,
              IsDeleted,
              IsSuperUser
          )
          OUTPUT INSERTED.UserID
          VALUES
          (
              @UserEmail,
              @UserName,
              @HoldingName,
              @UserRole,
              @IsAllowedManufacturing,
              @IsAllowedDistribution,
              @IsActive,
              @IsManager,
              SYSDATETIME(),
              @CreatedBy,
              0,
              @IsSuperUser
          );
        `);

      return {
        status: 200,
        jsonBody: {
          success: true,
          UserID: result.recordset[0].UserID
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