const { app } = require("@azure/functions");
const Busboy = require("busboy");
const { getPool, sql } = require("../shared/db");
const { readCookie } = require("../shared/session");
const { uploadBuffer } = require("../shared/blob");

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
          u.UserRole,
          u.IsManager,
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
    userRole: row.UserRole || "",
    isManager: !!row.IsManager,
    allowedAreas
  };
}

function parseMultipartForm(request) {
  return new Promise(async (resolve, reject) => {
    try {
      const headersObj = {};
      for (const [key, value] of request.headers.entries()) {
        headersObj[key.toLowerCase()] = value;
      }

      const contentType = headersObj["content-type"] || "";
      if (!contentType.toLowerCase().includes("multipart/form-data")) {
        reject(new Error("Content-Type must be multipart/form-data."));
        return;
      }

      const busboy = Busboy({ headers: headersObj });
      const fields = {};
      const files = [];

      busboy.on("field", (name, value) => {
        fields[name] = value;
      });

      busboy.on("file", (name, file, info) => {
        const chunks = [];
        const { filename, mimeType } = info;

        file.on("data", (chunk) => chunks.push(chunk));
        file.on("end", () => {
          files.push({
            fieldName: name,
            filename,
            mimeType,
            buffer: Buffer.concat(chunks)
          });
        });
      });

      busboy.on("finish", () => resolve({ fields, files }));
      busboy.on("error", reject);

      const arrayBuffer = await request.arrayBuffer();
      busboy.end(Buffer.from(arrayBuffer));
    } catch (error) {
      reject(error);
    }
  });
}

function sanitizeFilePart(value) {
  return String(value || "")
    .replace(/[^\w\-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

app.http("uploadSignedSTN", {
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

      const pool = await getPool();
      const sessionUser = await getSessionUser(pool, sessionId);

      if (!sessionUser) {
        return {
          status: 401,
          jsonBody: { success: false, message: "Unauthorized." }
        };
      }

      const { fields, files } = await parseMultipartForm(request);

      const stnId = Number(fields.stnId);
      const uploadedFile = files.find((f) => f.fieldName === "file");

      if (!stnId || Number.isNaN(stnId)) {
        return {
          status: 400,
          jsonBody: { success: false, message: "Valid stnId is required." }
        };
      }

      if (!uploadedFile) {
        return {
          status: 400,
          jsonBody: { success: false, message: "PDF file is required." }
        };
      }

      const fileName = String(uploadedFile.filename || "").trim();
      const mimeType = String(uploadedFile.mimeType || "").trim().toLowerCase();
      const isPdf = mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");

      if (!isPdf) {
        return {
          status: 400,
          jsonBody: { success: false, message: "Only PDF files are allowed." }
        };
      }

      if (!uploadedFile.buffer || uploadedFile.buffer.length === 0) {
        return {
          status: 400,
          jsonBody: { success: false, message: "Uploaded file is empty." }
        };
      }

      const stnResult = await pool.request()
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

      if (stnResult.recordset.length === 0) {
        return {
          status: 404,
          jsonBody: { success: false, message: "STN not found." }
        };
      }

      const stn = stnResult.recordset[0];

      if (stn.IsDeleted) {
        return {
          status: 400,
          jsonBody: { success: false, message: "Deleted STN cannot accept uploads." }
        };
      }

      if (!sessionUser.allowedAreas.includes(stn.BusinessArea)) {
        return {
          status: 403,
          jsonBody: { success: false, message: "Access denied." }
        };
      }

      if (stn.Status !== "Draft") {
        return {
          status: 400,
          jsonBody: { success: false, message: "Signed PDF can be uploaded only for Draft STN." }
        };
      }

      if (stn.IsSignedDocumentUploaded && !sessionUser.isManager) {
        return {
          status: 403,
          jsonBody: {
            success: false,
            message: "Signed PDF already uploaded. Only manager can replace it."
          }
        };
      }

      const safeStnNumber = sanitizeFilePart(stn.STNNumber);
      const finalFileName = `${safeStnNumber}.pdf`;
      const blobName = `stn/${finalFileName}`;

      const uploadResult = await uploadBuffer(
        blobName,
        uploadedFile.buffer,
        "application/pdf"
      );

      await pool.request()
        .input("STNId", sql.BigInt, stnId)
        .input("SignedDocumentFileName", sql.NVarChar(255), finalFileName)
        .input("SignedDocumentBlobName", sql.NVarChar(500), uploadResult.blobName)
        .input("SignedDocumentBlobUrl", sql.NVarChar(sql.MAX), uploadResult.blobUrl)
        .input("SignedDocumentUploadedByEmail", sql.NVarChar(255), sessionUser.userEmail)
        .input("SignedDocumentUploadedByName", sql.NVarChar(255), sessionUser.userName)
        .query(`
          UPDATE STNAPP.STNHeader
          SET
              SignedDocumentFileName = @SignedDocumentFileName,
              SignedDocumentBlobName = @SignedDocumentBlobName,
              SignedDocumentBlobUrl = @SignedDocumentBlobUrl,
              SignedDocumentUploadedByEmail = @SignedDocumentUploadedByEmail,
              SignedDocumentUploadedByName = @SignedDocumentUploadedByName,
              SignedDocumentUploadedDateTime = SYSDATETIME(),
              IsSignedDocumentUploaded = 1
          WHERE STNId = @STNId;
        `);

      return {
        status: 200,
        jsonBody: {
          success: true,
          message: stn.IsSignedDocumentUploaded
            ? "Signed PDF replaced successfully."
            : "Signed PDF uploaded successfully.",
          stnId: stn.STNId,
          fileName: finalFileName,
          blobName: uploadResult.blobName,
          blobUrl: uploadResult.blobUrl,
          uploadedBy: sessionUser.userName
        }
      };
    } catch (error) {
      context.log("uploadSignedSTN error", error);

      return {
        status: 500,
        jsonBody: {
          success: false,
          message: error.message || "Failed to upload signed PDF."
        }
      };
    }
  }
});