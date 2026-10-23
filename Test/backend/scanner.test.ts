import { describe, expect, it, vi } from "vitest";
import { readStoredFile, ServiceMalwareScanner, withScanDeadline } from "../../NBE/src/modules/files/scanner";
import { MemoryBlobStore, type StoredBlob } from "../../NBE/src/modules/files/blob-store";

describe("private malware scanner protocol", () => {
  it("cancels bytes returned by a storage lookup after its deadline", async () => {
    vi.useFakeTimers();
    try {
      const store = new MemoryBlobStore();
      let resolve!: (blob: StoredBlob) => void;
      store.get = () => new Promise((done) => { resolve = done; });
      const result = expect(readStoredFile(store, "fixture", 1024)).rejects.toThrow("scan_timeout");
      await vi.advanceTimersByTimeAsync(10001); await result;
      let cancelled = false;
      resolve({ contentType: "text/plain", body: new ReadableStream({ cancel() { cancelled = true; } }) });
      await vi.advanceTimersByTimeAsync(0);
      expect(cancelled).toBe(true);
    } finally { vi.useRealTimers(); }
  });

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
      Response.json({ status: ["clean"], sha256: "digest" }),
      new Response("not-json", { headers: { "content-type": "application/json" } }), Response.json({ data: "x".repeat(2048) }),
    ]) {
      const scanner = new ServiceMalwareScanner({ fetch: async () => result } as never);
      await expect(scanner.scan(new ArrayBuffer(1), "digest")).rejects.toThrow();
    }
  });

  it("aborts an unresponsive scanner and cancels a stalled verdict stream", async () => {
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | undefined;
      const pending = withScanDeadline((value) => { signal = value; return new Promise(() => {}); });
      const failure = expect(pending).rejects.toThrow("scan_timeout");
      await vi.advanceTimersByTimeAsync(10001); await failure;
      expect(signal!.aborted).toBe(true);
      let cancelled = false;
      const scanner = new ServiceMalwareScanner({ fetch: async () => new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { "content-type": "application/json" } }) } as never);
      const stalled = expect(scanner.scan(new ArrayBuffer(1), "digest")).rejects.toThrow();
      await vi.advanceTimersByTimeAsync(10001); await stalled;
      expect(cancelled).toBe(true);
    } finally { vi.useRealTimers(); }
  });
});
