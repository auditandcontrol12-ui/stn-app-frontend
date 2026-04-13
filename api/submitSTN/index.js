const { app } = require("@azure/functions");
const { getPool, sql } = require("../shared/db");

function buildSTNNumber(stnType, warehouseFrom, warehouseTo, seqNo) {
  const fromPart = warehouseFrom === "__OTHER__" ? "OTHER" : (warehouseFrom || "NA");
  const toPart = warehouseTo === "__OTHER__" ? "OTHER" : (warehouseTo || "NA");
  return `STN-${stnType}-${fromPart}-${toPart}-${seqNo}`;
}

app.http("submitSTN", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (request) => {
    const pool = await getPool();
    const transaction = new sql.Transaction(pool);

    try {
      const body = await request.json();

      if (!body) {
        return {
          status: 400,
          jsonBody: { success: false, message: "Request body is required." }
        };
      }

      const {
        stnType,
        businessArea,
        stnDate,
        warehouseFrom,
        warehouseTo,
        warehouseFromCustom,
        warehouseToCustom,
        remarks,
        createdBy,
        createdByEmail,
        status,
        lines
      } = body;

      if (!stnType) {
        return { status: 400, jsonBody: { success: false, message: "STN Type is required." } };
      }

      if (!businessArea) {
        return { status: 400, jsonBody: { success: false, message: "Business Area is required." } };
      }

      if (!createdByEmail) {
        return { status: 400, jsonBody: { success: false, message: "CreatedByEmail is required." } };
      }

      if (!warehouseFrom) {
        return { status: 400, jsonBody: { success: false, message: "Warehouse From is required." } };
      }

      if (!warehouseTo) {
        return { status: 400, jsonBody: { success: false, message: "Warehouse To is required." } };
      }

      if (!Array.isArray(lines) || lines.length === 0) {
        return { status: 400, jsonBody: { success: false, message: "At least one line is required." } };
      }

      for (const line of lines) {
        if (!line.itemCode) {
          return {
            status: 400,
            jsonBody: { success: false, message: `Line ${line.lineNu}: ItemCode is required.` }
          };
        }

        if (!line.qty || Number(line.qty) <= 0) {
          return {
            status: 400,
            jsonBody: { success: false, message: `Line ${line.lineNu}: Qty must be greater than 0.` }
          };
        }
      }

      await transaction.begin();

      const seqResult = await new sql.Request(transaction).query(`
        UPDATE app.STNSequence
        SET LastNumber = LastNumber + 1
        OUTPUT INSERTED.LastNumber AS NewSeqNo
        WHERE SequenceId = (SELECT TOP 1 SequenceId FROM app.STNSequence ORDER BY SequenceId);
      `);

      const stnSeqNo = seqResult.recordset[0].NewSeqNo;
      const stnNumber = buildSTNNumber(stnType, warehouseFrom, warehouseTo, stnSeqNo);

      const headerResult = await new sql.Request(transaction)
        .input("STNNumber", sql.NVarChar(100), stnNumber)
        .input("STNSeqNo", sql.Int, stnSeqNo)
        .input("STNType", sql.NVarChar(10), stnType)
        .input("STNDate", sql.Date, stnDate)
        .input("WarehouseFrom", sql.NVarChar(100), warehouseFrom)
        .input("WarehouseTo", sql.NVarChar(100), warehouseTo)
        .input("WarehouseFromCustom", sql.NVarChar(200), warehouseFromCustom || null)
        .input("WarehouseToCustom", sql.NVarChar(200), warehouseToCustom || null)
        .input("Remarks", sql.NVarChar(500), remarks || null)
        .input("Status", sql.NVarChar(30), status || "Submitted")
        .input("CreatedBy", sql.NVarChar(200), createdBy || "")
        .input("CreatedByEmail", sql.NVarChar(255), createdByEmail)
        .query(`
          INSERT INTO app.STNHeader
          (
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
          )
          OUTPUT INSERTED.STNId
          VALUES
          (
              @STNNumber,
              @STNSeqNo,
              @STNType,
              @STNDate,
              @WarehouseFrom,
              @WarehouseTo,
              @WarehouseFromCustom,
              @WarehouseToCustom,
              @Remarks,
              @Status,
              @CreatedBy,
              @CreatedByEmail,
              SYSDATETIME(),
              SYSDATETIME()
          );
        `);

      const stnId = headerResult.recordset[0].STNId;

      for (const line of lines) {
        await new sql.Request(transaction)
          .input("STNId", sql.BigInt, stnId)
          .input("LineNu", sql.Int, Number(line.lineNu))
          .input("ItemCode", sql.NVarChar(100), line.itemCode)
          .input("ItemName", sql.NVarChar(300), line.itemName || "")
          .input("UOM", sql.NVarChar(50), line.uom || "")
          .input("BatchNumber", sql.NVarChar(100), line.batchNumber || null)
          .input("Qty", sql.Decimal(19, 6), Number(line.qty))
          .input("LineRemarks", sql.NVarChar(500), line.lineRemarks || null)
          .query(`
            INSERT INTO app.STNLine
            (
                STNId,
                LineNu,
                ItemCode,
                ItemName,
                UOM,
                BatchNumber,
                Qty,
                LineRemarks,
                CreatedDateTime
            )
            VALUES
            (
                @STNId,
                @LineNu,
                @ItemCode,
                @ItemName,
                @UOM,
                @BatchNumber,
                @Qty,
                @LineRemarks,
                SYSDATETIME()
            );
          `);
      }

      await transaction.commit();

      return {
        status: 200,
        jsonBody: {
          success: true,
          stnId,
          stnNumber,
          stnSeqNo
        }
      };
    } catch (error) {
      try {
        if (transaction._aborted !== true) {
          await transaction.rollback();
        }
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