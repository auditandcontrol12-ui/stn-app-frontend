const { app } = require("@azure/functions");
const { getPool, sql } = require("../shared/db");
const { readCookie } = require("../shared/session");

const AREA_CONFIG = {
  Distribution: {
    whsObjectName: "stnapp.FactWhsAttributeDist",
    itemObjectName: "stnapp.FactItemAttributeDist"
  },
  Manufacturing: {
    whsObjectName: "stnapp.FactWhsAttributeManu",
    itemObjectName: "stnapp.FactItemAttributeManu"
  }
};

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

app.http("getStockCountLookups", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: async (request) => {
    try {
      const area = (request.query.get("area") || "").trim();
      const warehouse = (request.query.get("warehouse") || "").trim();
      const itemCode = (request.query.get("itemCode") || "").trim();

      if (!AREA_CONFIG[area]) {
        return {
          status: 400,
          jsonBody: { success: false, message: "Valid business area is required." }
        };
      }

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

      if (
        (area === "Manufacturing" && !sessionUser.IsAllowedManufacturing) ||
        (area === "Distribution" && !sessionUser.IsAllowedDistribution)
      ) {
        return {
          status: 403,
          jsonBody: { success: false, message: "Access denied for selected business area." }
        };
      }

      const cfg = AREA_CONFIG[area];

      const warehousesResult = await pool.request().query(`
        SELECT
            WhsCode,
            WhsName
        FROM ${cfg.whsObjectName}
        WHERE IsActive = 1
        ORDER BY WhsCode;
      `);

      const itemsResult = await pool.request().query(`
        SELECT
            ItemCode,
            ItemName,
            UOM
        FROM ${cfg.itemObjectName}
        WHERE IsActive = 1
        ORDER BY ItemCode;
      `);

      let batches = [];

      if (warehouse && itemCode) {
        const batchResult = await pool.request()
          .input("WhsCode", sql.NVarChar(400), warehouse)
          .input("ItemCode", sql.NVarChar(400), itemCode)
          .input("BusinessArea", sql.NVarChar(200), area)
          .query(`
            ;WITH BaseData AS (
              SELECT
                  h.WarehouseFrom,
                  h.WarehouseTo,
                  l.ItemCode,
                  ISNULL(l.BatchNumber, '') AS BatchNumber,
                  CAST(l.Qty AS decimal(19,6)) AS Qty
              FROM STNAPP.STNHeader h
              INNER JOIN STNAPP.STNLine l
                ON h.STNId = l.STNId
              WHERE h.Status = 'Submitted'
                AND h.IsDeleted = 0
                AND h.BusinessArea = @BusinessArea
                AND l.ItemCode = @ItemCode
                AND (
                    h.WarehouseFrom = @WhsCode
                    OR h.WarehouseTo = @WhsCode
                )
            )
            SELECT
                BatchNumber,
                SUM(CASE WHEN WarehouseTo = @WhsCode THEN Qty ELSE 0 END)
                  - SUM(CASE WHEN WarehouseFrom = @WhsCode THEN Qty ELSE 0 END) AS SystemQty
            FROM BaseData
            GROUP BY BatchNumber
            HAVING
                SUM(CASE WHEN WarehouseTo = @WhsCode THEN Qty ELSE 0 END)
                - SUM(CASE WHEN WarehouseFrom = @WhsCode THEN Qty ELSE 0 END) <> 0
            ORDER BY BatchNumber;
          `);

        batches = batchResult.recordset || [];
      }

      return {
        status: 200,
        jsonBody: {
          success: true,
          area,
          warehouses: warehousesResult.recordset || [],
          items: itemsResult.recordset || [],
          batches
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