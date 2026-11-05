import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createApp } from "../../nbe/src/app";
import { createBackend } from "../../nbe/services/vercel/src/app";
import { productionEnv, secret, testContainer } from "./fixtures";

const call = (backend: ReturnType<typeof createBackend>, path: string, headers: Record<string, string> = {}) =>
  backend.fetch(new Request(`https://api.example.com${path}`, { headers }));

describe("one-process backend on Vercel", () => {
  it("rejects cron calls without the right secret", async () => {
    const backend = createBackend({ waitUntil: () => undefined, env: productionEnv, container: testContainer(productionEnv) });
    assert.equal((await call(backend, "/internal/cron")).status, 401);
    assert.equal((await call(backend, "/internal/cron", { authorization: "Bearer wrong" })).status, 401);
  });

  it("answers 503 instead of crashing when the backend cannot start", async () => {
    const backend = createBackend({ waitUntil: () => undefined, env: {} });
    const response = await call(backend, "/api/v1/health");
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("retry-after"), "5");
  });

  it("serves the API once it can start", async () => {
    const backend = createBackend({ waitUntil: () => undefined, env: productionEnv, container: testContainer(productionEnv) });
    assert.equal((await call(backend, "/api/v1/health")).status, 200);
  });

  it("only believes the visitor address that the website proxy signed", async () => {
    const seen: string[] = [];
    const container = testContainer(productionEnv, { botCheck: { verify: async (_token, ip) => (seen.push(ip), false) } });
    const backend = createBackend({ waitUntil: () => undefined, env: productionEnv, container });
    const post = (headers: Record<string, string>) =>
      backend.fetch(new Request("https://api.example.com/api/v1/leads", {
        method: "POST",
        headers: { origin: "https://www.example.com", "content-type": "application/json", ...headers },
        body: JSON.stringify({ name: "Sara", email: "sara@example.com", message: "A valid contact enquiry.", consent: true }),
      }));

    await post({ "x-client-ip": "203.0.113.9", "x-proxy-secret": secret("x") });
    await post({ "x-client-ip": "203.0.113.10", "x-proxy-secret": "wrong".repeat(10), "x-real-ip": "198.51.100.4" });
    await post({ "x-client-ip": "203.0.113.11" });
    assert.deepEqual(seen, ["203.0.113.9", "198.51.100.4", "unknown"]);
  });

  it("builds the same application the Node server runs", () => {
    assert.equal(typeof createApp(testContainer(productionEnv)).fetch, "function");
  });
});
