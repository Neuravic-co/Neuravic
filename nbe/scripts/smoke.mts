// End-to-end check of the running API (default http://127.0.0.1:8787): sign-up, sign-in, the portal, staff tools.
// Start the server first (npm start). Uses the development mailbox to read sign-in links, like a person would.
export {};
const BASE = process.env.API_URL ?? "http://127.0.0.1:8787";
const API = `${BASE}/api/v1`;
const ORIGIN = process.env.APP_ORIGIN ?? "http://localhost:5173";
const ADMIN_EMAIL = process.env.BOOTSTRAP_ADMIN_EMAIL ?? "admin@neuravic.local";
const run = Date.now().toString(36);

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed += 1; console.log(`  ok    ${name}`); }
  else { failed += 1; console.log(`  FAIL  ${name}${detail === undefined ? "" : `  -> ${JSON.stringify(detail)}`}`); }
}

class Client {
  cookie = "";
  async call(method: string, path: string, body?: unknown, extra: Record<string, string> = {}) {
    const headers: Record<string, string> = { origin: ORIGIN, ...extra };
    if (body !== undefined && !(body instanceof Uint8Array)) headers["content-type"] = "application/json";
    if (this.cookie) headers.cookie = this.cookie;
    const res = await fetch(`${API}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : body instanceof Uint8Array ? (body as unknown as BodyInit) : JSON.stringify(body),
    });
    const set = res.headers.getSetCookie?.() ?? [];
    for (const line of set) {
      const [pair] = line.split(";");
      if (!pair) continue;
      const [name] = pair.split("=");
      if (/Max-Age=0/i.test(line) || pair.endsWith("=")) this.cookie = "";
      else if (name) this.cookie = pair;
    }
    const type = res.headers.get("content-type") ?? "";
    const data = type.includes("json") ? await res.json() : await res.text();
    return { status: res.status, data: data as any, headers: res.headers };
  }
}

async function mailbox() {
  const res = await fetch(`${API}/dev/mailbox`);
  return ((await res.json()) as { messages: { to: string; subject: string; text: string }[] }).messages;
}

async function waitForMail(to: string, subjectPart: string) {
  for (let i = 0; i < 40; i += 1) {
    const found = (await mailbox()).find((m) => m.to === to && m.subject.includes(subjectPart));
    if (found) return found;
    await new Promise((done) => setTimeout(done, 150));
  }
  return undefined;
}

const tokenOf = (text: string) => decodeURIComponent(/#token=([^\s]+)/.exec(text)?.[1] ?? "");

async function signIn(client: Client, email: string, subject = "sign-in") {
  await fetch(`${API}/dev/mailbox`, { method: "DELETE" });
  const sent = await client.call("POST", "/auth/magic-link", { email });
  const mail = await waitForMail(email, subject);
  if (!mail) return { sent, verified: undefined };
  const verified = await client.call("POST", "/auth/verify", { token: tokenOf(mail.text) });
  return { sent, verified };
}

const alice = `alice+${run}@example.com`;
const bob = `bob+${run}@example.com`;

// Development convenience: the sign-up and enquiry limits are per address, so clear them between runs.
if (process.env.DATABASE_URL && process.env.APP_ENV === "development") {
  const { createConnection } = await import("mysql2/promise");
  const connection = await createConnection({ uri: process.env.DATABASE_URL });
  await connection.query("DELETE FROM rate_limits");
  await connection.end();
}

console.log(`API ${API}\n`);

console.log("Public API");
{
  const anon = new Client();
  const health = await anon.call("GET", "/health");
  check("health is ok", health.status === 200 && health.data.status === "ok", health.data);
  const version = await anon.call("GET", "/version");
  check("version answers", version.status === 200, version.data);
  const content = await anon.call("GET", "/content");
  check("site content comes from MySQL", content.status === 200 && content.data.services?.length > 0, Object.keys(content.data));
  const section = await anon.call("GET", "/content/services");
  check("one content section", section.status === 200 && section.data.items?.length > 0);
  const me = await anon.call("GET", "/me");
  check("/me needs sign-in (401)", me.status === 401, me.status);
  const notFound = await anon.call("GET", "/nope");
  check("unknown route is a 404", notFound.status === 404, notFound.status);
}

console.log("\nContact form (leads)");
{
  const anon = new Client();
  await fetch(`${API}/dev/mailbox`, { method: "DELETE" });
  const lead = await anon.call("POST", "/leads", {
    name: "Test Visitor", email: `lead+${run}@example.com`, company: "Acme", message: `We want a new AI platform for support (${run}).`,
    serviceInterest: [], consent: true,
  });
  check("lead accepted", lead.status === 201 || lead.status === 202 || lead.status === 200, lead);
  const again = await anon.call("POST", "/leads", {
    name: "Test Visitor", email: `lead+${run}@example.com`, company: "Acme", message: `We want a new AI platform for support (${run}).`,
    serviceInterest: [], consent: true,
  });
  check("same enquiry twice returns the same id", again.data?.id === lead.data?.id, [lead.data, again.data]);
  const team = await waitForMail("team@neuravic.com", "New enquiry");
  check("team notification email was sent from the outbox", Boolean(team));
  const ack = await waitForMail(`lead+${run}@example.com`, "We received your message");
  check("sender acknowledgement email was sent", Boolean(ack));
}

console.log("\nSign-up and sign-in");
const aliceClient = new Client();
{
  await fetch(`${API}/dev/mailbox`, { method: "DELETE" });
  const bad = await new Client().call("POST", "/auth/signup", { name: "A", email: "not-an-email", consent: true });
  check("sign-up rejects bad input (400)", bad.status === 400, bad.status);
  const noConsent = await new Client().call("POST", "/auth/signup", { name: "Alice Test", email: alice, consent: false });
  check("sign-up requires consent (400)", noConsent.status === 400, noConsent.status);
  const signup = await aliceClient.call("POST", "/auth/signup", { name: "Alice Test", email: alice, consent: true });
  check("sign-up accepted (202)", signup.status === 202 && signup.data.status === "link_sent", signup);
  const mail = await waitForMail(alice, "sign-in");
  check("sign-in link emailed", Boolean(mail));
  const token = tokenOf(mail?.text ?? "");
  const forged = await new Client().call("POST", "/auth/verify", { token: "x".repeat(43) });
  check("made-up link is rejected (401)", forged.status === 401, forged.status);
  const verified = await aliceClient.call("POST", "/auth/verify", { token });
  check("link signs you in", verified.status === 200 && verified.data.user?.email === alice, verified);
  check("session cookie is set", aliceClient.cookie.startsWith("nv_session="));
  const reuse = await new Client().call("POST", "/auth/verify", { token });
  check("a link works only once (401)", reuse.status === 401, reuse.status);
  const me = await aliceClient.call("GET", "/me");
  check("/me returns the new account", me.status === 200 && me.data.user.email === alice && me.data.user.name === "Alice Test" && me.data.user.staffRole === null, me.data);
  const rename = await aliceClient.call("PATCH", "/me", { name: "Alice Tester" });
  check("profile can be renamed", rename.status === 200 && rename.data.name === "Alice Tester", rename);
  const evil = await aliceClient.call("PATCH", "/me", { name: "x" }, { origin: "https://evil.example" });
  check("cookie request from a foreign origin is refused (403)", evil.status === 403, evil.status);
  const logout = await aliceClient.call("POST", "/auth/logout");
  check("sign out (204)", logout.status === 204, logout.status);
  const after = await aliceClient.call("GET", "/me");
  check("signed out: /me is 401", after.status === 401, after.status);

  const login = await signIn(aliceClient, alice);
  check("sign in again with a new link", login.verified?.status === 200, login.verified);
  const unknown = await new Client().call("POST", "/auth/magic-link", { email: `nobody+${run}@example.com` });
  check("unknown email gets the same neutral answer (202)", unknown.status === 202 && unknown.data.status === "sent_if_account_exists", unknown);
  const none = (await mailbox()).find((m) => m.to === `nobody+${run}@example.com`);
  check("...and no email is sent to it", !none);
}

console.log("\nStaff admin");
const admin = new Client();
{
  const login = await signIn(admin, ADMIN_EMAIL);
  check("bootstrap admin can sign in", login.verified?.status === 200, login.verified ?? login.sent);
  const me = await admin.call("GET", "/me");
  check("admin has the staff role", me.data?.user?.staffRole === "admin", me.data);
  const overview = await admin.call("GET", "/admin/overview");
  check("overview counts", overview.status === 200 && typeof overview.data.users === "number", overview.data);
  const status = await admin.call("GET", "/admin/security-status");
  check("security status (DB reachable)", status.status === 200 && status.data.database === "reachable", status.data);
  const users = await admin.call("GET", "/admin/users");
  check("user list includes Alice", users.data?.items?.some((u: any) => u.email === alice), users.status);
  const leads = await admin.call("GET", "/leads");
  check("lead inbox lists the enquiry", leads.status === 200 && leads.data.items?.some((l: any) => l.email === `lead+${run}@example.com`), leads.data);
  const lead = leads.data?.items?.find((l: any) => l.email === `lead+${run}@example.com`);
  if (lead) {
    const patched = await admin.call("PATCH", `/leads/${lead.id}`, { status: "qualified" });
    check("lead status changes", patched.status === 200 && patched.data.status === "qualified", patched);
    const note = await admin.call("POST", `/leads/${lead.id}/notes`, { body: "Called them back." });
    check("lead note added", note.status === 201, note);
    const detail = await admin.call("GET", `/leads/${lead.id}`);
    check("lead detail has the note", detail.data?.notes?.length === 1, detail.data);
  }
  const csv = await admin.call("GET", "/leads/export.csv");
  check("lead CSV export", csv.status === 200 && String(csv.data).includes("id,created_at"), csv.status);
  const edit = await admin.call("PUT", "/admin/content/services/test-service", {
    position: 99, published: true, data: { number: "99", title: `Test ${run}`, description: "Created by the smoke test." },
  });
  check("staff can edit site content", edit.status === 200, edit);
  const publicContent = await new Client().call("GET", "/content/services");
  check("edit is visible on the public site", publicContent.data?.items?.some((i: any) => i.slug === "test-service"), publicContent.status);
  const del = await admin.call("DELETE", "/admin/content/services/test-service");
  check("content item deleted (204)", del.status === 204, del);
  const audit = await admin.call("GET", "/admin/audit?limit=20");
  check("audit log has entries", audit.status === 200 && audit.data.items.length > 0, audit.status);
  const forbidden = await aliceClient.call("GET", "/admin/overview");
  check("a client cannot use the admin API (403)", forbidden.status === 403, forbidden.status);
}

console.log("\nOrganisation, projects, requests");
let orgId = "";
let projectId = "";
let requestId = "";
{
  const created = await admin.call("POST", "/orgs", { name: `Acme ${run}`, ownerEmail: alice });
  check("staff creates an organisation and invites its owner", created.status === 201, created);
  orgId = created.data.id;
  const dup = await admin.call("POST", "/orgs", { name: `Acme ${run}`, ownerEmail: alice });
  check("duplicate slug is a conflict (409)", dup.status === 409, dup.status);
  const me = await aliceClient.call("GET", "/me");
  check("Alice now belongs to the organisation as owner", me.data?.memberships?.some((m: any) => m.orgId === orgId && m.role === "owner"), me.data);
  const org = await aliceClient.call("GET", `/orgs/${orgId}`);
  check("organisation readable by members", org.status === 200 && org.data.role === "owner", org);
  const outsider = await new Client().call("GET", `/orgs/${orgId}`);
  check("anonymous cannot read it (401)", outsider.status === 401);

  const project = await aliceClient.call("POST", `/orgs/${orgId}/projects`, { name: "Website revamp", description: "New marketing site" });
  check("owner creates a project", project.status === 201, project);
  projectId = project.data.id;
  const patched = await aliceClient.call("PATCH", `/projects/${projectId}`, { description: "Revamp, phase 1" });
  check("project updated", patched.status === 200 && patched.data.description === "Revamp, phase 1", patched);
  const projects = await aliceClient.call("GET", `/orgs/${orgId}/projects`);
  check("projects listed", projects.data?.items?.length === 1, projects.data);

  const request = await aliceClient.call("POST", `/projects/${projectId}/requests`, { type: "change", title: "Add a pricing page", body: "Please add a pricing page.", requiredApprovals: 1 });
  check("member files a request", request.status === 201, request);
  requestId = request.data.id;
  const selfApprove = await aliceClient.call("POST", `/requests/${requestId}/approvals`, { decision: "approved" });
  check("you cannot approve your own request (403)", selfApprove.status === 403, selfApprove.status);
  const comment = await aliceClient.call("POST", `/requests/${requestId}/comments`, { body: "Any update on this?" });
  check("comment added", comment.status === 201, comment);
  const adminComment = await admin.call("POST", `/requests/${requestId}/comments`, { body: "Looking at it now." });
  check("staff can comment too", adminComment.status === 201, adminComment);

  // files
  const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  const upload = await aliceClient.call("PUT", `/requests/${requestId}/files?name=${encodeURIComponent("mock.png")}`, png, { "content-type": "image/png" });
  check("file uploaded", upload.status === 201 && upload.data.scanState === "pending", upload);
  await new Promise((done) => setTimeout(done, 500));
  const files = await aliceClient.call("GET", `/requests/${requestId}/files`);
  const file = files.data?.items?.[0];
  check("file scanned clean (dev scanner)", file?.scanState === "clean", files.data);
  if (file) {
    const dl = await fetch(`${API}/files/${file.id}/content`, { headers: { cookie: aliceClient.cookie } });
    const bytes = new Uint8Array(await dl.arrayBuffer());
    check("file downloads with the same bytes", dl.status === 200 && bytes.length === png.length && bytes[1] === 80, dl.status);
    const bad = await aliceClient.call("PUT", `/requests/${requestId}/files?name=x.png`, Uint8Array.from([1, 2, 3, 4]), { "content-type": "image/png" });
    check("a file whose bytes do not match its type is refused (415)", bad.status === 415, bad.status);
    const removed = await aliceClient.call("DELETE", `/files/${file.id}`);
    check("file deleted (204)", removed.status === 204, removed.status);
  }

  const detail = await aliceClient.call("GET", `/requests/${requestId}`);
  check("request detail has comments", detail.data?.comments?.length === 2 && detail.data.requesterEmail === alice, detail.data);
  const approve = await admin.call("POST", `/requests/${requestId}/approvals`, { decision: "approved", comment: "Go ahead" });
  check("staff approves: request becomes approved", approve.status === 201 && approve.data.state === "approved", approve);
  const again = await admin.call("POST", `/requests/${requestId}/approvals`, { decision: "approved" });
  check("deciding twice is refused (409)", again.status === 409, again.status);
  const mail = await waitForMail(alice, "Your request was approved");
  check("requester is emailed the decision", Boolean(mail), (await mailbox()).map((m) => m.subject));
  const done = await admin.call("PATCH", `/requests/${requestId}`, { state: "completed" });
  check("approved request can be completed", done.status === 200 && done.data.state === "completed", done);
  const activity = await aliceClient.call("GET", `/orgs/${orgId}/activity`);
  check("activity feed shows what happened", activity.data?.items?.length >= 5, activity.data?.items?.length);

  const second = await aliceClient.call("POST", `/projects/${projectId}/requests`, { type: "support", title: "Cancel me", body: "Test", requiredApprovals: 1 });
  const cancelled = await aliceClient.call("PATCH", `/requests/${second.data.id}`, { state: "cancelled" });
  check("requester can cancel an open request", cancelled.status === 200 && cancelled.data.state === "cancelled", cancelled);
}

console.log("\nMembers");
{
  const invite = await aliceClient.call("POST", `/orgs/${orgId}/members`, { email: bob, role: "member", name: "Bob Member" });
  check("owner invites a member", invite.status === 201, invite);
  const members = await aliceClient.call("GET", `/orgs/${orgId}/members`);
  check("both people are listed", members.data?.items?.length === 2, members.data);
  const bobClient = new Client();
  const invitation = await waitForMail(bob, "invited");
  check("invitation email sent", Boolean(invitation));
  const verified = await bobClient.call("POST", "/auth/verify", { token: tokenOf(invitation?.text ?? "") });
  check("invited person signs in from the invitation", verified.status === 200, verified);
  const bobProjects = await bobClient.call("GET", `/orgs/${orgId}/projects`);
  check("member can read projects", bobProjects.status === 200, bobProjects.status);
  const noCreate = await bobClient.call("POST", `/orgs/${orgId}/projects`, { name: "Nope nope" });
  check("member cannot create projects (403)", noCreate.status === 403, noCreate.status);
  const promote = await aliceClient.call("PATCH", `/orgs/${orgId}/members/${members.data.items.find((m: any) => m.email === bob).userId}`, { role: "admin" });
  check("owner promotes a member to admin", promote.status === 200, promote);
  const aliceId = (await aliceClient.call("GET", "/me")).data.user.id;
  const lastOwner = await aliceClient.call("PATCH", `/orgs/${orgId}/members/${aliceId}`, { role: "member" });
  check("the last owner cannot be demoted (409)", lastOwner.status === 409, lastOwner.status);
  const leaveLast = await aliceClient.call("DELETE", `/orgs/${orgId}/members/${aliceId}`);
  check("the last owner cannot leave (409)", leaveLast.status === 409, leaveLast.status);
  const bobId = members.data.items.find((m: any) => m.email === bob).userId;
  const remove = await aliceClient.call("DELETE", `/orgs/${orgId}/members/${bobId}`);
  check("owner removes a member (204)", remove.status === 204, remove.status);
  const bobAfter = await bobClient.call("GET", `/orgs/${orgId}/projects`);
  check("removed member loses access (404)", bobAfter.status === 404, bobAfter.status);
}

console.log("\nPrivacy");
{
  const fresh = new Client();
  const login = await signIn(fresh, alice);
  check("sign in for privacy actions", login.verified?.status === 200);
  const exp = await fresh.call("GET", "/me/privacy/export");
  check("account copy download", exp.status === 200 && exp.data.profile?.email === alice, exp.status);
  const req = await fresh.call("POST", "/me/privacy/requests", { kind: "export" });
  check("privacy request filed", req.status === 202 && req.data.status === "pending_review", req);
  const again = await fresh.call("POST", "/me/privacy/requests", { kind: "export" });
  check("a second open request returns the same one", again.status === 202 && again.data.id === req.data.id, again.data);
  const list = await fresh.call("GET", "/me/privacy/requests");
  check("requests listed", list.data?.items?.length === 1, list.data);
}

console.log("\nStaff safety rules");
{
  const adminMe = (await admin.call("GET", "/me")).data.user.id;
  const demote = await admin.call("PATCH", `/admin/users/${adminMe}`, { status: "disabled" });
  check("the only admin cannot disable themselves (409)", demote.status === 409, demote.status);
}

console.log("\nPassword sign-in");
{
  const carol = `carol+${run}@example.com`;
  const person = new Client();
  const weak = await person.call("POST", "/auth/register", { name: "Carol", email: carol, password: "short", consent: true });
  check("a short password is refused (400)", weak.status === 400, weak.status);
  const made = await person.call("POST", "/auth/register", { name: "Carol", email: carol, password: "correct horse 1", consent: true });
  check("sign up with a password signs the person in", made.status === 200 && (await person.call("GET", "/me")).status === 200, made.status);
  const again = await new Client().call("POST", "/auth/register", { name: "Carol", email: carol, password: "another pass 1", consent: true });
  check("the same email cannot sign up twice (409)", again.status === 409, again.status);
  const wrong = await new Client().call("POST", "/auth/login", { email: carol, password: "wrong password" });
  check("a wrong password is refused (401)", wrong.status === 401, wrong.status);
  const unknown = await new Client().call("POST", "/auth/login", { email: `nobody+${run}@example.com`, password: "whatever 123" });
  check("an unknown email gets the same refusal (401)", unknown.status === 401 && unknown.data.title === wrong.data.title, unknown.status);
  const back = new Client();
  const ok = await back.call("POST", "/auth/login", { email: carol, password: "correct horse 1" });
  check("log in with the right password", ok.status === 200 && (await back.call("GET", "/me")).data.user.email === carol, ok.status);
  const out = await back.call("POST", "/auth/logout");
  check("log out ends the session", out.status === 204 && (await back.call("GET", "/me")).status === 401, out.status);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
