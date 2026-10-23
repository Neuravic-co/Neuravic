import { describe, expect, it, vi } from "vitest";
import { ServiceMalwareScanner } from "../../NBE/src/modules/files/scanner";

describe("private malware scanner protocol", () => {
  it("sends bytes only to its binding and accepts only a digest-bound verdict", async () => {
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => Response.json({ status: "clean", sha256: "digest" }));
    const scanner = new ServiceMalwareScanner({ fetch } as never);
    expect(await scanner.scan(new ArrayBuffer(2), "digest")).toBe("clean");
    expect(fetch.mock.calls[0]?.[0]).toBe("https://scanner.internal/scan");
    const options = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.redirect).toBe("error");
    expect(options.headers).toEqual({ "content-type": "application/octet-stream", "x-content-sha256": "digest" });
  });

  it("fails closed on errors, a different digest, missing fields, large or invalid responses", async () => {
    for (const result of [
      new Response("outage", { status: 503 }), Response.json({ status: "clean", sha256: "other" }),
      Response.json({ status: "clean" }), Response.json({ status: "pending", sha256: "digest" }),
      new Response("not-json", { headers: { "content-type": "application/json" } }), Response.json({ data: "x".repeat(2048) }),
    ]) {
      const scanner = new ServiceMalwareScanner({ fetch: async () => result } as never);
      await expect(scanner.scan(new ArrayBuffer(1), "digest")).rejects.toThrow();
    }
  });
});
