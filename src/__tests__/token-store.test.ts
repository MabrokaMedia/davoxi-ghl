import { saveTokens, getTokens, deleteTokens, setDavoxiApiKey, TokenRecord } from "../services/token-store";

describe("token-store", () => {
  const makeRecord = (overrides: Partial<TokenRecord> = {}): TokenRecord => ({
    locationId: "loc-1",
    accessToken: "access-abc",
    refreshToken: "refresh-xyz",
    expiresAt: Date.now() + 3600_000,
    ...overrides,
  });

  afterEach(() => {
    deleteTokens("loc-1");
    deleteTokens("loc-2");
  });

  describe("saveTokens / getTokens", () => {
    it("should store and retrieve a token record", () => {
      const record = makeRecord();
      saveTokens(record);

      const retrieved = getTokens("loc-1");
      expect(retrieved).toEqual(record);
    });

    it("should return undefined for a non-existent location", () => {
      expect(getTokens("non-existent")).toBeUndefined();
    });

    it("should overwrite existing tokens when saving again", () => {
      saveTokens(makeRecord({ accessToken: "old-token" }));
      saveTokens(makeRecord({ accessToken: "new-token" }));

      const retrieved = getTokens("loc-1");
      expect(retrieved?.accessToken).toBe("new-token");
    });
  });

  describe("deleteTokens", () => {
    it("should remove a stored token record", () => {
      saveTokens(makeRecord());
      deleteTokens("loc-1");
      expect(getTokens("loc-1")).toBeUndefined();
    });

    it("should not throw when deleting a non-existent location", () => {
      expect(() => deleteTokens("non-existent")).not.toThrow();
    });
  });

  describe("setDavoxiApiKey", () => {
    it("should set the API key on an existing record", () => {
      saveTokens(makeRecord());
      setDavoxiApiKey("loc-1", "dvx_key_123");

      const retrieved = getTokens("loc-1");
      expect(retrieved?.davoxiApiKey).toBe("dvx_key_123");
    });

    it("should not throw when the location does not exist", () => {
      expect(() => setDavoxiApiKey("non-existent", "key")).not.toThrow();
    });

    it("should not create a record when the location does not exist", () => {
      setDavoxiApiKey("non-existent", "key");
      expect(getTokens("non-existent")).toBeUndefined();
    });

    it("should preserve other fields when setting the API key", () => {
      const record = makeRecord({ accessToken: "keep-me" });
      saveTokens(record);
      setDavoxiApiKey("loc-1", "dvx_key_456");

      const retrieved = getTokens("loc-1");
      expect(retrieved?.accessToken).toBe("keep-me");
      expect(retrieved?.davoxiApiKey).toBe("dvx_key_456");
    });
  });
});
