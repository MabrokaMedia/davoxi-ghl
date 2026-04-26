import express from "express";
import type { Express } from "express";
import { generateState, consumeState, _pendingStates } from "../routes/oauth";

// Mock external dependencies before importing routes
jest.mock("node-fetch", () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock("@davoxi/client", () => ({
  DavoxiClient: jest.fn().mockImplementation(() => ({
    getProfile: jest.fn(),
    listBusinesses: jest.fn(),
    listAgents: jest.fn(),
    getUsageSummary: jest.fn(),
  })),
}));

import * as ghlClient from "../services/ghl-client";
import * as tokenStore from "../services/token-store";
import { DavoxiClient } from "@davoxi/client";

// Light HTTP test helper (no supertest dependency)
async function request(app: Express, method: string, path: string, body?: unknown) {
  return new Promise<{ status: number; body: unknown; headers: Record<string, string> }>((resolve) => {
    const server = app.listen(0, () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") throw new Error("Bad server address");
      const port = addr.port;

      const url = `http://127.0.0.1:${port}${path}`;
      const headers: Record<string, string> = { Accept: "application/json" };
      const init: RequestInit = { method, headers };

      if (body !== undefined) {
        headers["Content-Type"] = "application/json";
        init.body = JSON.stringify(body);
      }

      globalThis
        .fetch(url, { ...init, redirect: "manual" })
        .then(async (res) => {
          const text = await res.text();
          let parsed: unknown;
          try {
            parsed = JSON.parse(text);
          } catch {
            parsed = text;
          }
          const responseHeaders: Record<string, string> = {};
          res.headers.forEach((v, k) => (responseHeaders[k] = v));
          resolve({ status: res.status, body: parsed, headers: responseHeaders });
          server.close();
        })
        .catch((err) => {
          console.error("Request error:", err);
          server.close();
        });
    });
  });
}

