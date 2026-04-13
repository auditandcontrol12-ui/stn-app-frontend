const { app } = require("@azure/functions");

app.http("getMe", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: async (request) => {
    return {
      status: 200,
      jsonBody: {
        success: true,
        message: "API is working",
        method: request.method,
        url: request.url
      }
    };
  }
});