const { BlobServiceClient } = require("@azure/storage-blob");

let containerClient;

function getContainerClient() {
  if (containerClient) return containerClient;

  const connectionString = process.env.BLOB_STORAGE_CONNECTION_STRING;
  const containerName = process.env.STN_SIGNED_CONTAINER || "signed-stn";

  if (!connectionString) {
    throw new Error("STORAGE CONNECTION is not configured.");
  }

  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  containerClient = blobServiceClient.getContainerClient(containerName);
  return containerClient;
}

async function ensureContainer() {
  const client = getContainerClient();
  await client.createIfNotExists();
  return client;
}

async function uploadBuffer(blobName, buffer, contentType) {
  const client = await ensureContainer();
  const blockBlobClient = client.getBlockBlobClient(blobName);

  await blockBlobClient.uploadData(buffer, {
    blobHTTPHeaders: {
      blobContentType: contentType || "application/octet-stream"
    },
    overwrite: true
  });

  return {
    blobName,
    blobUrl: blockBlobClient.url
  };
}

module.exports = {
  getContainerClient,
  ensureContainer,
  uploadBuffer
};