const { app } = require("@azure/functions");
const { getPool, sql } = require("../shared/db");
const { readCookie } = require("../shared/session");

const AREA_CONFIG = {
  Distribution: {
    whsObjectName: "dist.FactCustomWhsAttributes"
  },
  Manufacturing: {
    whsObjectName: "manu.FactCustomWhsAttributes"
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

app.http("selfReconcileStock", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    try {
      const cookieName = process.env.SESSION_COOKIE_NAME || "stn_session";
      const sessionId = readCookie(request, cookieName);

      if (!sessionId) {
        return {
          status: 401,
          jsonBody: { success: false, message: "Unauthorized." }
        };
      }

      const body = await request.json();
      const area = (body?.area || "").trim();
      const startDate = (body?.startDate || "").trim();
      const endDate = (body?.endDate || "").trim();
      const whsCode = (body?.warehouse || "").trim();

      if (!AREA_CONFIG[area]) {
        return {
          status: 400,
          jsonBody: { success: false, message: "Valid business area is required." }
        };
      }

      if (!startDate || !endDate) {
        return {
          status: 400,
          jsonBody: { success: false, message: "Start date and end date are required." }
        };
      }

      if (!whsCode) {
        return {
          status: 400,
          jsonBody: { success: false, message: "Warehouse is required." }
        };
      }

      if (new Date(startDate) > new Date(endDate)) {
        return {
          status: 400,
          jsonBody: { success: false, message: "Start date cannot be after end date." }
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

      const whsNameResult = await pool.request()
        .input("WhsCode", sql.NVarChar(400), whsCode)
        .query(`
          SELECT TOP 1
              WhsCode,
              WhsName
          FROM ${AREA_CONFIG[area].whsObjectName}
          WHERE WhsCode = @WhsCode;
        `);

      const warehouseName = whsNameResult.recordset[0]?.WhsName || whsCode;

      const result = await pool.request()
        .input("WhsCode", sql.NVarChar(400), whsCode)
        .input("StartDate", sql.Date, startDate)
        .input("EndDate", sql.Date, endDate)
        .input("BusinessArea", sql.NVarChar(200), area)
        .query(`
          ;WITH BaseData AS (
            SELECT
                h.STNId,
                h.STNNumber,
                h.STNSeqNo,
                h.STNType,
                h.STNDate,
                h.BusinessArea,
                h.WarehouseFrom,
                h.WarehouseTo,
                l.ItemCode,
                l.ItemName,
                l.UOM,
                ISNULL(l.BatchNumber, '') AS BatchNumber,
                CAST(l.Qty AS decimal(19,6)) AS Qty
            FROM STNAPP.STNHeader h
            INNER JOIN STNAPP.STNLine l
                ON h.STNId = l.STNId
            WHERE h.Status = 'Submitted'
              AND h.IsDeleted = 0
              AND h.BusinessArea = @BusinessArea
              AND h.STNDate >= @StartDate
              AND h.STNDate <= @EndDate
              AND (
                    h.WarehouseFrom = @WhsCode
                 OR h.WarehouseTo = @WhsCode
              )
          )
          SELECT
              ItemCode,
              MAX(ItemName) AS ItemName,
              MAX(UOM) AS UOM,
              BatchNumber,
              SUM(CASE WHEN WarehouseTo = @WhsCode THEN Qty ELSE 0 END) AS InQty,
              SUM(CASE WHEN WarehouseFrom = @WhsCode THEN Qty ELSE 0 END) AS OutQty,
              SUM(CASE WHEN WarehouseTo = @WhsCode THEN Qty ELSE 0 END)
                - SUM(CASE WHEN WarehouseFrom = @WhsCode THEN Qty ELSE 0 END) AS NetQty,

              /* keep aliases for preview */
              SUM(CASE WHEN WarehouseTo = @WhsCode THEN Qty ELSE 0 END) AS StartQty,
              SUM(CASE WHEN WarehouseFrom = @WhsCode THEN Qty ELSE 0 END) AS EndQty,
              SUM(CASE WHEN WarehouseTo = @WhsCode THEN Qty ELSE 0 END)
                - SUM(CASE WHEN WarehouseFrom = @WhsCode THEN Qty ELSE 0 END) AS VarianceQty
          FROM BaseData
          GROUP BY
              ItemCode,
              BatchNumber
          HAVING
              SUM(CASE WHEN WarehouseTo = @WhsCode THEN Qty ELSE 0 END) <> 0
              OR
              SUM(CASE WHEN WarehouseFrom = @WhsCode THEN Qty ELSE 0 END) <> 0
          ORDER BY
              ItemCode,
              BatchNumber;
        `);

      const rows = result.recordset || [];

      return {
        status: 200,
        jsonBody: {
          success: true,
          filters: {
            area,
            startDate,
            endDate,
            warehouse: whsCode,
            warehouseName
          },
          meta: {
            rowCount: rows.length,
            reconcileType: "STN Movement Reconcile"
          },
          rows
        }
      };
    } catch (error) {
      context.log("selfReconcileStock error", error);

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