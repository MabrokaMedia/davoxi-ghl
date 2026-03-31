import { Router } from "express";
import { getTokens } from "../services/token-store";
import { davoxiRequest } from "../services/davoxi-client";

const router = Router();

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

  const record = getTokens(locationId);
  if (!record?.davoxiApiKey) {
    res.status(404).json({ error: "Davoxi API key not configured for this location" });
    return;
  }

  try {
    const businesses = await davoxiRequest<Array<{ business_id: string; name: string }>>(
      record.davoxiApiKey,
      "GET",
      "/businesses",
    );
    res.json(businesses);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
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

  const record = getTokens(locationId);
  if (!record?.davoxiApiKey) {
    res.status(404).json({ error: "Davoxi API key not configured" });
    return;
  }

  try {
    const agents = await davoxiRequest<Array<{ agent_id: string; description: string }>>(
      record.davoxiApiKey,
      "GET",
      `/businesses/${encodeURIComponent(businessId)}/agents`,
    );
    res.json(agents);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
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

  const record = getTokens(locationId);
  if (!record?.davoxiApiKey) {
    res.status(404).json({ error: "Davoxi API key not configured" });
    return;
  }

  try {
    const usage = await davoxiRequest(record.davoxiApiKey, "GET", "/usage/summary");
    res.json(usage);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

export default router;
