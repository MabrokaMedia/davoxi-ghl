import { Router } from "express";
import { getTokens, setDavoxiApiKey } from "../services/token-store";
import { DavoxiClient } from "@davoxi/client";
import { config } from "../config";

const router = Router();

/**
 * POST /settings/api-key — Save the user's Davoxi API key for a location.
 */
router.post("/api-key", async (req, res) => {
  const { locationId, apiKey } = req.body as { locationId?: string; apiKey?: string };

  if (!locationId || !apiKey) {
    res.status(400).json({ error: "locationId and apiKey are required" });
    return;
  }

  const record = getTokens(locationId);
  if (!record) {
    res.status(404).json({ error: "Location not connected. Complete OAuth first." });
    return;
  }

  // Validate the Davoxi API key
  try {
    const client = new DavoxiClient({ apiKey, apiUrl: config.davoxi.apiUrl });
    await client.getProfile();
  } catch {
    res.status(401).json({ error: "Invalid Davoxi API key" });
    return;
  }

  setDavoxiApiKey(locationId, apiKey);
  res.json({ success: true, message: "Davoxi API key saved" });
});

export default router;
