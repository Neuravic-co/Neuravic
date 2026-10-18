import { describe, expect, it } from "vitest";
import { makeTestApp } from "./helpers";

const lead = (n: number) => ({
  name: "Sara Ali",
  email: `sara${n}@example.com`,
  message: `We need to automate our access approval workflow, case ${n}.`,
  serviceInterest: ["ai"],
  consent: true,
});

async function submit(ctx: Awaited<ReturnType<typeof makeTestApp>>, n: number, headers: Record<string, string> = {}) {
  const res = await ctx.request("/api/v1/leads", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(lead(n)),
  });
  return res.status;
}

describe("visitor address behind the frontend proxy", () => {
  it("counts each visitor separately when the proxy secret matches", async () => {
    const ctx = await makeTestApp();
    ctx.deps.config.proxySecret = "s3cret-value";
    const trusted = (ip: string) => ({ "x-proxy-secret": "s3cret-value", "x-client-ip": ip });
    for (let i = 0; i < 5; i++) expect(await submit(ctx, i, trusted("203.0.113.1"))).toBe(202);
    expect(await submit(ctx, 5, trusted("203.0.113.1"))).toBe(429);
    expect(await submit(ctx, 6, trusted("203.0.113.2"))).toBe(202);
  });

  it("ignores the forwarded address when the secret is wrong or missing", async () => {
    const ctx = await makeTestApp();
    ctx.deps.config.proxySecret = "s3cret-value";
    for (let i = 0; i < 5; i++) expect(await submit(ctx, i, { "x-proxy-secret": "wrong", "x-client-ip": `203.0.113.${i}` })).toBe(202);
    // A spoofed address does not buy a fresh limit: everyone without the secret shares one bucket.
    expect(await submit(ctx, 5, { "x-client-ip": "203.0.113.99" })).toBe(429);
  });

  it("ignores the forwarded address when no secret is configured", async () => {
    const ctx = await makeTestApp();
    for (let i = 0; i < 5; i++) expect(await submit(ctx, i, { "x-proxy-secret": "x", "x-client-ip": `198.51.100.${i}` })).toBe(202);
    expect(await submit(ctx, 5, { "x-client-ip": "198.51.100.77" })).toBe(429);
  });
});
