import { Router } from "express";
import { config } from "../config";
import { exchangeCodeForTokens } from "../services/ghl-client";
import { saveTokens } from "../services/token-store";

const router = Router();

/**
 * GET /oauth/authorize — Redirect user to GHL OAuth consent screen.
 */
router.get("/authorize", (_req, res) => {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.ghl.clientId,
    redirect_uri: `${config.appUrl}/oauth/callback`,
    scope: config.ghl.scopes.join(" "),
  });
  res.redirect(`${config.ghl.oauthUrl}?${params}`);
});

/**
 * GET /oauth/callback — Handle GHL OAuth callback, exchange code for tokens.
 */
router.get("/callback", async (req, res) => {
  const code = req.query.code as string | undefined;
  if (!code) {
    res.status(400).json({ error: "Missing authorization code" });
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
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "OAuth token exchange failed", details: message });
  }
});

export default router;
