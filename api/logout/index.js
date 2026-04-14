const { app } = require("@azure/functions");
const { getPool, sql } = require("../shared/db");
const { readCookie, buildLogoutCookie } = require("../shared/session");

app.http("logout", {
  methods: ["POST", "GET"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    try {
      const cookieName = process.env.SESSION_COOKIE_NAME || "stn_session";
      const sessionId = readCookie(request, cookieName);

      if (sessionId) {
        const pool = await getPool();

        await pool.request()
          .input("SessionID", sql.UniqueIdentifier, sessionId)
          .query(`
            UPDATE app.UserSession
            SET IsRevoked = 1
            WHERE SessionID = @SessionID
          `);
      }

      return {
        status: 200,
        headers: {
          "Set-Cookie": buildLogoutCookie()
        },
        jsonBody: {
          success: true
        }
      };
    } catch (error) {
      context.log("logout error", error);

      return {
        status: 500,
        jsonBody: {
          success: false,
          message: "Internal server error."
        }
      };
    }
  }
});