import { exchangeCodeForTokens, refreshAccessToken, getValidToken, ghlRequest } from "../services/ghl-client";
import * as tokenStore from "../services/token-store";

// Mock node-fetch at module level
jest.mock("node-fetch", () => {
  const mockFetch = jest.fn();
  return {
    __esModule: true,
    default: mockFetch,
  };
});

import fetch from "node-fetch";
const mockFetch = fetch as unknown as jest.Mock;

describe("ghl-client", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    tokenStore.deleteTokens("loc-1");
  });

  function mockResponse(body: unknown, status = 200, ok = true) {
    return {
      ok,
      status,
      text: jest.fn().mockResolvedValue(typeof body === "string" ? body : JSON.stringify(body)),
      json: jest.fn().mockResolvedValue(body),
    };
  }

  describe("exchangeCodeForTokens", () => {
    it("should POST to token URL and return token data on success", async () => {
      const tokenData = {
        access_token: "acc-123",
        refresh_token: "ref-456",
        expires_in: 3600,
        locationId: "loc-1",
      };
      mockFetch.mockResolvedValue(mockResponse(tokenData));

      const result = await exchangeCodeForTokens("auth-code-xyz");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain("oauth/token");
      expect(options.method).toBe("POST");
      expect(options.body.toString()).toContain("grant_type=authorization_code");
      expect(options.body.toString()).toContain("code=auth-code-xyz");
      expect(result).toEqual(tokenData);
    });

    it("should throw on non-OK response", async () => {
      mockFetch.mockResolvedValue(mockResponse("bad request", 400, false));

      await expect(exchangeCodeForTokens("bad-code")).rejects.toThrow(
        /GHL token exchange failed \(400\)/,
      );
    });
  });

  describe("refreshAccessToken", () => {
    it("should POST with refresh_token grant and return new tokens", async () => {
      const tokenData = {
        access_token: "new-acc",
        refresh_token: "new-ref",
        expires_in: 3600,
      };
      mockFetch.mockResolvedValue(mockResponse(tokenData));

      const result = await refreshAccessToken("old-refresh-token");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [, options] = mockFetch.mock.calls[0];
      expect(options.body.toString()).toContain("grant_type=refresh_token");
      expect(options.body.toString()).toContain("refresh_token=old-refresh-token");
      expect(result).toEqual(tokenData);
    });

    it("should throw on non-OK response", async () => {
      mockFetch.mockResolvedValue(mockResponse("invalid refresh token", 401, false));

      await expect(refreshAccessToken("bad-token")).rejects.toThrow(
        /GHL token refresh failed \(401\)/,
      );
    });
  });

  describe("getValidToken", () => {
    it("should return cached token when not expired", async () => {
      tokenStore.saveTokens({
        locationId: "loc-1",
        accessToken: "valid-token",
        refreshToken: "ref-token",
        expiresAt: Date.now() + 300_000,
      });

      const token = await getValidToken("loc-1");

      expect(token).toBe("valid-token");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should refresh when token is within 60 seconds of expiry", async () => {
      tokenStore.saveTokens({
        locationId: "loc-1",
        accessToken: "expired-token",
        refreshToken: "ref-token",
        expiresAt: Date.now() + 30_000,
      });

      const refreshedTokenData = {
        access_token: "refreshed-token",
        refresh_token: "new-ref",
        expires_in: 3600,
      };
      mockFetch.mockResolvedValue(mockResponse(refreshedTokenData));

      const token = await getValidToken("loc-1");

      expect(token).toBe("refreshed-token");
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const stored = tokenStore.getTokens("loc-1");
      expect(stored?.accessToken).toBe("refreshed-token");
    });

    it("should throw when no tokens exist for the location", async () => {
      await expect(getValidToken("unknown-loc")).rejects.toThrow(
        /No tokens found for location unknown-loc/,
      );
    });
  });

  describe("ghlRequest", () => {
    beforeEach(() => {
      tokenStore.saveTokens({
        locationId: "loc-1",
        accessToken: "valid-token",
        refreshToken: "ref-token",
        expiresAt: Date.now() + 300_000,
      });
    });

    it("should make a GET request with auth header and Version header", async () => {
      const responseData = { id: "contact-1", name: "Test" };
      mockFetch.mockResolvedValue(mockResponse(responseData));

      const result = await ghlRequest("loc-1", "GET", "/contacts/1");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain("/contacts/1");
      expect(options.method).toBe("GET");
      expect(options.headers.Authorization).toBe("Bearer valid-token");
      expect(options.headers.Version).toBe("2021-07-28");
      expect(options.body).toBeUndefined();
      expect(result).toEqual(responseData);
    });

    it("should make a POST request with JSON body", async () => {
      const requestBody = { firstName: "John" };
      const responseData = { id: "new-contact" };
      mockFetch.mockResolvedValue(mockResponse(responseData));

      const result = await ghlRequest("loc-1", "POST", "/contacts", requestBody);

      const [, options] = mockFetch.mock.calls[0];
      expect(options.method).toBe("POST");
      expect(options.headers["Content-Type"]).toBe("application/json");
      expect(options.body).toBe(JSON.stringify(requestBody));
      expect(result).toEqual(responseData);
    });

    it("should return undefined for 204 No Content", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 204,
        text: jest.fn().mockResolvedValue(""),
      });

      const result = await ghlRequest("loc-1", "DELETE", "/contacts/1");
      expect(result).toBeUndefined();
    });

    it("should throw on error response", async () => {
      mockFetch.mockResolvedValue(mockResponse("Not Found", 404, false));

      await expect(
        ghlRequest("loc-1", "GET", "/contacts/missing"),
      ).rejects.toThrow(/GHL API error \(404\)/);
    });
  });
});
