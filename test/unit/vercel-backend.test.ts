import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBackend, shouldDrainAfter } from "../../nbe/services/vercel/src/app";

const CRON = "c".repeat(40);

function backend(env: Record<string, string> = {}, makeDeps: () => never = () => { throw new Error("no database"); }) {
  return createBackend({ waitUntil: () => undefined, env: { CRON_SECRET: CRON, ...env } as NodeJS.ProcessEnv, makeDeps });
}
const call = (b: ReturnType<typeof backend>, path: string, headers: Record<string, string> = {}) =>
  b.fetch(new Request(`https://api.example.com${path}`, { headers }));

describe("one-process backend", () => {
  it("answers file paths with 503 because file hosting is not part of it", async () => {
    const res = await call(backend(), "/api/v1/requests/abc/files");
    assert.equal(res.status, 503);
    assert.equal((await res.json() as { code: string }).code, "service_unavailable");
    assert.equal((await call(backend(), "/api/v1/files/abc")).status, 503);
  });

  it("does not expose the development mailbox", async () => {
    assert.equal((await call(backend(), "/api/v1/dev/mailbox")).status, 404);
  });

  it("rejects cron calls without the right secret", async () => {
    assert.equal((await call(backend(), "/internal/cron")).status, 401);
    assert.equal((await call(backend(), "/internal/cron", { authorization: "Bearer wrong" })).status, 401);
    assert.equal((await call(backend({ CRON_SECRET: "" }), "/internal/cron", { authorization: "Bearer " })).status, 401);
  });

  it("answers 503 instead of crashing when the backend cannot start", async () => {
    const res = await call(backend(), "/internal/cron", { authorization: `Bearer ${CRON}` });
    assert.equal(res.status, 503);
    const api = await call(backend(), "/api/v1/health");
    assert.equal(api.status, 503);
    assert.equal(api.headers.get("retry-after"), "5");
  });

  it("sends queued email right after an accepted enquiry, and only then", () => {
    const post = (path: string, method = "POST") => new Request(`https://api.example.com${path}`, { method });
    assert.equal(shouldDrainAfter(post("/api/v1/leads"), new Response(null, { status: 202 })), true);
    assert.equal(shouldDrainAfter(post("/api/v1/leads/"), new Response(null, { status: 202 })), true);
    assert.equal(shouldDrainAfter(post("/api/v1/leads"), new Response(null, { status: 422 })), false);
    assert.equal(shouldDrainAfter(post("/api/v1/leads", "GET"), new Response(null, { status: 202 })), false);
    assert.equal(shouldDrainAfter(post("/api/v1/auth/login"), new Response(null, { status: 202 })), false);
  });
});
