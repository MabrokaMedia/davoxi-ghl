import express from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "./config";
import oauthRoutes from "./routes/oauth";
import settingsRoutes from "./routes/settings";
import webhookRoutes from "./routes/webhooks";
import actionRoutes from "./routes/actions";
import { apiKeyAuth } from "./middleware/apiKeyAuth";

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : false }));

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "davoxi-ghl" });
});

// Routes
app.use("/oauth", express.json({ limit: "16kb" }), oauthRoutes);
app.use("/settings", express.json({ limit: "16kb" }), apiKeyAuth, settingsRoutes);
app.use("/webhooks", express.raw({ type: "application/json", limit: "16kb" }), webhookRoutes);
app.use("/actions", express.json({ limit: "16kb" }), apiKeyAuth, actionRoutes);

app.listen(config.port, () => {
  console.log(`Davoxi GHL integration running on port ${config.port}`);
});

export default app;
