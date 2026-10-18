import { describe, expect, it } from "vitest";
import { as, asJson, body, makeTestApp, seedOrg, seedUser, signIn } from "./helpers";

async function setup() {
  const ctx = await makeTestApp();
  await seedUser(ctx, "delivery@test.dev", { staffRole: "delivery" });
  const orgId = await seedOrg(ctx, "acme", {
    "owner@acme.dev": "owner",
    "admin@acme.dev": "admin",
    "member@acme.dev": "member",
    "viewer@acme.dev": "viewer",
  });
  const otherOrg = await seedOrg(ctx, "other", { "owner@other.dev": "owner" });
  const owner = await signIn(ctx, "owner@acme.dev");
  const project = await body(await ctx.request(`/api/v1/orgs/${orgId}/projects`, asJson(owner, "POST", { name: "Dubai access" })));
  return { ctx, orgId, otherOrg, project, owner };
}

const newRequest = { type: "access", title: "Badge for contractor", body: "Needs level 2 access to the site." };

describe("portal projects", () => {
  it("only admins create projects; members can list them", async () => {
    const { ctx, orgId } = await setup();
    const member = await signIn(ctx, "member@acme.dev");
    expect((await ctx.request(`/api/v1/orgs/${orgId}/projects`, asJson(member, "POST", { name: "Nope" }))).status).toBe(403);
    const list = await body(await ctx.request(`/api/v1/orgs/${orgId}/projects`, as(member)));
    expect(list.items).toHaveLength(1);
  });

  it("isolates tenants", async () => {
    const { ctx, orgId, project } = await setup();
    const outsider = await signIn(ctx, "owner@other.dev");
    expect((await ctx.request(`/api/v1/orgs/${orgId}/projects`, as(outsider))).status).toBe(404);
    expect((await ctx.request(`/api/v1/projects/${project.id}`, as(outsider))).status).toBe(404);
  });

  it("updates a project and gives delivery staff access", async () => {
    const { ctx, project } = await setup();
    const delivery = await signIn(ctx, "delivery@test.dev");
    const res = await ctx.request(`/api/v1/projects/${project.id}`, asJson(delivery, "PATCH", { status: "paused" }));
    expect(res.status).toBe(200);
    const member = await signIn(ctx, "member@acme.dev");
    const blocked = await ctx.request(`/api/v1/projects/${project.id}/requests`, asJson(member, "POST", newRequest));
    expect(blocked.status).toBe(409);
  });
});

describe("requests and approvals", () => {
  it("member submits, admin approves, requester is emailed", async () => {
    const { ctx, project } = await setup();
    const member = await signIn(ctx, "member@acme.dev");
    const created = await ctx.request(`/api/v1/projects/${project.id}/requests`, asJson(member, "POST", newRequest));
    expect(created.status).toBe(201);
    const request = await body(created);
    // Owner and admin were notified, the requester was not.
    const notified = ctx.mailer.sent.filter((m) => m.subject.startsWith("Approval needed")).map((m) => m.to).sort();
    expect(notified).toEqual(["admin@acme.dev", "owner@acme.dev"]);

    const admin = await signIn(ctx, "admin@acme.dev");
    const decided = await ctx.request(`/api/v1/requests/${request.id}/approvals`, asJson(admin, "POST", { decision: "approved", comment: "OK" }));
    expect((await body(decided)).state).toBe("approved");
    expect(ctx.mailer.sent.at(-1)?.to).toBe("member@acme.dev");

    const detail = await body(await ctx.request(`/api/v1/requests/${request.id}`, as(member)));
    expect(detail.state).toBe("approved");
    expect(detail.approvals).toHaveLength(1);
  });

  it("blocks self-approval, viewers and duplicate decisions", async () => {
    const { ctx, project } = await setup();
    const admin = await signIn(ctx, "admin@acme.dev");
    const request = await body(await ctx.request(`/api/v1/projects/${project.id}/requests`, asJson(admin, "POST", { ...newRequest, requiredApprovals: 2 })));
    expect((await ctx.request(`/api/v1/requests/${request.id}/approvals`, asJson(admin, "POST", { decision: "approved" }))).status).toBe(403);
    const member = await signIn(ctx, "member@acme.dev");
    expect((await ctx.request(`/api/v1/requests/${request.id}/approvals`, asJson(member, "POST", { decision: "approved" }))).status).toBe(403);
    const owner = await signIn(ctx, "owner@acme.dev");
    const first = await body(await ctx.request(`/api/v1/requests/${request.id}/approvals`, asJson(owner, "POST", { decision: "approved" })));
    expect(first.state).toBe("open"); // needs 2 approvals
    expect((await ctx.request(`/api/v1/requests/${request.id}/approvals`, asJson(owner, "POST", { decision: "approved" }))).status).toBe(409);
  });

  it("a rejection closes the request immediately", async () => {
    const { ctx, project } = await setup();
    const member = await signIn(ctx, "member@acme.dev");
    const request = await body(await ctx.request(`/api/v1/projects/${project.id}/requests`, asJson(member, "POST", newRequest)));
    const owner = await signIn(ctx, "owner@acme.dev");
    const res = await body(await ctx.request(`/api/v1/requests/${request.id}/approvals`, asJson(owner, "POST", { decision: "rejected", comment: "No" })));
    expect(res.state).toBe("rejected");
    const again = await ctx.request(`/api/v1/requests/${request.id}/approvals`, asJson(await signIn(ctx, "admin@acme.dev"), "POST", { decision: "approved" }));
    expect(again.status).toBe(409);
  });

  it("requesters cancel open requests; only admins complete approved ones", async () => {
    const { ctx, project } = await setup();
    const member = await signIn(ctx, "member@acme.dev");
    const r1 = await body(await ctx.request(`/api/v1/projects/${project.id}/requests`, asJson(member, "POST", newRequest)));
    expect((await ctx.request(`/api/v1/requests/${r1.id}`, asJson(member, "PATCH", { state: "cancelled" }))).status).toBe(200);

    const r2 = await body(await ctx.request(`/api/v1/projects/${project.id}/requests`, asJson(member, "POST", newRequest)));
    const owner = await signIn(ctx, "owner@acme.dev");
    await ctx.request(`/api/v1/requests/${r2.id}/approvals`, asJson(owner, "POST", { decision: "approved" }));
    expect((await ctx.request(`/api/v1/requests/${r2.id}`, asJson(member, "PATCH", { state: "completed" }))).status).toBe(403);
    expect((await ctx.request(`/api/v1/requests/${r2.id}`, asJson(owner, "PATCH", { state: "completed" }))).status).toBe(200);
  });

  it("lists the approver queue by state", async () => {
    const { ctx, orgId, project } = await setup();
    const member = await signIn(ctx, "member@acme.dev");
    await ctx.request(`/api/v1/projects/${project.id}/requests`, asJson(member, "POST", newRequest));
    const queue = await body(await ctx.request(`/api/v1/orgs/${orgId}/requests?state=open`, as(member)));
    expect(queue.items).toHaveLength(1);
    const none = await body(await ctx.request(`/api/v1/orgs/${orgId}/requests?state=approved`, as(member)));
    expect(none.items).toHaveLength(0);
  });
});

