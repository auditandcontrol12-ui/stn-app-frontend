const { app } = require("@azure/functions");
const { getPool, sql } = require("../shared/db");
const { generateOtp, getOtpExpiry } = require("../shared/otp");
const { sendOtpEmail } = require("../shared/mail");

app.http("requestOtp", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    try {
      const body = await request.json();
      const email = (body?.email || "").trim().toLowerCase();

      if (!email) {
        return {
          status: 400,
          jsonBody: {
            success: false,
            message: "Email is required."
          }
        };
      }

      const pool = await getPool();

      const userResult = await pool.request()
        .input("UserEmail", sql.NVarChar(510), email)
        .query(`
          SELECT TOP 1
              UserEmail,
              UserName,
              IsActive
          FROM app.STNUserAccess
          WHERE LOWER(UserEmail) = @UserEmail
        `);

      if (userResult.recordset.length === 0 || !userResult.recordset[0].IsActive) {
        return {
          status: 404,
          jsonBody: {
            success: false,
            message: "User not found or inactive."
          }
        };
      }

      const user = userResult.recordset[0];
      const otp = generateOtp();
      const expiresOn = getOtpExpiry();

      await pool.request()
        .input("UserEmail", sql.NVarChar(510), email)
        .query(`
          UPDATE app.UserOTP
          SET IsUsed = 1
          WHERE LOWER(UserEmail) = @UserEmail
            AND IsUsed = 0
        `);

      await pool.request()
        .input("UserEmail", sql.NVarChar(510), email)
        .input("OTPCode", sql.NVarChar(20), otp)
        .input("ExpiresOn", sql.DateTime2, expiresOn)
        .query(`
          INSERT INTO app.UserOTP (
              UserEmail,
              OTPCode,
              ExpiresOn,
              IsUsed,
              CreatedOn
          )
          VALUES (
              @UserEmail,
              @OTPCode,
              @ExpiresOn,
              0,
              SYSUTCDATETIME()
          )
        `);

      await sendOtpEmail(email, otp, user.UserName);

      return {
        status: 200,
        jsonBody: {
          success: true,
          message: "OTP sent successfully."
        }
      };
    } catch (error) {
      context.log("requestOtp error", error);

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