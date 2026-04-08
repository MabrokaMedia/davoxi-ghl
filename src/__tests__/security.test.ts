import * as crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import { apiKeyAuth } from "../middleware/apiKeyAuth";
import { verifyGhlSignature, verifyDavoxiSignature, LOCATION_ID_RE } from "../routes/webhooks";

// ---------------------------------------------------------------------------
// apiKeyAuth middleware
// ---------------------------------------------------------------------------

function makeReqResNext(headers: Record<string, string> = {}): {
  req: Partial<Request>;
  res: { status: jest.Mock; json: jest.Mock };
  next: jest.Mock;
} {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { status, json } as unknown as { status: jest.Mock; json: jest.Mock };
  const req = { headers } as unknown as Partial<Request>;
  const next = jest.fn();
  return { req, res, next };
}

describe("apiKeyAuth middleware", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV, INTERNAL_API_KEY: "secret-key-123" };
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it("rejects request with missing x-api-key header", () => {
    const { req, res, next } = makeReqResNext({});
    apiKeyAuth(req as Request, res as unknown as Response, next as NextFunction);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects request with wrong x-api-key header", () => {
    const { req, res, next } = makeReqResNext({ "x-api-key": "wrong-key" });
    apiKeyAuth(req as Request, res as unknown as Response, next as NextFunction);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("accepts request with correct x-api-key header", () => {
    const { req, res, next } = makeReqResNext({ "x-api-key": "secret-key-123" });
    apiKeyAuth(req as Request, res as unknown as Response, next as NextFunction);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects when INTERNAL_API_KEY is not set", () => {
    delete process.env.INTERNAL_API_KEY;
    const { req, res, next } = makeReqResNext({ "x-api-key": "any-key" });
    apiKeyAuth(req as Request, res as unknown as Response, next as NextFunction);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// verifyGhlSignature
// ---------------------------------------------------------------------------

function makeWebhookReq(secret: string | undefined, body: Buffer, signatureOverride?: string): Partial<Request> {
  const expectedSig = secret
    ? crypto.createHmac("sha256", secret).update(body).digest("hex")
    : "invalid";
  const headers: Record<string, string> = {
    "x-ghl-signature": signatureOverride ?? expectedSig,
  };
  return { headers, body } as unknown as Partial<Request>;
}

describe("verifyGhlSignature", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV, GHL_WEBHOOK_SECRET: "ghl-secret" };
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it("accepts a correct HMAC-SHA256 signature", () => {
    const body = Buffer.from(JSON.stringify({ type: "ContactCreate" }));
    const req = makeWebhookReq("ghl-secret", body);
    expect(verifyGhlSignature(req as Request)).toBe(true);
  });

  it("rejects a wrong signature", () => {
    const body = Buffer.from(JSON.stringify({ type: "ContactCreate" }));
    const req = makeWebhookReq("ghl-secret", body, "deadbeef");
    expect(verifyGhlSignature(req as Request)).toBe(false);
  });

  it("rejects when signature header is missing", () => {
    const body = Buffer.from("{}");
    const req = { headers: {}, body } as unknown as Request;
    expect(verifyGhlSignature(req)).toBe(false);
  });

  it("rejects when GHL_WEBHOOK_SECRET is not set", () => {
    delete process.env.GHL_WEBHOOK_SECRET;
    const body = Buffer.from("{}");
    const req = { headers: { "x-ghl-signature": "anything" }, body } as unknown as Request;
    expect(verifyGhlSignature(req)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// verifyDavoxiSignature
// ---------------------------------------------------------------------------

describe("verifyDavoxiSignature", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV, DAVOXI_WEBHOOK_SECRET: "davoxi-secret" };
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it("accepts a correct HMAC-SHA256 signature", () => {
    const body = Buffer.from(JSON.stringify({ event: "call.completed" }));
    const sig = crypto.createHmac("sha256", "davoxi-secret").update(body).digest("hex");
    const req = { headers: { "x-davoxi-signature": sig }, body } as unknown as Request;
    expect(verifyDavoxiSignature(req)).toBe(true);
  });

  it("rejects a wrong signature", () => {
    const body = Buffer.from("{}");
    const req = { headers: { "x-davoxi-signature": "bad-sig" }, body } as unknown as Request;
    expect(verifyDavoxiSignature(req)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// locationId validation (LOCATION_ID_RE)
// ---------------------------------------------------------------------------

describe("LOCATION_ID_RE", () => {
  const valid = [
    "abcd1234",
    "ABCD1234",
    "abc-def_12345678",
    "a1b2c3d4e5f6g7h8",
    "a".repeat(64),
  ];

  const invalid = [
    "",
    "short",              // fewer than 8 chars
    "a".repeat(65),      // more than 64 chars
    "../../../etc",      // path traversal
    "../../passwd",
    "loc/123456789",     // slash not allowed
    "loc 12345678",      // space not allowed
    "loc!@#$%^&*()",     // special chars
    "loc\x00null",       // null byte
  ];

  it.each(valid)("accepts valid locationId: %s", (id) => {
    expect(LOCATION_ID_RE.test(id)).toBe(true);
  });

  it.each(invalid)("rejects invalid locationId: %s", (id) => {
    expect(LOCATION_ID_RE.test(id)).toBe(false);
  });
});
