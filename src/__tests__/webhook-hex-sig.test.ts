import crypto from "crypto";
import type { Request } from "express";
import { verifyGhlSignature, verifyDavoxiSignature } from "../routes/webhooks";

function makeReq(headerName: string, sig: string | undefined, body: Buffer): Request {
  const headers: Record<string, string> = {};
  if (sig !== undefined) headers[headerName] = sig;
  return { headers, body } as unknown as Request;
}

describe("verifyGhlSignature — hex encoding edge cases", () => {
  const SECRET = "ghl-webhook-secret-x";
  const body = Buffer.from(JSON.stringify({ type: "ContactCreate" }));
  const expected = crypto.createHmac("sha256", SECRET).update(body).digest("hex");

  beforeEach(() => {
    process.env.GHL_WEBHOOK_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.GHL_WEBHOOK_SECRET;
  });

  it("accepts the correct hex signature", () => {
    expect(verifyGhlSignature(makeReq("x-ghl-signature", expected, body))).toBe(true);
  });

  it("rejects a non-hex signature of the right byte length", () => {
    const nonHex = "Z".repeat(expected.length);
    expect(verifyGhlSignature(makeReq("x-ghl-signature", nonHex, body))).toBe(false);
  });

  it("rejects a hex signature that's the wrong length", () => {
    expect(verifyGhlSignature(makeReq("x-ghl-signature", expected.slice(0, 10), body))).toBe(false);
  });

  it("rejects a tampered hex signature", () => {
    const tampered = expected.slice(0, -2) + (expected.endsWith("0") ? "ff" : "00");
    expect(verifyGhlSignature(makeReq("x-ghl-signature", tampered, body))).toBe(false);
  });
});

describe("verifyDavoxiSignature — hex encoding edge cases", () => {
  const SECRET = "davoxi-webhook-secret";
  const body = Buffer.from(JSON.stringify({ event: "call.completed" }));
  const expected = crypto.createHmac("sha256", SECRET).update(body).digest("hex");

  beforeEach(() => {
    process.env.DAVOXI_WEBHOOK_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.DAVOXI_WEBHOOK_SECRET;
  });

  it("accepts the correct hex signature", () => {
    expect(verifyDavoxiSignature(makeReq("x-davoxi-signature", expected, body))).toBe(true);
  });

  it("rejects a non-hex signature even at correct length", () => {
    const nonHex = "g".repeat(expected.length);
    expect(verifyDavoxiSignature(makeReq("x-davoxi-signature", nonHex, body))).toBe(false);
  });

  it("rejects an empty signature", () => {
    expect(verifyDavoxiSignature(makeReq("x-davoxi-signature", "", body))).toBe(false);
  });
});

describe("webhook routes — malformed JSON body", () => {
  const SECRET = "ghl-webhook-secret-x";

  beforeAll(() => {
    process.env.GHL_WEBHOOK_SECRET = SECRET;
    process.env.DAVOXI_WEBHOOK_SECRET = "davoxi-secret";
  });
  afterAll(() => {
    delete process.env.GHL_WEBHOOK_SECRET;
    delete process.env.DAVOXI_WEBHOOK_SECRET;
  });

  async function postRaw(path: string, headerName: string, raw: Buffer) {
    const express = require("express");
    const router = require("../routes/webhooks").default;

    const app = express();
    app.use(`/webhooks`, express.raw({ type: "*/*" }), router);

    const sigKey = path === "/webhooks/ghl" ? SECRET : "davoxi-secret";
    const sig = crypto.createHmac("sha256", sigKey).update(raw).digest("hex");

    return new Promise<{ status: number; body: unknown }>((resolve) => {
      const server = app.listen(0, async () => {
        const addr = server.address() as { port: number };
        const url = `http://127.0.0.1:${addr.port}${path}`;
        try {
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", [headerName]: sig },
            body: raw,
          });
          const text = await res.text();
          let body: unknown;
          try { body = JSON.parse(text); } catch { body = text; }
          resolve({ status: res.status, body });
        } finally {
          server.close();
        }
      });
    });
  }

  it("returns 400 for malformed JSON in /webhooks/ghl (does not 500)", async () => {
    const raw = Buffer.from("{not valid json");
    const res = await postRaw("/webhooks/ghl", "x-ghl-signature", raw);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Invalid JSON body" });
  });

  it("returns 400 for malformed JSON in /webhooks/davoxi", async () => {
    const raw = Buffer.from("not-even-json-at-all");
    const res = await postRaw("/webhooks/davoxi", "x-davoxi-signature", raw);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Invalid JSON body" });
  });
});