describe("comments and activity", () => {
  it("members comment, viewers read, and the feed records activity", async () => {
    const { ctx, orgId, project } = await setup();
    const member = await signIn(ctx, "member@acme.dev");
    const request = await body(await ctx.request(`/api/v1/projects/${project.id}/requests`, asJson(member, "POST", newRequest)));
    expect((await ctx.request(`/api/v1/requests/${request.id}/comments`, asJson(member, "POST", { body: "Please hurry" }))).status).toBe(201);
    const viewer = await signIn(ctx, "viewer@acme.dev");
    expect((await ctx.request(`/api/v1/requests/${request.id}/comments`, asJson(viewer, "POST", { body: "hi" }))).status).toBe(403);
    expect((await body(await ctx.request(`/api/v1/requests/${request.id}/comments`, as(viewer)))).items).toHaveLength(1);

    const feed = await body(await ctx.request(`/api/v1/orgs/${orgId}/activity`, as(viewer)));
    const actions = feed.items.map((i: { action: string }) => i.action);
    expect(actions).toEqual(expect.arrayContaining(["project.created", "request.created", "comment.added"]));
  });
});

describe("people details for the UI", () => {
  it("includes names and emails on requests, approvals, comments and activity", async () => {
    const { ctx, orgId, project } = await setup();
    const member = await signIn(ctx, "member@acme.dev");
    const request = await body(await ctx.request(`/api/v1/projects/${project.id}/requests`, asJson(member, "POST", newRequest)));
    const comment = await body(await ctx.request(`/api/v1/requests/${request.id}/comments`, asJson(member, "POST", { body: "Hello" })));
    expect(comment.authorEmail).toBe("member@acme.dev");

    const owner = await signIn(ctx, "owner@acme.dev");
    await ctx.request(`/api/v1/requests/${request.id}/approvals`, asJson(owner, "POST", { decision: "approved" }));

    const detail = await body(await ctx.request(`/api/v1/requests/${request.id}`, as(owner)));
    expect(detail.requesterEmail).toBe("member@acme.dev");
    expect(detail.approvals[0].approverEmail).toBe("owner@acme.dev");
    expect(detail.comments[0].authorEmail).toBe("member@acme.dev");

    const queue = await body(await ctx.request(`/api/v1/orgs/${orgId}/requests`, as(owner)));
    expect(queue.items[0].requesterEmail).toBe("member@acme.dev");
    const projectList = await body(await ctx.request(`/api/v1/projects/${project.id}/requests`, as(owner)));
    expect(projectList.items[0].requesterEmail).toBe("member@acme.dev");

    const feed = await body(await ctx.request(`/api/v1/orgs/${orgId}/activity`, as(owner)));
    expect(feed.items.some((i: { actorEmail: string }) => i.actorEmail === "member@acme.dev")).toBe(true);
  });
});
