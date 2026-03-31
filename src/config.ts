export const config = {
  ghl: {
    clientId: process.env.GHL_APP_CLIENT_ID || "",
    clientSecret: process.env.GHL_APP_CLIENT_SECRET || "",
    apiDomain: process.env.GHL_API_DOMAIN || "https://services.leadconnectorhq.com",
    oauthUrl: "https://marketplace.gohighlevel.com/oauth/chooselocation",
    tokenUrl: "https://services.leadconnectorhq.com/oauth/token",
    scopes: [
      "contacts.readonly",
      "contacts.write",
      "conversations.readonly",
      "conversations.write",
      "conversations/message.write",
    ],
  },
  davoxi: {
    apiUrl: process.env.DAVOXI_API_URL || "https://api.davoxi.com",
  },
  port: parseInt(process.env.PORT || "3000", 10),
  appUrl: process.env.APP_URL || "http://localhost:3000",
};
