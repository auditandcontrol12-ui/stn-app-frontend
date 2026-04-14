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
  handler: async (request, context) => {
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
        stnId,
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

      if (!["Draft", "Submitted"].includes(status)) {
        return { status: 400, jsonBody: { success: false, message: "Status must be Draft or Submitted." } };
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

      let finalStnId = null;
      let finalStnSeqNo = null;
      let finalStnNumber = null;

      if (stnId) {
        const existingResult = await new sql.Request(transaction)
          .input("STNId", sql.BigInt, Number(stnId))
          .query(`
            SELECT TOP 1
                STNId,
                STNNumber,
                STNSeqNo
            FROM app.STNHeader
            WHERE STNId = @STNId;
          `);

        if (existingResult.recordset.length === 0) {
          await transaction.rollback();
          return {
            status: 404,
            jsonBody: { success: false, message: "Existing STN not found for update." }
          };
        }

        finalStnId = existingResult.recordset[0].STNId;
        finalStnSeqNo = existingResult.recordset[0].STNSeqNo;
        finalStnNumber = existingResult.recordset[0].STNNumber;

        await new sql.Request(transaction)
          .input("STNId", sql.BigInt, Number(stnId))
          .input("STNType", sql.NVarChar(20), stnType)
          .input("BusinessArea", sql.NVarChar(50), businessArea)
          .input("STNDate", sql.Date, stnDate)
          .input("WarehouseFrom", sql.NVarChar(200), warehouseFrom)
          .input("WarehouseTo", sql.NVarChar(200), warehouseTo)
          .input("WarehouseFromCustom", sql.NVarChar(400), warehouseFromCustom || null)
          .input("WarehouseToCustom", sql.NVarChar(400), warehouseToCustom || null)
          .input("Remarks", sql.NVarChar(1000), remarks || null)
          .input("Status", sql.NVarChar(60), status)
          .input("CreatedBy", sql.NVarChar(400), createdBy || "")
          .input("CreatedByEmail", sql.NVarChar(510), createdByEmail)
          .query(`
            UPDATE app.STNHeader
            SET
                STNType = @STNType,
                BusinessArea = @BusinessArea,
                STNDate = @STNDate,
                WarehouseFrom = @WarehouseFrom,
                WarehouseTo = @WarehouseTo,
                WarehouseFromCustom = @WarehouseFromCustom,
                WarehouseToCustom = @WarehouseToCustom,
                Remarks = @Remarks,
                Status = @Status,
                CreatedBy = @CreatedBy,
                CreatedByEmail = @CreatedByEmail,
                SubmittedDateTime = CASE WHEN @Status = 'Submitted' THEN SYSDATETIME() ELSE NULL END
            WHERE STNId = @STNId;
          `);

        await new sql.Request(transaction)
          .input("STNId", sql.BigInt, Number(stnId))
          .query(`
            DELETE FROM app.STNLine
            WHERE STNId = @STNId;
          `);
      } else {
        const seqResult = await new sql.Request(transaction).query(`
          UPDATE app.STNSequence
          SET LastNumber = LastNumber + 1
          OUTPUT INSERTED.LastNumber AS NewSeqNo
          WHERE SequenceId = (SELECT TOP 1 SequenceId FROM app.STNSequence ORDER BY SequenceId);
        `);

        finalStnSeqNo = seqResult.recordset[0].NewSeqNo;
        finalStnNumber = buildSTNNumber(stnType, warehouseFrom, warehouseTo, finalStnSeqNo);

        const headerResult = await new sql.Request(transaction)
          .input("STNNumber", sql.NVarChar(200), finalStnNumber)
          .input("STNSeqNo", sql.Int, finalStnSeqNo)
          .input("STNType", sql.NVarChar(20), stnType)
          .input("BusinessArea", sql.NVarChar(50), businessArea)
          .input("STNDate", sql.Date, stnDate)
          .input("WarehouseFrom", sql.NVarChar(200), warehouseFrom)
          .input("WarehouseTo", sql.NVarChar(200), warehouseTo)
          .input("WarehouseFromCustom", sql.NVarChar(400), warehouseFromCustom || null)
          .input("WarehouseToCustom", sql.NVarChar(400), warehouseToCustom || null)
          .input("Remarks", sql.NVarChar(1000), remarks || null)
          .input("Status", sql.NVarChar(60), status)
          .input("CreatedBy", sql.NVarChar(400), createdBy || "")
          .input("CreatedByEmail", sql.NVarChar(510), createdByEmail)
          .query(`
            INSERT INTO app.STNHeader
            (
                STNNumber,
                STNSeqNo,
                STNType,
                BusinessArea,
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
                @BusinessArea,
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
                CASE WHEN @Status = 'Submitted' THEN SYSDATETIME() ELSE NULL END
            );
          `);

        finalStnId = headerResult.recordset[0].STNId;
      }

      for (const line of lines) {
        await new sql.Request(transaction)
          .input("STNId", sql.BigInt, finalStnId)
          .input("LineNu", sql.Int, Number(line.lineNu))
          .input("ItemCode", sql.NVarChar(200), line.itemCode)
          .input("ItemName", sql.NVarChar(600), line.itemName || "")
          .input("UOM", sql.NVarChar(100), line.uom || "")
          .input("BatchNumber", sql.NVarChar(200), line.batchNumber || null)
          .input("Qty", sql.Decimal(19, 6), Number(line.qty))
          .input("LineRemarks", sql.NVarChar(1000), line.lineRemarks || null)
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
          stnId: finalStnId,
          stnNumber: finalStnNumber,
          stnSeqNo: finalStnSeqNo,
          status,
          businessArea
        }
      };
    } catch (error) {
      try {
        if (transaction._aborted !== true) {
          await transaction.rollback();
        }
      } catch {}

      context.log("submitSTN error", error);

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