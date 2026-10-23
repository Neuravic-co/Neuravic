import { describe, expect, it, vi } from "vitest";
import { MemoryBlobStore } from "../../NBE/src/modules/files/blob-store";
import { schema } from "../../NBE/src/db";
import { scanPendingFiles } from "../../NBE/src/modules/files/scanner";
import { as, asJson, body, makeTestApp, seedOrg, signIn } from "./helpers";

async function setup() {
  const ctx = await makeTestApp();
  const orgId = await seedOrg(ctx, "acme", { "owner@acme.dev": "owner", "member@acme.dev": "member", "viewer@acme.dev": "viewer" });
  await seedOrg(ctx, "other", { "owner@other.dev": "owner" });
  const owner = await signIn(ctx, "owner@acme.dev");
  const project = await body(await ctx.request(`/api/v1/orgs/${orgId}/projects`, asJson(owner, "POST", { name: "Project One" })));
  const member = await signIn(ctx, "member@acme.dev");
  const request = await body(await ctx.request(`/api/v1/projects/${project.id}/requests`, asJson(member, "POST", { type: "change", title: "Update", body: "Details" })));
  return { ctx, owner, member, request };
}

const upload = (cookie: string, type: string, data: BodyInit) =>
  as(cookie, { method: "PUT", body: data, headers: { "content-type": type } });

