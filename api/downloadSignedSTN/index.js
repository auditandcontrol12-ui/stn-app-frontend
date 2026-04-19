const { app } = require("@azure/functions");
const { BlobServiceClient } = require("@azure/storage-blob");
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

  const allowedAreas = [];
  if (row.IsAllowedManufacturing) allowedAreas.push("Manufacturing");
  if (row.IsAllowedDistribution) allowedAreas.push("Distribution");

  return {
    userId: row.UserID,
    userEmail: row.UserEmail,
    userName: row.UserName,
    allowedAreas
  };
}

function getContainerClient() {
  const connectionString = process.env.AzureWebJobsStorage;
  const containerName = process.env.STN_SIGNED_CONTAINER || "signed-stn";

  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  return blobServiceClient.getContainerClient(containerName);
}

function streamToBuffer(readable) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readable.on("data", (chunk) => chunks.push(chunk));
    readable.on("end", () => resolve(Buffer.concat(chunks)));
    readable.on("error", reject);
  });
}

app.http("downloadSignedSTN", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    try {
      const stnId = Number(request.query.get("stnId"));

      if (!stnId || Number.isNaN(stnId)) {
        return {
          status: 400,
          jsonBody: { success: false, message: "Valid stnId is required." }
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

      const result = await pool.request()
        .input("STNId", sql.BigInt, stnId)
        .query(`
          SELECT TOP 1
              STNId,
              STNNumber,
              BusinessArea,
              Status,
              IsDeleted,
              IsSignedDocumentUploaded,
              SignedDocumentFileName,
              SignedDocumentBlobName
          FROM STNAPP.STNHeader
          WHERE STNId = @STNId;
        `);

      if (result.recordset.length === 0) {
        return {
          status: 404,
          jsonBody: { success: false, message: "STN not found." }
        };
      }

      const row = result.recordset[0];

      if (row.IsDeleted) {
        return {
          status: 404,
          jsonBody: { success: false, message: "STN not found." }
        };
      }

      if (!sessionUser.allowedAreas.includes(row.BusinessArea)) {
        return {
          status: 403,
          jsonBody: { success: false, message: "Access denied." }
        };
      }

      if (!row.IsSignedDocumentUploaded || !row.SignedDocumentBlobName) {
        return {
          status: 404,
          jsonBody: { success: false, message: "Signed attachment not found." }
        };
      }

      const containerClient = getContainerClient();
      const blobClient = containerClient.getBlobClient(row.SignedDocumentBlobName);
      const downloadResponse = await blobClient.download();
      const fileBuffer = await streamToBuffer(downloadResponse.readableStreamBody);

      return {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${row.SignedDocumentFileName || `${row.STNNumber}.pdf`}"`,
          "Cache-Control": "no-store"
        },
        body: fileBuffer
      };
    } catch (error) {
      context.log("downloadSignedSTN error", error);
      return {
        status: 500,
        jsonBody: { success: false, message: error.message || "Download failed." }
      };
    }
  }
});