describe("routes", () => {
  let app: Express;

  beforeEach(() => {
    jest.clearAllMocks();
    tokenStore.deleteTokens("loc-1");
    tokenStore.deleteTokens("loc-2");
  });

  describe("OAuth routes", () => {
    beforeEach(() => {
      app = express();
      app.use(express.json());
      const oauthRouter = require("../routes/oauth").default;
      app.use("/oauth", oauthRouter);
    });

    it("GET /oauth/authorize should redirect to GHL", async () => {
      const res = await request(app, "GET", "/oauth/authorize");

      expect([301, 302, 307, 308]).toContain(res.status);
      expect(res.headers.location).toContain("gohighlevel.com/oauth/chooselocation");
    });

    it("GET /oauth/callback without code should return 400", async () => {
      const res = await request(app, "GET", "/oauth/callback");

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "Missing authorization code" });
    });

    it("GET /oauth/callback with valid code should exchange tokens and return success", async () => {
      jest.spyOn(ghlClient, "exchangeCodeForTokens").mockResolvedValue({
        access_token: "acc-123",
        refresh_token: "ref-456",
        expires_in: 3600,
        locationId: "loc-1",
      });

      const state = generateState();
      const res = await request(app, "GET", `/oauth/callback?code=test-code&state=${state}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        success: true,
        locationId: "loc-1",
      });
      expect(tokenStore.getTokens("loc-1")).toBeDefined();
    });

    it("GET /oauth/callback should return 400 when state is missing", async () => {
      const res = await request(app, "GET", "/oauth/callback?code=test-code");

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: "Invalid or expired state parameter" });
    });

    it("GET /oauth/callback should return 500 when token exchange fails", async () => {
      jest
        .spyOn(ghlClient, "exchangeCodeForTokens")
        .mockRejectedValue(new Error("exchange failed"));

      const state = generateState();
      const res = await request(app, "GET", `/oauth/callback?code=bad-code&state=${state}`);

      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({
        error: "Internal server error",
      });
    });
  });

  describe("Actions routes", () => {
    beforeEach(() => {
      app = express();
      app.use(express.json());
      const actionsRouter = require("../routes/actions").default;
      app.use("/actions", actionsRouter);
    });

    it("GET /actions/businesses without locationId should return 400", async () => {
      const res = await request(app, "GET", "/actions/businesses");
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: "locationId is required" });
    });

    it("GET /actions/businesses with invalid locationId format should return 400", async () => {
      const res = await request(app, "GET", "/actions/businesses?locationId=../etc/passwd");
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: "Invalid locationId format" });
    });

    it("GET /actions/businesses with excessively long locationId should return 400", async () => {
      const longId = "a".repeat(65);
      const res = await request(app, "GET", `/actions/businesses?locationId=${longId}`);
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: "Invalid locationId format" });
    });

    it("GET /actions/businesses without API key should return 404", async () => {
      tokenStore.saveTokens({
        locationId: "loc-1",
        accessToken: "acc",
        refreshToken: "ref",
        expiresAt: Date.now() + 300_000,
      });

      const res = await request(app, "GET", "/actions/businesses?locationId=loc-1");
      expect(res.status).toBe(404);
    });

    it("GET /actions/businesses with valid setup should return businesses", async () => {
      tokenStore.saveTokens({
        locationId: "loc-1",
        accessToken: "acc",
        refreshToken: "ref",
        expiresAt: Date.now() + 300_000,
        davoxiApiKey: "dvx-key",
      });

      const mockBusinesses = [{ id: "biz-1", name: "Test Biz" }];
      (DavoxiClient as unknown as jest.Mock).mockImplementation(() => ({
        listBusinesses: jest.fn().mockResolvedValue(mockBusinesses),
      }));

      const res = await request(app, "GET", "/actions/businesses?locationId=loc-1");
      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockBusinesses);
    });

    it("GET /actions/agents without required params should return 400", async () => {
      const res = await request(app, "GET", "/actions/agents?locationId=loc-1");
      expect(res.status).toBe(400);
    });

    it("GET /actions/agents with invalid businessId format should return 400", async () => {
      const res = await request(app, "GET", "/actions/agents?locationId=loc-1&businessId=../../etc");
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: "Invalid businessId format" });
    });

    it("GET /actions/usage without locationId should return 400", async () => {
      const res = await request(app, "GET", "/actions/usage");
      expect(res.status).toBe(400);
    });

    it("GET /actions/usage with valid setup should return usage", async () => {
      tokenStore.saveTokens({
        locationId: "loc-1",
        accessToken: "acc",
        refreshToken: "ref",
        expiresAt: Date.now() + 300_000,
        davoxiApiKey: "dvx-key",
      });

      const mockUsage = { total_calls: 10, total_minutes: 55.5, total_cost: 12.5 };
      (DavoxiClient as unknown as jest.Mock).mockImplementation(() => ({
        getUsageSummary: jest.fn().mockResolvedValue(mockUsage),
      }));

      const res = await request(app, "GET", "/actions/usage?locationId=loc-1");
      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockUsage);
    });
  });

  describe("Settings routes", () => {
    beforeEach(() => {
      app = express();
      app.use(express.json());
      const settingsRouter = require("../routes/settings").default;
      app.use("/settings", settingsRouter);
    });

    it("POST /settings/api-key without required fields should return 400", async () => {
      const res = await request(app, "POST", "/settings/api-key", { locationId: "loc-1" });
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: "locationId and apiKey are required" });
    });

    it("POST /settings/api-key with invalid locationId format should return 400", async () => {
      const res = await request(app, "POST", "/settings/api-key", {
        locationId: "../etc/passwd",
        apiKey: "some-key",
      });
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: "Invalid locationId format" });
    });

    it("POST /settings/api-key for unconnected location should return 404", async () => {
      const res = await request(app, "POST", "/settings/api-key", {
        locationId: "unknown",
        apiKey: "some-key",
      });
      expect(res.status).toBe(404);
    });

    it("POST /settings/api-key with invalid Davoxi key should return 401", async () => {
      tokenStore.saveTokens({
        locationId: "loc-1",
        accessToken: "acc",
        refreshToken: "ref",
        expiresAt: Date.now() + 300_000,
      });

      (DavoxiClient as unknown as jest.Mock).mockImplementation(() => ({
        getProfile: jest.fn().mockRejectedValue(new Error("unauthorized")),
      }));

      const res = await request(app, "POST", "/settings/api-key", {
        locationId: "loc-1",
        apiKey: "bad-key",
      });
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ error: "Invalid Davoxi API key" });
    });

    it("POST /settings/api-key with valid key should save and return success", async () => {
      tokenStore.saveTokens({
        locationId: "loc-1",
        accessToken: "acc",
        refreshToken: "ref",
        expiresAt: Date.now() + 300_000,
      });

      (DavoxiClient as unknown as jest.Mock).mockImplementation(() => ({
        getProfile: jest.fn().mockResolvedValue({ id: "user-1" }),
      }));

      const res = await request(app, "POST", "/settings/api-key", {
        locationId: "loc-1",
        apiKey: "valid-key",
      });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ success: true });

      const record = tokenStore.getTokens("loc-1");
      expect(record?.davoxiApiKey).toBe("valid-key");
    });
  });

  // ---------------------------------------------------------------------------
  // State map — DoS / memory-growth guard
  // ---------------------------------------------------------------------------
  describe("OAuth state map", () => {
    afterEach(() => {
      _pendingStates.clear();
    });

    it("generateState adds an entry to the pending-states map", () => {
      const before = _pendingStates.size;
      generateState();
      expect(_pendingStates.size).toBe(before + 1);
    });

    it("consumeState removes the entry from the map (one-time use)", () => {
      const state = generateState();
      expect(_pendingStates.has(state)).toBe(true);
      consumeState(state);
      expect(_pendingStates.has(state)).toBe(false);
    });

    it("consumeState returns false for an already-consumed state", () => {
      const state = generateState();
      expect(consumeState(state)).toBe(true);
      expect(consumeState(state)).toBe(false);
    });

    it("consumeState returns false for an expired state entry", () => {
      const state = generateState();
      // Wind the expiry into the past
      _pendingStates.set(state, { expiresAt: Date.now() - 1 });
      expect(consumeState(state)).toBe(false);
      // Entry must be removed regardless
      expect(_pendingStates.has(state)).toBe(false);
    });

    it("expired entries are purged without growing the map unboundedly", () => {
      // Insert 5 states and manually expire them
      for (let i = 0; i < 5; i++) {
        const s = generateState();
        _pendingStates.set(s, { expiresAt: Date.now() - 1 });
      }
      // consumeState on each expired entry removes it
      for (const [s] of [..._pendingStates]) {
        consumeState(s);
      }
      expect(_pendingStates.size).toBe(0);
    });
  });
});
