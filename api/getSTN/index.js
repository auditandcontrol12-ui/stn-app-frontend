const { app } = require("@azure/functions");
const { getPool, sql } = require("../shared/db");

app.http("getSTN", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: async (request) => {
    try {
      const stnId = request.query.get("stnId");

      if (!stnId) {
        return {
          status: 400,
          jsonBody: { success: false, message: "stnId is required." }
        };
      }

      const pool = await getPool();

      const headerResult = await pool.request()
        .input("STNId", sql.BigInt, Number(stnId))
        .query(`
          SELECT TOP 1
              STNId,
              STNNumber,
              STNSeqNo,
              STNType,
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
          WHERE STNId = @STNId;
        `);

      if (headerResult.recordset.length === 0) {
        return {
          status: 404,
          jsonBody: { success: false, message: "STN not found." }
        };
      }

      const lineResult = await pool.request()
        .input("STNId", sql.BigInt, Number(stnId))
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
          header: headerResult.recordset[0],
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