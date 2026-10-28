import assert from "node:assert/strict";
import { afterEach, it } from "node:test";
import { proxyToApi } from "../../nfe/lib/api-proxy";
const original = { origin: process.env.API_ORIGIN, fetch: globalThis.fetch };
afterEach(() => {
  if (original.origin === undefined) delete process.env.API_ORIGIN; else process.env.API_ORIGIN = original.origin;
  globalThis.fetch = original.fetch;
});
it("returns the explicit API configuration error when no backend origin exists", async () => {
  delete process.env.API_ORIGIN;
  const response = await proxyToApi(new Request("https://www.example.com/api/v1/leads", { method: "POST", body: "{}" }));
  assert.equal(response.status, 503); assert.equal((await response.json() as { code: string }).code, "api_unavailable");
});
it("routes the contact API to the configured backend without converting acceptance into delivery", async () => {
  process.env.API_ORIGIN = "https://api.example.com";
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://api.example.com/api/v1/leads"); assert.equal(init?.method, "POST");
    assert.ok(init?.signal); assert.equal(new Headers(init?.headers).get("origin"), "https://www.example.com");
    return Response.json({ id: "enquiry", status: "received" }, { status: 202 });
  };
  const response = await proxyToApi(new Request("https://www.example.com/api/v1/leads", { method: "POST", headers: { origin: "https://www.example.com" }, body: "{}" }));
  assert.equal(response.status, 202); assert.deepEqual(await response.json(), { id: "enquiry", status: "received" });
  assert.equal(response.headers.get("cache-control"), "no-store");
});
it("returns a safe error for a backend outage", async () => {
  process.env.API_ORIGIN = "https://api.example.com";
  globalThis.fetch = async () => { throw new Error("private connection details"); };
  const response = await proxyToApi(new Request("https://www.example.com/api/v1/leads"));
  assert.equal(response.status, 502); assert.ok(!(await response.text()).includes("private"));
});
