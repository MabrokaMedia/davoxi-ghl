import express from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "./config";
import oauthRoutes from "./routes/oauth";
import settingsRoutes from "./routes/settings";
import webhookRoutes from "./routes/webhooks";
import actionRoutes from "./routes/actions";

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "davoxi-ghl" });
});

// Routes
app.use("/oauth", oauthRoutes);
app.use("/settings", settingsRoutes);
app.use("/webhooks", webhookRoutes);
app.use("/actions", actionRoutes);

app.listen(config.port, () => {
  console.log(`Davoxi GHL integration running on port ${config.port}`);
});

export default app;