describe("files", () => {
  it.each(["scan", "download"].flatMap((operation) => ["lookup", "stream"].map((stage) => ({ operation, stage }))))("bounds a stalled storage $stage during $operation and keeps it quarantined", async ({ operation, stage }) => {
    const { ctx, member, request } = await setup();
    if (operation === "download") ctx.deps.scanner = { scan: async () => "clean" };
    const file = await body(await ctx.request(`/api/v1/requests/${request.id}/files?name=slow.txt`, upload(member, "text/plain", "hello")));
    let cancelled = false;
    let started!: () => void;
    const entered = new Promise<void>((resolve) => { started = resolve; });
    ctx.deps.blobs!.get = async () => { started(); if (stage === "lookup") return new Promise(() => {}); return { contentType: "text/plain", body: new ReadableStream({ cancel() { cancelled = true; } }) }; };
    ctx.deps.scanner = { scan: vi.fn(async () => "clean" as const) };
    const realSetTimeout = globalThis.setTimeout;
    const realClearTimeout = globalThis.clearTimeout;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    vi.useFakeTimers();
    try {
      const pending = operation === "scan" ? scanPendingFiles(ctx.deps) : ctx.request(`/api/v1/files/${file.id}/content`, as(member));
      await entered;
      await vi.advanceTimersByTimeAsync(10001);
      // Avoid a hanging regression on the broken implementation.
      const result = await Promise.race([pending, new Promise((resolve) => { watchdog = realSetTimeout(() => resolve("still_pending"), 1000); })]);
      expect(result).not.toBe("still_pending");
      if (operation === "scan") expect(result).toBe(0);
      else expect((result as Response).status).toBe(423);
      expect(cancelled).toBe(stage === "stream");
      expect(ctx.deps.scanner.scan).not.toHaveBeenCalled();
      const [stored] = await ctx.deps.db.select().from(schema.files);
      expect(stored!.scanState).toBe("pending");
    } finally { realClearTimeout(watchdog); vi.useRealTimers(); }
  });

  it("uploads, lists and downloads as an attachment", async () => {
    const { ctx, member, request } = await setup();
    ctx.deps.scanner = { scan: async () => "clean" };
    const res = await ctx.request(`/api/v1/requests/${request.id}/files?name=${encodeURIComponent("plan.pdf")}`, upload(member, "application/pdf", "%PDF-1.4 hello"));
    expect(res.status).toBe(201);
    const file = await body(res);
    expect(file.sha256).toHaveLength(64);
    expect(file).not.toHaveProperty("storageKey");

    const viewer = await signIn(ctx, "viewer@acme.dev");
    const list = await body(await ctx.request(`/api/v1/requests/${request.id}/files`, as(viewer)));
    expect(list.items).toHaveLength(1);
    const download = await ctx.request(`/api/v1/files/${file.id}/content`, as(viewer));
    expect(download.status).toBe(200);
    expect(download.headers.get("content-disposition")).toContain("attachment");
    expect(await download.text()).toBe("%PDF-1.4 hello");
  });

  it("rejects disallowed types, empty files and oversize files", async () => {
    const { ctx, member, request } = await setup();
    const url = `/api/v1/requests/${request.id}/files?name=x`;
    expect((await ctx.request(url, upload(member, "image/svg+xml", "<svg/>"))).status).toBe(415);
    expect((await ctx.request(url, upload(member, "text/html", "<b>"))).status).toBe(415);
    expect((await ctx.request(url, upload(member, "text/plain", ""))).status).toBe(400);
    ctx.deps.config.maxUploadBytes = 10;
    expect((await ctx.request(url, upload(member, "text/plain", "this is longer than ten bytes"))).status).toBe(413);
  });

  it("viewers cannot upload and other orgs cannot download", async () => {
    const { ctx, member, request } = await setup();
    const viewer = await signIn(ctx, "viewer@acme.dev");
    expect((await ctx.request(`/api/v1/requests/${request.id}/files?name=a.txt`, upload(viewer, "text/plain", "hi"))).status).toBe(403);
    const file = await body(await ctx.request(`/api/v1/requests/${request.id}/files?name=a.txt`, upload(member, "text/plain", "hi")));
    const outsider = await signIn(ctx, "owner@other.dev");
    expect((await ctx.request(`/api/v1/files/${file.id}/content`, as(outsider))).status).toBe(404);
  });

  it("sanitises file names and lets the uploader or an admin delete", async () => {
    const { ctx, member, owner, request } = await setup();
    const file = await body(await ctx.request(`/api/v1/requests/${request.id}/files?name=${encodeURIComponent("../../etc/pass\"wd.txt")}`, upload(member, "text/plain", "hi")));
    expect(file.name).toBe("passwd.txt");
    const viewer = await signIn(ctx, "viewer@acme.dev");
    expect((await ctx.request(`/api/v1/files/${file.id}`, as(viewer, { method: "DELETE" }))).status).toBe(403);
    expect((await ctx.request(`/api/v1/files/${file.id}`, as(owner, { method: "DELETE" }))).status).toBe(204);
    expect((await ctx.request(`/api/v1/files/${file.id}/content`, as(owner))).status).toBe(404);
  });

  it("answers 503 when no storage is configured and cleans up on failure", async () => {
    const { ctx, member, request } = await setup();
    const store = ctx.deps.blobs as MemoryBlobStore;
    ctx.deps.blobs = null;
    expect((await ctx.request(`/api/v1/requests/${request.id}/files?name=a.txt`, upload(member, "text/plain", "hi"))).status).toBe(503);
    ctx.deps.blobs = store;
    expect(store.objects.size).toBe(0);
  });

  it("quarantines pending and infected bytes for every role, then releases only a clean digest-bound scan", async () => {
    const { ctx, member, owner, request } = await setup();
    const file = await body(await ctx.request(`/api/v1/requests/${request.id}/files?name=a.txt`, upload(member, "text/plain", "hello")));
    for (const cookie of [owner, member]) {
      const pending = await ctx.request(`/api/v1/files/${file.id}/content`, as(cookie));
      expect(pending.status).toBe(423); expect(pending.headers.get("cache-control")).toBe("no-store");
    }
    ctx.deps.scanner = { scan: async () => "infected" };
    expect(await scanPendingFiles(ctx.deps)).toBe(1);
    expect((await ctx.request(`/api/v1/files/${file.id}/content`, as(owner))).status).toBe(423);
    ctx.deps.scanner = { scan: async () => "clean" };
    const safe = await body(await ctx.request(`/api/v1/requests/${request.id}/files?name=b.txt`, upload(member, "text/plain", "good")));
    const download = await ctx.request(`/api/v1/files/${safe.id}/content`, as(owner));
    expect(download.status).toBe(200);
    expect(download.headers.get("content-security-policy")).toContain("sandbox");
    expect(await download.text()).toBe("good");
  });

  it("keeps failures and changed storage content quarantined and backs off retries", async () => {
    const { ctx, member, request } = await setup();
    const file = await body(await ctx.request(`/api/v1/requests/${request.id}/files?name=a.txt`, upload(member, "text/plain", "hello")));
    let calls = 0;
    ctx.deps.scanner = { scan: async () => { calls++; throw new Error("private-provider-diagnostics"); } };
    await scanPendingFiles(ctx.deps);
    await scanPendingFiles(ctx.deps);
    expect(calls).toBe(1);
    const [stored] = await ctx.deps.db.select().from(schema.files);
    expect(stored!.scanState).toBe("pending"); expect(stored!.scanAttempts).toBe(1);
    const store = ctx.deps.blobs as MemoryBlobStore;
    store.objects.get(stored!.storageKey)!.data = new TextEncoder().encode("altered").buffer as ArrayBuffer;
    ctx.deps.now = () => stored!.nextScanAt + 1;
    ctx.deps.scanner = { scan: async () => { calls++; return "clean"; } };
    await scanPendingFiles(ctx.deps);
    expect(calls).toBe(1);
    expect((await ctx.request(`/api/v1/files/${file.id}/content`, as(member))).status).toBe(423);
  });

  it("rejects spoofed binary types and malformed UTF-8 before storing content", async () => {
    const { ctx, member, request } = await setup();
    for (const mime of ["application/pdf", "image/png", "image/jpeg", "image/webp", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]) {
      expect((await ctx.request(`/api/v1/requests/${request.id}/files`, upload(member, mime, "<script>fake</script>"))).status).toBe(415);
    }
    expect((await ctx.request(`/api/v1/requests/${request.id}/files`, upload(member, "text/plain", new Uint8Array([0xff])))).status).toBe(415);
    expect((ctx.deps.blobs as MemoryBlobStore).objects.size).toBe(0);
  });

  it("never serves storage bytes replaced after a clean scan and ignores storage MIME changes", async () => {
    const { ctx, member, request } = await setup();
    ctx.deps.scanner = { scan: async () => "clean" };
    const file = await body(await ctx.request(`/api/v1/requests/${request.id}/files?name=a.txt`, upload(member, "text/plain", "clean")));
    const [row] = await ctx.deps.db.select().from(schema.files);
    const stored = (ctx.deps.blobs as MemoryBlobStore).objects.get(row!.storageKey)!;
    stored.contentType = "text/html";
    expect((await ctx.request(`/api/v1/files/${file.id}/content`, as(member))).headers.get("content-type")).toBe("text/plain");
    stored.data = new TextEncoder().encode("other").buffer as ArrayBuffer; // same length, different digest
    const response = await ctx.request(`/api/v1/files/${file.id}/content`, as(member));
    expect(response.status).toBe(423);
    expect(await response.text()).not.toContain("other");
    expect((await ctx.deps.db.select().from(schema.files))[0]!.scanState).toBe("pending");
  });
});
