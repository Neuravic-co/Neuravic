import { describe, expect, it } from "vitest";
import { MemoryBlobStore } from "../../NBE/src/modules/files/blob-store";
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
  it("uploads, lists and downloads as an attachment", async () => {
    const { ctx, member, request } = await setup();
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
});
