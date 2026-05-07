import { Router, Request } from "express";
import * as crypto from "crypto";
import { getTokens } from "../services/token-store";
import { ghlRequest } from "../services/ghl-client";

const router = Router();

const LOCATION_ID_RE = /^[a-zA-Z0-9_-]{8,64}$/;

interface GHLContact {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  tags?: string[];
  locationId: string;
}

interface GHLWebhookPayload {
  type: string;
  locationId: string;
  contactId?: string;
  conversationId?: string;
  [key: string]: unknown;
}

const HEX_RE = /^[0-9a-fA-F]+$/;

function timingSafeHexEqual(actual: string, expected: string): boolean {
  if (!HEX_RE.test(actual) || !HEX_RE.test(expected)) return false;
  if (actual.length !== expected.length) return false;
  try {
    const a = Buffer.from(actual, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function verifyGhlSignature(req: Request): boolean {
  const secret = process.env.GHL_WEBHOOK_SECRET;
  if (!secret) return false;
  const signature = req.headers["x-ghl-signature"] as string | undefined;
  if (!signature) return false;
  const rawBody = req.body as Buffer;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  return timingSafeHexEqual(signature, expected);
}

function verifyDavoxiSignature(req: Request): boolean {
  const secret = process.env.DAVOXI_WEBHOOK_SECRET;
  if (!secret) return false;
  const signature = req.headers["x-davoxi-signature"] as string | undefined;
  if (!signature) return false;
  const rawBody = req.body as Buffer;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  return timingSafeHexEqual(signature, expected);
}

function safeParseJson<T>(buf: Buffer): T | null {
  try {
    return JSON.parse(buf.toString()) as T;
  } catch {
    return null;
  }
}

/**
 * POST /webhooks/ghl — Handle incoming GHL webhook events.
 *
 * Events we handle:
 *   - ContactCreate: Sync new GHL contacts to Davoxi
 *   - InboundMessage: Log conversations from GHL into Davoxi
 */
router.post("/ghl", (req, res, next) => {
  if (!verifyGhlSignature(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}, async (req, res) => {
  const payload = safeParseJson<GHLWebhookPayload>(req.body as Buffer);
  if (!payload) {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }
  const { type, locationId } = payload;

  if (!LOCATION_ID_RE.test(locationId ?? "")) {
    res.status(400).json({ error: "Invalid locationId" });
    return;
  }

  // Acknowledge immediately
  res.status(200).json({ received: true });

  const record = getTokens(locationId);
  if (!record?.davoxiApiKey) {
    console.log(`Webhook ${type} for location ${locationId}: no Davoxi API key configured, skipping`);
    return;
  }

  try {
    switch (type) {
      case "ContactCreate": {
        if (!payload.contactId) break;
        const contact = await ghlRequest<GHLContact>(
          locationId,
          "GET",
          `/contacts/${payload.contactId}`,
        );
        console.log(`New GHL contact synced: contactId=${contact.id}`);
        // Future: create matching contact/lead in Davoxi CRM when available
        break;
      }

      case "InboundMessage": {
        console.log(`Inbound message in conversation ${payload.conversationId} for location ${locationId}`);
        // Future: route to Davoxi AI agent for automated response
        break;
      }

      default:
        console.log(`Unhandled GHL webhook event: ${type}`);
    }
  } catch (err) {
    console.error(`Error processing webhook ${type}:`, err);
  }
});

/**
 * POST /webhooks/davoxi — Handle incoming Davoxi webhook events.
 *
 * Events:
 *   - call.completed: Log call summary back to GHL contact timeline
 */
router.post("/davoxi", (req, res, next) => {
  if (!verifyDavoxiSignature(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}, async (req, res) => {
  const payload = safeParseJson<{
    event: string;
    locationId?: string;
    contactPhone?: string;
    summary?: string;
    duration?: number;
    [key: string]: unknown;
  }>(req.body as Buffer);
  if (!payload) {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }

  res.status(200).json({ received: true });

  const locationId = payload.locationId;
  if (!locationId) return;

  if (!LOCATION_ID_RE.test(locationId)) {
    console.error(`Invalid locationId in Davoxi webhook: ${locationId}`);
    return;
  }

  const record = getTokens(locationId);
  if (!record) return;

  try {
    switch (payload.event) {
      case "call.completed": {
        if (!payload.contactPhone) break;

        // Search for contact by phone in GHL
        const searchResult = await ghlRequest<{ contacts: GHLContact[] }>(
          locationId,
          "GET",
          `/contacts/search/duplicate?number=${encodeURIComponent(payload.contactPhone)}&locationId=${locationId}`,
        );

        if (searchResult.contacts.length === 0) break;

        const contact = searchResult.contacts[0];

        // Add note to contact with call summary
        await ghlRequest(locationId, "POST", `/contacts/${contact.id}/notes`, {
          body: `**Davoxi AI Call Summary**\nDuration: ${payload.duration}s\n\n${payload.summary}`,
        });

        console.log(`Call summary logged to GHL contact ${contact.id}`);
        break;
      }

      default:
        console.log(`Unhandled Davoxi webhook event: ${payload.event}`);
    }
  } catch (err) {
    console.error(`Error processing Davoxi webhook:`, err);
  }
});

export { verifyGhlSignature, verifyDavoxiSignature, LOCATION_ID_RE };
export default router;
