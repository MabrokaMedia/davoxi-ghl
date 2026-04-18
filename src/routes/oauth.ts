import { Router } from "express";
import * as crypto from "crypto";
import { config } from "../config";
import { exchangeCodeForTokens } from "../services/ghl-client";
import { saveTokens } from "../services/token-store";

const router = Router();

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface StateEntry {
  expiresAt: number;
}

export const _pendingStates = new Map<string, StateEntry>();
const pendingStates = _pendingStates;

// Periodically purge expired state entries to prevent unbounded memory growth
const _stateCleanup = setInterval(() => {
  const now = Date.now();
  for (const [state, entry] of pendingStates) {
    if (now > entry.expiresAt) pendingStates.delete(state);
  }
}, STATE_TTL_MS);

// Allow the process to exit cleanly without waiting for the interval
if (typeof _stateCleanup.unref === "function") _stateCleanup.unref();

export function generateState(): string {
  const state = crypto.randomBytes(16).toString("hex");
  pendingStates.set(state, { expiresAt: Date.now() + STATE_TTL_MS });
  return state;
}

export function consumeState(state: string): boolean {
  const entry = pendingStates.get(state);
  if (!entry) return false;
  pendingStates.delete(state);
  if (Date.now() > entry.expiresAt) return false;
  return true;
}

/**
 * GET /oauth/authorize — Redirect user to GHL OAuth consent screen.
 */
router.get("/authorize", (_req, res) => {
  const state = generateState();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.ghl.clientId,
    redirect_uri: `${config.appUrl}/oauth/callback`,
    scope: config.ghl.scopes.join(" "),
    state,
  });
  res.redirect(`${config.ghl.oauthUrl}?${params}`);
});

/**
 * GET /oauth/callback — Handle GHL OAuth callback, exchange code for tokens.
 */
router.get("/callback", async (req, res) => {
  const code = req.query.code as string | undefined;
  const state = req.query.state as string | undefined;

  if (!code) {
    res.status(400).json({ error: "Missing authorization code" });
    return;
  }

  if (!state || !consumeState(state)) {
    res.status(400).json({ error: "Invalid or expired state parameter" });
    return;
  }

  try {
    const tokenData = await exchangeCodeForTokens(code);

    saveTokens({
      locationId: tokenData.locationId,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + tokenData.expires_in * 1000,
    });

    res.json({
      success: true,
      locationId: tokenData.locationId,
      message: "Davoxi connected to GoHighLevel. Configure your Davoxi API key at /settings.",
    });
  } catch (err) {
    console.error("OAuth token exchange failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
