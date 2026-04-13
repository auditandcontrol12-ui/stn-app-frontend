const { app } = require("@azure/functions");
const { getPool, sql } = require("../shared/db");

function getClientPrincipal(request) {
  const header = request.headers.get("x-ms-client-principal");
  if (!header) return null;

  try {
    return JSON.parse(Buffer.from(header, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function getUserEmail(principal) {
  if (!principal) return null;

  const claims = principal.claims || [];
  const emailClaim =
    claims.find(c => c.typ === "preferred_username") ||
    claims.find(c => c.typ === "email");

  return emailClaim?.val || principal.userDetails || null;
}

app.http("getUserAccess", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: async (request) => {
    try {
      const principal = getClientPrincipal(request);
      const userEmail = getUserEmail(principal);

      if (!userEmail) {
        return {
          status: 401,
          jsonBody: {
            success: false,
            message: "User is not authenticated."
          }
        };
      }

      const pool = await getPool();

      const result = await pool.request()
        .input("UserEmail", sql.NVarChar(255), userEmail)
        .query(`
          SELECT TOP 1
              UserEmail,
              UserName,
              HoldingName,
              UserRole,
              IsAllowedManufacturing,
              IsAllowedDistribution,
              IsActive
          FROM app.STNUserAccess
          WHERE UserEmail = @UserEmail
        `);

      if (result.recordset.length === 0) {
        return {
          status: 403,
          jsonBody: {
            success: false,
            message: "User is not allowed.",
            userEmail
          }
        };
      }

      const row = result.recordset[0];

      if (!row.IsActive) {
        return {
          status: 403,
          jsonBody: {
            success: false,
            message: "User is inactive.",
            userEmail
          }
        };
      }

      return {
        status: 200,
        jsonBody: {
          success: true,
          data: row
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