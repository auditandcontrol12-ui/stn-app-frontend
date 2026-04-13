const { app } = require("@azure/functions");
const { getPool } = require("../shared/db");

app.http("getLookups", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: async (request) => {
    try {
      const area = request.query.get("area");

      if (!area || !["Distribution", "Manufacturing"].includes(area)) {
        return {
          status: 400,
          jsonBody: {
            success: false,
            message: "Valid area is required"
          }
        };
      }

      const pool = await getPool();

      let itemQuery = "";
      let whsQuery = "";

      if (area === "Distribution") {
        itemQuery = `
          SELECT
              ItemCode,
              ItemName,
              UOM
          FROM dist.FactCustomItemAttribute
          WHERE IsActive = 1
          ORDER BY ItemCode;
        `;

        whsQuery = `
          SELECT
              WhsCode,
              WhsName,
              Branch,
              Location,
              WhsType
          FROM dist.FactCustomWhsAttributes
          WHERE IsActive = 1
          ORDER BY WhsCode;
        `;
      } else {
        itemQuery = `
          SELECT
              ItemCode,
              ItemName,
              UOM
          FROM manu.FactCustomItemAttribute
          WHERE IsActive = 1
          ORDER BY ItemCode;
        `;

        whsQuery = `
          SELECT
              WhsCode,
              WhsName,
              Branch,
              Location,
              WhsType
          FROM manu.FactCustomWhsAttributes
          WHERE IsActive = 1
          ORDER BY WhsCode;
        `;
      }

      const itemResult = await pool.request().query(itemQuery);
      const whsResult = await pool.request().query(whsQuery);

      return {
        status: 200,
        jsonBody: {
          success: true,
          area,
          items: itemResult.recordset,
          warehouses: whsResult.recordset
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