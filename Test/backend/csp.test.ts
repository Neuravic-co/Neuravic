import { describe, expect, it } from "vitest";
import { contentSecurityPolicy } from "../../NFE/lib/csp";

describe("document CSP", () => {
  it("requires request nonces for scripts, limits external sources, and keeps development exceptions out of production", () => {
    const policy = contentSecurityPolicy("testnonce", false, "https://api.test/api/v1");
    const scripts = policy.split(";").find((directive) => directive.trim().startsWith("script-src"))!;
    expect(scripts).toContain("'nonce-testnonce'"); expect(scripts).toContain("'strict-dynamic'");
    expect(scripts).not.toContain("unsafe-inline"); expect(scripts).not.toContain("unsafe-eval");
    expect(policy).not.toContain("ws:"); expect(policy).toContain("https://api.test");
    expect(policy).toContain("frame-ancestors 'none'"); expect(policy).toContain("object-src 'none'");
    expect(() => contentSecurityPolicy("testnonce", false, "http://api.test")).toThrow("HTTPS");
    expect(contentSecurityPolicy("testnonce", true)).toContain("'unsafe-eval'");
  });
});
