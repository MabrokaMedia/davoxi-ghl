import { Router } from "express";
import { getTokens } from "../services/token-store";
import { ghlRequest } from "../services/ghl-client";
import { davoxiRequest } from "../services/davoxi-client";

const router = Router();

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

/**
 * POST /webhooks/ghl — Handle incoming GHL webhook events.
 *
 * Events we handle:
 *   - ContactCreate: Sync new GHL contacts to Davoxi
 *   - InboundMessage: Log conversations from GHL into Davoxi
 */
router.post("/ghl", async (req, res) => {
  const payload = req.body as GHLWebhookPayload;
  const { type, locationId } = payload;

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
        console.log(`New GHL contact synced: ${contact.firstName} ${contact.lastName} (${contact.phone})`);
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
router.post("/davoxi", async (req, res) => {
  const payload = req.body as {
    event: string;
    locationId?: string;
    contactPhone?: string;
    summary?: string;
    duration?: number;
    [key: string]: unknown;
  };

  res.status(200).json({ received: true });

  const locationId = payload.locationId;
  if (!locationId) return;

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

export default router;
