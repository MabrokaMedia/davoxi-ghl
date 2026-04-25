import { Router } from "express";
import { getTokens } from "../services/token-store";
import { DavoxiClient } from "@davoxi/client";
import { config } from "../config";

const router = Router();

const LOCATION_ID_RE = /^[a-zA-Z0-9_-]{4,64}$/;
const BUSINESS_ID_RE = /^[a-zA-Z0-9_-]{4,64}$/;

/**
 * GET /actions/businesses — List Davoxi businesses for a GHL location.
 * Used by GHL custom workflow actions to populate dropdowns.
 */
router.get("/businesses", async (req, res) => {
  const locationId = req.query.locationId as string;
  if (!locationId) {
    res.status(400).json({ error: "locationId is required" });
    return;
  }
  if (!LOCATION_ID_RE.test(locationId)) {
    res.status(400).json({ error: "Invalid locationId format" });
    return;
  }

  const record = getTokens(locationId);
  if (!record?.davoxiApiKey) {
    res.status(404).json({ error: "Davoxi API key not configured for this location" });
    return;
  }

  try {
    const client = new DavoxiClient({ apiKey: record.davoxiApiKey, apiUrl: config.davoxi.apiUrl });
    const businesses = await client.listBusinesses();
    res.json(businesses);
  } catch (err) {
    console.error("Error listing businesses:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /actions/agents — List Davoxi agents for a business.
 */
router.get("/agents", async (req, res) => {
  const locationId = req.query.locationId as string;
  const businessId = req.query.businessId as string;

  if (!locationId || !businessId) {
    res.status(400).json({ error: "locationId and businessId are required" });
    return;
  }
  if (!LOCATION_ID_RE.test(locationId)) {
    res.status(400).json({ error: "Invalid locationId format" });
    return;
  }
  if (!BUSINESS_ID_RE.test(businessId)) {
    res.status(400).json({ error: "Invalid businessId format" });
    return;
  }

  const record = getTokens(locationId);
  if (!record?.davoxiApiKey) {
    res.status(404).json({ error: "Davoxi API key not configured" });
    return;
  }

  try {
    const client = new DavoxiClient({ apiKey: record.davoxiApiKey, apiUrl: config.davoxi.apiUrl });
    const agents = await client.listAgents(businessId);
    res.json(agents);
  } catch (err) {
    console.error("Error listing agents:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /actions/usage — Get Davoxi usage summary for a location.
 */
router.get("/usage", async (req, res) => {
  const locationId = req.query.locationId as string;
  if (!locationId) {
    res.status(400).json({ error: "locationId is required" });
    return;
  }
  if (!LOCATION_ID_RE.test(locationId)) {
    res.status(400).json({ error: "Invalid locationId format" });
    return;
  }

  const record = getTokens(locationId);
  if (!record?.davoxiApiKey) {
    res.status(404).json({ error: "Davoxi API key not configured" });
    return;
  }

  try {
    const client = new DavoxiClient({ apiKey: record.davoxiApiKey, apiUrl: config.davoxi.apiUrl });
    const usage = await client.getUsageSummary();
    res.json(usage);
  } catch (err) {
    console.error("Error fetching usage:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
