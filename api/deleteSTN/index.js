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

app.http("deleteSTN", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    let transaction;

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

      const body = await request.json();
      const stnId = Number(body?.stnId);

      if (!stnId || Number.isNaN(stnId)) {
        return {
          status: 400,
          jsonBody: { success: false, message: "Valid stnId is required." }
        };
      }

      const headerResult = await pool.request()
        .input("STNId", sql.BigInt, stnId)
        .query(`
          SELECT TOP 1
              STNId,
              STNNumber,
              BusinessArea,
              Status,
              CreatedByEmail,
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
          status: 400,
          jsonBody: { success: false, message: "STN already deleted." }
        };
      }

      const isCreator =
        (sessionUser.UserEmail || "").toLowerCase() ===
        (header.CreatedByEmail || "").toLowerCase();

      const isManager = !!sessionUser.IsManager;

      if (
        (header.BusinessArea === "Manufacturing" && !sessionUser.IsAllowedManufacturing) ||
        (header.BusinessArea === "Distribution" && !sessionUser.IsAllowedDistribution)
      ) {
        return {
          status: 403,
          jsonBody: { success: false, message: "Access denied for this business area." }
        };
      }

      if (header.Status === "Draft") {
        if (!isCreator && !isManager) {
          return {
            status: 403,
            jsonBody: { success: false, message: "Only the draft creator or a manager can delete this draft." }
          };
        }
      } else if (header.Status === "Submitted") {
        if (!isManager) {
          return {
            status: 403,
            jsonBody: { success: false, message: "Only a manager can delete a submitted STN." }
          };
        }
      } else {
        return {
          status: 400,
          jsonBody: { success: false, message: `Delete is not allowed for status ${header.Status}.` }
        };
      }

      transaction = new sql.Transaction(pool);
      await transaction.begin();

      await new sql.Request(transaction)
        .input("STNId", sql.BigInt, stnId)
        .input("DeletedBy", sql.NVarChar(800), sessionUser.UserName || "")
        .input("DeletedByEmail", sql.NVarChar(1020), sessionUser.UserEmail || "")
        .query(`
          UPDATE STNAPP.STNHeader
          SET
              Status = 'Deleted',
              IsDeleted = 1,
              DeletedBy = @DeletedBy,
              DeletedByEmail = @DeletedByEmail,
              DeletedDateTime = SYSDATETIME(),
              UpdatedBy = @DeletedBy,
              UpdatedByEmail = @DeletedByEmail,
              UpdatedDateTime = SYSDATETIME()
          WHERE STNId = @STNId
            AND IsDeleted = 0;
        `);

      await transaction.commit();

      return {
        status: 200,
        jsonBody: {
          success: true,
          message: "STN deleted successfully."
        }
      };
    } catch (error) {
      try {
        if (transaction) {
          await transaction.rollback();
        }
      } catch {}

      context.log("deleteSTN error", error);

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