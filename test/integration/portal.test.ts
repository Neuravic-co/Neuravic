import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { Client, PNG, email, newOrganisation, requireBackend, signInByLink, staffAdmin } from "./support";

requireBackend();

describe("organisations, projects and requests", () => {
  let staff: Client;
  let a: Awaited<ReturnType<typeof newOrganisation>>;
  let b: Awaited<ReturnType<typeof newOrganisation>>;
  let projectId = "";
  let requestId = "";

  before(async () => {
    staff = await staffAdmin();
    a = await newOrganisation(staff, "Alpha");
    b = await newOrganisation(staff, "Beta");
  });

  it("makes the invited person the owner of the new organisation", async () => {
    const me = await a.owner.call("GET", "/me");
    assert.ok(me.data.memberships.some((m: any) => m.orgId === a.orgId && m.role === "owner"));
    assert.equal((await a.owner.call("GET", `/orgs/${a.orgId}`)).data.role, "owner");
  });

  it("lets only staff create organisations", async () => {
    const res = await a.owner.call("POST", "/orgs", { name: "Sneaky org" });
    assert.equal(res.status, 403);
  });

  it("lets an owner create and change a project and file a request", async () => {
    const project = await a.owner.call("POST", `/orgs/${a.orgId}/projects`, { name: "Website revamp", description: "New site" });
    assert.equal(project.status, 201);
    projectId = project.data.id;
    assert.equal((await a.owner.call("PATCH", `/projects/${projectId}`, { description: "Phase 1" })).data.description, "Phase 1");
    const request = await a.owner.call("POST", `/projects/${projectId}/requests`, { type: "change", title: "Add a pricing page", body: "Please add one.", requiredApprovals: 1 });
    assert.equal(request.status, 201);
    requestId = request.data.id;
    assert.equal(request.data.state, "open");
  });

  it("keeps organisations apart: nobody can see or touch another organisation's data", async () => {
    // Beta's owner is signed in and valid, but nothing in Alpha belongs to them.
    for (const [method, path, body] of [
      ["GET", `/orgs/${a.orgId}`],
      ["GET", `/orgs/${a.orgId}/projects`],
      ["GET", `/orgs/${a.orgId}/members`],
      ["GET", `/orgs/${a.orgId}/requests`],
      ["GET", `/orgs/${a.orgId}/activity`],
      ["GET", `/projects/${projectId}`],
      ["PATCH", `/projects/${projectId}`, { name: "Hijacked" }],
      ["GET", `/projects/${projectId}/requests`],
      ["GET", `/requests/${requestId}`],
      ["GET", `/requests/${requestId}/comments`],
      ["POST", `/requests/${requestId}/comments`, { body: "Let me in" }],
      ["POST", `/requests/${requestId}/approvals`, { decision: "approved" }],
      ["PATCH", `/requests/${requestId}`, { state: "cancelled" }],
      ["GET", `/requests/${requestId}/files`],
    ] as [string, string, unknown?][]) {
      const res = await b.owner.call(method, path, body);
      assert.equal(res.status, 404, `${method} ${path} should be hidden from another organisation, got ${res.status}`);
    }
    assert.equal((await b.owner.call("POST", `/orgs/${a.orgId}/projects`, { name: "Injected" })).status, 404);
    assert.equal((await b.owner.call("POST", `/orgs/${a.orgId}/members`, { email: email("intruder"), role: "owner" })).status, 404);
    // And the project is untouched.
    assert.equal((await a.owner.call("GET", `/projects/${projectId}`)).data.name, "Website revamp");
  });

  it("shows an anonymous visitor nothing", async () => {
    const anon = new Client();
    assert.equal((await anon.call("GET", `/orgs/${a.orgId}`)).status, 401);
    assert.equal((await anon.call("GET", `/requests/${requestId}`)).status, 401);
  });

  it("enforces roles inside an organisation", async () => {
    const viewerEmail = email("viewer");
    const memberEmail = email("member");
    assert.equal((await a.owner.call("POST", `/orgs/${a.orgId}/members`, { email: viewerEmail, role: "viewer" })).status, 201);
    assert.equal((await a.owner.call("POST", `/orgs/${a.orgId}/members`, { email: memberEmail, role: "member" })).status, 201);
    const viewer = new Client();
    const member = new Client();
    await signInByLink(viewer, viewerEmail);
    await signInByLink(member, memberEmail);

    assert.equal((await viewer.call("GET", `/projects/${projectId}`)).status, 200, "a viewer can read");
    assert.equal((await viewer.call("POST", `/projects/${projectId}/requests`, { type: "support", title: "Help", body: "Please" })).status, 403, "a viewer cannot write");
    assert.equal((await viewer.call("POST", `/requests/${requestId}/comments`, { body: "hi" })).status, 403);
    assert.equal((await member.call("POST", `/projects/${projectId}/requests`, { type: "support", title: "Help", body: "Please help me" })).status, 201, "a member can file requests");
    assert.equal((await member.call("POST", `/orgs/${a.orgId}/projects`, { name: "Not allowed" })).status, 403, "a member cannot create projects");
    assert.equal((await member.call("POST", `/orgs/${a.orgId}/members`, { email: email("x"), role: "member" })).status, 403, "a member cannot invite people");
    assert.equal((await member.call("POST", `/requests/${requestId}/approvals`, { decision: "approved" })).status, 403, "a member cannot approve");
  });

  it("never lets someone grant a role above their own", async () => {
    const adminEmail = email("orgadmin");
    assert.equal((await a.owner.call("POST", `/orgs/${a.orgId}/members`, { email: adminEmail, role: "admin" })).status, 201);
    const orgAdmin = new Client();
    await signInByLink(orgAdmin, adminEmail);
    const res = await orgAdmin.call("POST", `/orgs/${a.orgId}/members`, { email: email("wannabe"), role: "owner" });
    assert.equal(res.status, 403);
  });

  it("does not let people approve their own request, but lets another admin decide", async () => {
    assert.equal((await a.owner.call("POST", `/requests/${requestId}/approvals`, { decision: "approved" })).status, 403);
    const approverEmail = email("approver");
    await a.owner.call("POST", `/orgs/${a.orgId}/members`, { email: approverEmail, role: "admin" });
    const approver = new Client();
    await signInByLink(approver, approverEmail);
    assert.equal((await approver.call("POST", `/requests/${requestId}/approvals`, { decision: "approved", comment: "Go ahead" })).status, 201);
    const request = await a.owner.call("GET", `/requests/${requestId}`);
    assert.equal(request.data.state, "approved");
    assert.equal(request.data.approvals.length, 1);
    assert.ok(request.data.approvals[0].approverName !== undefined || request.data.approvals[0].approverEmail);
    // A decided request cannot be decided again.
    assert.equal((await approver.call("POST", `/requests/${requestId}/approvals`, { decision: "rejected" })).status, 409);
  });

  it("records comments with the author's details", async () => {
    const comment = await a.owner.call("POST", `/requests/${requestId}/comments`, { body: "Any update?" });
    assert.equal(comment.status, 201);
    const list = await a.owner.call("GET", `/requests/${requestId}/comments`);
    assert.ok(list.data.items.some((c: any) => c.body === "Any update?" && c.authorEmail));
  });

  it("keeps an organisation's last owner in place", async () => {
    const me = await a.owner.call("GET", "/me");
    const ownerId = me.data.user.id;
    assert.equal((await a.owner.call("PATCH", `/orgs/${a.orgId}/members/${ownerId}`, { role: "member" })).status, 409);
    assert.equal((await a.owner.call("DELETE", `/orgs/${a.orgId}/members/${ownerId}`)).status, 409);
  });

  it("lists the organisation's activity", async () => {
    const activity = await a.owner.call("GET", `/orgs/${a.orgId}/activity`);
    assert.equal(activity.status, 200);
    assert.ok(activity.data.items.length > 0);
  });

  it("holds uploaded files back until they are scanned, then serves them only to members", async () => {
    // A fresh, open request in Beta (Alpha's is already approved, which may stop new files).
    const project = await b.owner.call("POST", `/orgs/${b.orgId}/projects`, { name: "Files" });
    const request = await b.owner.call("POST", `/projects/${project.data.id}/requests`, { type: "other", title: "With a file", body: "See the attachment" });
    const rid = request.data.id;

    const upload = await b.owner.call("PUT", `/requests/${rid}/files?name=${encodeURIComponent("logo.png")}`, PNG, { "content-type": "image/png" });
    assert.equal(upload.status, 201);
    assert.equal(upload.data.scanState, "pending");

    let file: any;
    for (let i = 0; i < 40 && file?.scanState !== "clean"; i += 1) {
      await new Promise((done) => setTimeout(done, 500));
      file = (await b.owner.call("GET", `/requests/${rid}/files`)).data.items[0];
    }
    assert.equal(file?.scanState, "clean", "the development scanner marks it clean");

    const download = async (client: Client) =>
      fetch(`${process.env.API_URL ?? "http://127.0.0.1:8787"}/api/v1/files/${file.id}/content`, { headers: { cookie: client.cookie } });
    const own = await download(b.owner);
    assert.equal(own.status, 200);
    assert.deepEqual([...new Uint8Array(await own.arrayBuffer())], [...PNG]);
    assert.match(own.headers.get("content-disposition") ?? "", /attachment/);
    assert.equal(own.headers.get("x-content-type-options"), "nosniff");
    assert.equal((await download(a.owner)).status, 404, "another organisation cannot download it");
    assert.equal((await download(new Client())).status, 401, "an anonymous visitor cannot download it");
  });

  it("refuses file types that are not on the allowed list", async () => {
    const project = await a.owner.call("POST", `/orgs/${a.orgId}/projects`, { name: "More files" });
    const request = await a.owner.call("POST", `/projects/${project.data.id}/requests`, { type: "other", title: "Bad file", body: "Trying an executable" });
    const res = await a.owner.call("PUT", `/requests/${request.data.id}/files?name=${encodeURIComponent("run.exe")}`, Uint8Array.from([77, 90, 144, 0]), { "content-type": "application/x-msdownload" });
    assert.ok(res.status === 400 || res.status === 415, String(res.status));
  });
});
