const { app } = require("@azure/functions");
const { getPool, sql } = require("../shared/db");

app.http("getUserAccess", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: async (request) => {
    try {
      const userEmail = request.query.get("email");

      if (!userEmail) {
        return {
          status: 400,
          jsonBody: {
            success: false,
            message: "Email is required"
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
          status: 404,
          jsonBody: {
            success: false,
            message: "User not found",
            userEmail
          }
        };
      }

      return {
        status: 200,
        jsonBody: {
          success: true,
          data: result.recordset[0]
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