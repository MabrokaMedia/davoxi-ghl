import fetch from "node-fetch";
import { config } from "../config";
import { getTokens, saveTokens } from "./token-store";

/**
 * Exchange authorization code for access + refresh tokens.
 */
export async function exchangeCodeForTokens(code: string) {
  const res = await fetch(config.ghl.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.ghl.clientId,
      client_secret: config.ghl.clientSecret,
      grant_type: "authorization_code",
      code,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GHL token exchange failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    locationId: string;
  }>;
}

/**
 * Refresh an expired access token.
 */
export async function refreshAccessToken(refreshToken: string) {
  const res = await fetch(config.ghl.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.ghl.clientId,
      client_secret: config.ghl.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GHL token refresh failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
  }>;
}

/**
 * Get a valid access token for a location, refreshing if expired.
 */
export async function getValidToken(locationId: string): Promise<string> {
  const record = getTokens(locationId);
  if (!record) {
    throw new Error(`No tokens found for location ${locationId}`);
  }

  if (Date.now() < record.expiresAt - 60_000) {
    return record.accessToken;
  }

  const refreshed = await refreshAccessToken(record.refreshToken);
  saveTokens({
    locationId,
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token,
    expiresAt: Date.now() + refreshed.expires_in * 1000,
    davoxiApiKey: record.davoxiApiKey,
  });

  return refreshed.access_token;
}

/**
 * Make an authenticated GHL API request.
 */
export async function ghlRequest<T>(
  locationId: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = await getValidToken(locationId);
  const url = `${config.ghl.apiDomain}${path}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Version: "2021-07-28",
    Accept: "application/json",
  };

  const init: { method: string; headers: Record<string, string>; body?: string } = {
    method,
    headers,
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GHL API error (${res.status}): ${text}`);
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  return JSON.parse(text) as T;
}
