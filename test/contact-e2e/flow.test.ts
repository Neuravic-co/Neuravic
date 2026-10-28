import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { chromium, expect, type Browser } from "@playwright/test";
import { emailHarness } from "../email/harness";
import { schema } from "../../nbe/core/src/db";
import { drainOutbox } from "../../nbe/core/src/modules/notifications/outbox";

let h: Awaited<ReturnType<typeof emailHarness>>;
let apiServer: ReturnType<typeof serve>;
let frontend: ChildProcess;
let browser: Browser;
let timer: ReturnType<typeof setInterval>;
let drain: Promise<unknown> = Promise.resolve();
const origin = "http://localhost:5174";
before(async () => {
  h = await emailHarness(); await h.reset();
  h.deps.config.turnstileSecret = "local-verification-secret";
  h.deps.http = async (url) => {
    assert.equal(url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
    return Response.json({ success: true, hostname: "localhost", action: "contact" });
  };
  apiServer = serve({ fetch: h.app.fetch, hostname: "127.0.0.1", port: 8879 });
  const root = fileURLToPath(new URL("../../", import.meta.url));
  frontend = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "5174", "-H", "127.0.0.1"], {
    cwd: `${root}/nfe`, windowsHide: true, stdio: "ignore",
    env: { ...process.env, NEXT_PUBLIC_TURNSTILE_SITE_KEY: "contact-test-site-key", NEXT_PUBLIC_API_BASE_URL: "", API_ORIGIN: "http://127.0.0.1:8879", ALLOW_INSECURE_API_ORIGIN: "true" },
  });
  for (let i = 0; i < 150; i++) {
    if (frontend.exitCode !== null) throw new Error("Frontend test server exited");
    if (await fetch(origin).then(r => r.ok).catch(() => false)) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  browser = await chromium.launch({ headless: true });
  timer = setInterval(() => { drain = drain.then(() => drainOutbox(h.deps)); }, 100);
});
after(async () => {
  clearInterval(timer); await drain; await browser?.close(); frontend?.kill();
  if (apiServer) await new Promise<void>(resolve => apiServer.close(() => resolve()));
  await h?.pool.end();
});
it("submits through the production frontend proxy, real API and MySQL into Resend acceptance tracking", async () => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.route("https://challenges.cloudflare.com/**", route => route.fulfill({ contentType: "application/javascript", body: `window.turnstile={render:(_el,opts)=>{queueMicrotask(()=>{opts.callback('local-token');_el.dataset.ready='true'});return 'test'},reset:()=>{},remove:()=>{}}` }));
  await page.route("https://**", route => route.request().url().startsWith("https://challenges.cloudflare.com/") ? route.fallback() : route.abort());
  const send = async () => {
    await page.goto(origin);
    await expect(page.getByRole("group", { name: "Contact verification" })).toHaveAttribute("data-ready", "true");
    await page.getByLabel("Name", { exact: true }).fill("Sara");
    await page.getByLabel("Last name", { exact: true }).fill("Ali");
    await page.getByLabel("Email", { exact: true }).fill("visitor@example.com");
    await page.getByLabel("Where does the operation break down?").fill("Synthetic browser enquiry for local email verification.");
    await page.getByLabel("I agree that Neuravic may use these details to reply to my enquiry.").check();
    const response = page.waitForResponse(r => new URL(r.url()).pathname === "/api/v1/leads" && r.request().method() === "POST");
    await page.getByRole("button", { name: "Start a Conversation" }).click();
    const receipt = await response; assert.equal(receipt.status(), 202);
    await expect(page.getByRole("status")).toContainText("acknowledgement is queued");
    return await receipt.json() as { id: string; status: string };
  };
  const first = await send();
  await expect.poll(() => h.requests.length).toBe(2);
  await expect.poll(async () => (await h.db.select().from(schema.outbox)).filter(j => j.topic === "email" && j.state === "sent").length).toBe(2);
  assert.deepEqual(h.requests.map(r => r.body.to[0]).sort(), ["team@example.com", "visitor@example.com"]);
  const lead = (await h.db.select().from(schema.leads))[0]!; assert.equal(lead.id, first.id);
  const second = await send(); assert.equal(second.id, first.id);
  assert.equal(h.requests.length, 2);
  const jobs = (await h.db.select().from(schema.outbox)).filter(j => j.topic === "email");
  assert.equal(jobs.length, 2); assert.ok(jobs.every(j => j.leadId === first.id && j.provider === "resend" && j.providerMessageId));
  await context.close();
});
