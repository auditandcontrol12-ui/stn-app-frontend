const { app } = require("@azure/functions");

function getClientPrincipal(request) {
  const header = request.headers.get("x-ms-client-principal");
  if (!header) return null;

  try {
    return JSON.parse(Buffer.from(header, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

app.http("getMe", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: async (request) => {
    const principal = getClientPrincipal(request);

    if (!principal) {
      return {
        status: 401,
        jsonBody: {
          authenticated: false
        }
      };
    }

    const claims = principal.claims || [];
    const emailClaim =
      claims.find(c => c.typ === "preferred_username") ||
      claims.find(c => c.typ === "email");

    return {
      status: 200,
      jsonBody: {
        authenticated: true,
        userId: principal.userId,
        userDetails: principal.userDetails || "",
        email: emailClaim?.val || principal.userDetails || "",
        userRoles: principal.userRoles || []
      }
    };
  }
});