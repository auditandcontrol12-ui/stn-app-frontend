const { app } = require("@azure/functions");
const { getPool, sql } = require("../shared/db");
const { readCookie } = require("../shared/session");

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
          u.IsSuperUser,
          u.IsActive,
          u.IsDeleted
      FROM STNAPP.UserSession s
      INNER JOIN STNAPP.Users u
          ON s.UserID = u.UserID
      WHERE s.SessionID = @SessionID;
    `);

  if (!result.recordset.length) return null;

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

async function getAllAreaWarehouses(pool, businessArea) {
  const result = await pool.request()
    .input("BusinessArea", sql.NVarChar(100), businessArea)
    .query(`
      SELECT
          WarehouseCode AS WhsCode,
          WarehouseName AS WhsName
      FROM STNAPP.Warehouse
      WHERE
          BusinessArea = @BusinessArea
          AND IsActive = 1
      ORDER BY WarehouseCode;
    `);

  return result.recordset;
}

async function getRestrictedWarehouses(pool, userId, businessArea, permissionColumn) {
  const accessResult = await pool.request()
    .input("UserId", sql.BigInt, userId)
    .input("BusinessArea", sql.NVarChar(100), businessArea)
    .query(`
      SELECT
          W.WarehouseCode AS WhsCode,
          W.WarehouseName AS WhsName
      FROM STNAPP.UserWarehouseAccess UWA
      INNER JOIN STNAPP.Warehouse W
          ON W.BusinessArea = UWA.BusinessArea
         AND W.WarehouseCode = UWA.WarehouseCode
      WHERE
          UWA.UserId = @UserId
          AND UWA.BusinessArea = @BusinessArea
          AND UWA.IsActive = 1
          AND W.IsActive = 1
          AND UWA.${permissionColumn} = 1
      ORDER BY W.WarehouseCode;
    `);

  if (accessResult.recordset.length > 0) {
    return accessResult.recordset;
  }

  const anyAccessRowsResult = await pool.request()
    .input("UserId", sql.BigInt, userId)
    .input("BusinessArea", sql.NVarChar(100), businessArea)
    .query(`
      SELECT COUNT(1) AS Cnt
      FROM STNAPP.UserWarehouseAccess
      WHERE
          UserId = @UserId
          AND BusinessArea = @BusinessArea
          AND IsActive = 1;
    `);

  const hasAnyAreaAccessRows = Number(anyAccessRowsResult.recordset[0]?.Cnt || 0) > 0;

  if (!hasAnyAreaAccessRows) {
    return getAllAreaWarehouses(pool, businessArea);
  }

  return [];
}

async function getWarehouseLists(pool, userId, businessArea, stnType) {
  const allWarehouses = await getAllAreaWarehouses(pool, businessArea);

  if (stnType === "IN") {
    const toWarehouses = await getRestrictedWarehouses(
      pool,
      userId,
      businessArea,
      "AllowInboundTo"
    );

    return {
      fromWarehouses: allWarehouses,
      toWarehouses
    };
  }

  if (stnType === "OB") {
    const fromWarehouses = await getRestrictedWarehouses(
      pool,
      userId,
      businessArea,
      "AllowOutboundFrom"
    );

    return {
      fromWarehouses,
      toWarehouses: allWarehouses
    };
  }

  return {
    fromWarehouses: allWarehouses,
    toWarehouses: allWarehouses
  };
}

app.http("getLookups", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    try {
      const url = new URL(request.url);
      const area = (url.searchParams.get("area") || "").trim();
      const mode = (url.searchParams.get("mode") || "").trim();
      const stnType = (url.searchParams.get("stnType") || "").trim().toUpperCase();

      const cookieName = process.env.SESSION_COOKIE_NAME || "stn_session";
      const sessionId = readCookie(request, cookieName);

      if (!sessionId) {
        return {
          status: 401,
          jsonBody: {
            success: false,
            message: "Unauthorized."
          }
        };
      }

      const pool = await getPool();
      const sessionUser = await getSessionUser(pool, sessionId);

      if (!sessionUser) {
        return {
          status: 401,
          jsonBody: {
            success: false,
            message: "Unauthorized."
          }
        };
      }

      if (mode === "assignableUsers") {
        if (!sessionUser.IsManager && !sessionUser.IsSuperUser) {
          return {
            status: 403,
            jsonBody: {
              success: false,
              message: "Only managers or super users can view assignable users."
            }
          };
        }

        const usersResult = await pool.request()
          .input("CurrentUserEmail", sql.NVarChar(1020), sessionUser.UserEmail || "")
          .query(`
            SELECT
                UserID,
                UserEmail,
                UserName,
                HoldingName,
                UserRole,
                IsAllowedManufacturing,
                IsAllowedDistribution,
                IsActive,
                IsManager,
                IsSuperUser
            FROM STNAPP.Users
            WHERE
                IsActive = 1
                AND ISNULL(IsDeleted, 0) = 0
                AND LOWER(UserEmail) <> LOWER(@CurrentUserEmail)
            ORDER BY UserName, UserEmail;
          `);

        return {
          status: 200,
          jsonBody: {
            success: true,
            mode: "assignableUsers",
            users: usersResult.recordset
          }
        };
      }

      if (!area || !["Distribution", "Manufacturing"].includes(area)) {
        return {
          status: 400,
          jsonBody: {
            success: false,
            message: "Valid area is required."
          }
        };
      }

      if (
        (area === "Manufacturing" && !sessionUser.IsAllowedManufacturing) ||
        (area === "Distribution" && !sessionUser.IsAllowedDistribution)
      ) {
        return {
          status: 403,
          jsonBody: {
            success: false,
            message: "Access denied for selected business area."
          }
        };
      }

      const itemResult = await pool.request()
        .input("BusinessArea", sql.NVarChar(100), area)
        .query(`
          SELECT
              ItemCode,
              ItemName,
              UOM
          FROM STNAPP.ItemMaster
          WHERE
              BusinessArea = @BusinessArea
              AND IsActive = 1
          ORDER BY ItemCode;
        `);

      const warehouseLists = await getWarehouseLists(
        pool,
        sessionUser.UserID,
        area,
        stnType
      );

      return {
        status: 200,
        jsonBody: {
          success: true,
          area,
          stnType: stnType || null,
          items: itemResult.recordset,
          warehouses: warehouseLists.fromWarehouses,
          fromWarehouses: warehouseLists.fromWarehouses,
          toWarehouses: warehouseLists.toWarehouses
        }
      };
    } catch (error) {
      context.log("getLookups error", error);

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