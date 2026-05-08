/**
 * Rate-limiter integration tests.
 *
 * The server.ts module mounts express-rate-limit per route group. These tests
 * spin a fresh limiter (so they don't carry state from server.ts module load
 * order) with a tight cap, and verify that excess requests get 429 with the
 * standard rate-limit headers and that JSON bodies report the configured
 * error string.
 */
import express from "express";
import rateLimit from "express-rate-limit";
import type { AddressInfo } from "net";

async function fire(port: number, path: string) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`);
  return { status: res.status, body: await res.text(), headers: res.headers };
}

describe("rate-limit middleware", () => {
  it("returns 429 with the configured message after exceeding the cap", async () => {
    const app = express();
    const limiter = rateLimit({
      windowMs: 60_000,
      max: 3,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: "Too many requests" },
    });
    app.use("/limited", limiter, (_req, res) => res.json({ ok: true }));

    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;
    try {
      // 3 allowed
      for (let i = 0; i < 3; i++) {
        const r = await fire(port, "/limited");
        expect(r.status).toBe(200);
      }
      // 4th over the cap
      const blocked = await fire(port, "/limited");
      expect(blocked.status).toBe(429);
      expect(JSON.parse(blocked.body)).toMatchObject({ error: "Too many requests" });
      // standard headers must be present (RateLimit-* family)
      expect(blocked.headers.get("ratelimit-limit")).toBe("3");
      expect(blocked.headers.get("ratelimit-remaining")).toBe("0");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("does not emit legacy X-RateLimit-* headers when legacyHeaders is false", async () => {
    const app = express();
    const limiter = rateLimit({
      windowMs: 60_000,
      max: 1,
      standardHeaders: true,
      legacyHeaders: false,
    });
    app.use("/legacy", limiter, (_req, res) => res.json({ ok: true }));

    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;
    try {
      const ok = await fire(port, "/legacy");
      expect(ok.status).toBe(200);
      expect(ok.headers.get("x-ratelimit-limit")).toBeNull();
      expect(ok.headers.get("ratelimit-limit")).toBe("1");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("server.ts mounts rate-limit on each route group", () => {
    // Smoke-test: ensure the server module imports rate-limit middleware so the
    // protections live with the route definitions, not just here in tests.
    const serverSrc = require("fs").readFileSync(
      require("path").join(__dirname, "..", "server.ts"),
      "utf-8",
    ) as string;
    expect(serverSrc).toContain('import rateLimit from "express-rate-limit"');
    expect(serverSrc).toMatch(/oauthLimiter\s*=\s*rateLimit/);
    expect(serverSrc).toMatch(/webhookLimiter\s*=\s*rateLimit/);
    expect(serverSrc).toMatch(/internalLimiter\s*=\s*rateLimit/);
    // mounted on every route group
    expect(serverSrc).toMatch(/app\.use\("\/oauth", oauthLimiter/);
    expect(serverSrc).toMatch(/app\.use\("\/webhooks", webhookLimiter/);
    expect(serverSrc).toMatch(/app\.use\("\/settings", internalLimiter/);
    expect(serverSrc).toMatch(/app\.use\("\/actions", internalLimiter/);
  });
});
