import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { config } from "./config";
import oauthRoutes from "./routes/oauth";
import settingsRoutes from "./routes/settings";
import webhookRoutes from "./routes/webhooks";
import actionRoutes from "./routes/actions";
import { apiKeyAuth } from "./middleware/apiKeyAuth";

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : false }));

const rateLimitOptions = {
  windowMs: 60_000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests" },
};

// OAuth state store can be exhausted by repeated /oauth/authorize calls; cap at 30/min.
const oauthLimiter = rateLimit({ ...rateLimitOptions, max: 30 });
// Webhook traffic from GHL/Davoxi can be high; cap at 200/min.
const webhookLimiter = rateLimit({ ...rateLimitOptions, max: 200 });
// Internal-API endpoints; cap at 120/min to allow bursts but block bruteforce.
const internalLimiter = rateLimit({ ...rateLimitOptions, max: 120 });

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "davoxi-ghl" });
});

// Routes
app.use("/oauth", oauthLimiter, express.json({ limit: "16kb" }), oauthRoutes);
app.use("/settings", internalLimiter, express.json({ limit: "16kb" }), apiKeyAuth, settingsRoutes);
app.use("/webhooks", webhookLimiter, express.raw({ type: "application/json", limit: "16kb" }), webhookRoutes);
app.use("/actions", internalLimiter, express.json({ limit: "16kb" }), apiKeyAuth, actionRoutes);

app.listen(config.port, () => {
  console.log(`Davoxi GHL integration running on port ${config.port}`);
});

export default app;
