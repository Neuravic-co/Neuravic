import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium, expect, type Browser, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const root = fileURLToPath(new URL("../../", import.meta.url));
const origin = "http://localhost:5174";
let server: ChildProcess;
let browser: Browser;
before(async () => {
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "5174", "-H", "127.0.0.1"], {
    cwd: `${root}/nfe`, windowsHide: true, stdio: "ignore",
    env: { ...process.env, NEXT_PUBLIC_TURNSTILE_SITE_KEY: "contact-test-site-key", NEXT_PUBLIC_API_BASE_URL: "", API_ORIGIN: "", PORT: "5174" },
  });
  for (let i = 0; i < 150; i++) {
    if (server.exitCode !== null) throw new Error("Frontend test server exited");
    if (await fetch(origin).then(r => r.ok).catch(() => false)) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); server?.kill(); });

async function pageFor(width = 1280): Promise<Page> {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.route("https://challenges.cloudflare.com/**", route => route.fulfill({ contentType: "application/javascript", body: `
    window.turnstile = {
      render: (_element, options) => { window.contactChallenge = options; queueMicrotask(() => options.callback('test-token')); return 'widget'; },
      reset: () => { window.contactChallenge.callback('refreshed-token'); },
      remove: () => {}
    };
  ` }));
  await page.route("https://**", route => {
    if (route.request().url().startsWith("https://challenges.cloudflare.com/")) return route.fallback();
    return route.abort();
  });
  await page.goto(origin);
  await page.locator(".contact-form").scrollIntoViewIfNeeded();
  // This assertion prevents silently skipping the challenge tests when the build omitted the site key.
  await expect.poll(() => page.evaluate(() => Boolean((window as any).contactChallenge))).toBe(true);
  return page;
}
async function fill(page: Page) {
  await page.getByLabel("Name", { exact: true }).fill("Sara");
  await page.getByLabel("Last name", { exact: true }).fill("Ali");
  await page.getByLabel("Email", { exact: true }).fill("visitor@example.com");
  await page.getByLabel("Where does the operation break down?").fill("We need help with an internal approval process.");
  await page.getByLabel("I agree that Neuravic may use these details to reply to my enquiry.").check();
}
const submit = (page: Page) => page.getByRole("button", { name: "Start a Conversation" });

it("validates fields and focuses the first error without a request", async () => {
  const page = await pageFor(); let requests = 0;
  await page.route("**/api/v1/leads", route => { requests++; return route.abort(); });
  await submit(page).click();
  await expect(page.getByLabel("Name", { exact: true })).toBeFocused();
  await expect(page.getByLabel("Email", { exact: true })).toHaveAttribute("aria-invalid", "true");
  assert.equal(requests, 0); await page.close();
});
it("accepts one submission during duplicate clicks and announces queuing, without claiming delivery", async () => {
  const page = await pageFor(); let requests = 0;
  await page.route("**/api/v1/leads", async route => {
    requests++; const body = route.request().postDataJSON();
    assert.equal(body.turnstileToken, "test-token"); assert.equal(body.email, "visitor@example.com");
    await new Promise(resolve => setTimeout(resolve, 300));
    await route.fulfill({ status: 202, json: { id: "test-id", status: "received" } });
  });
  await fill(page);
  await page.locator(".contact-form").evaluate((form: HTMLFormElement) => { form.requestSubmit(); form.requestSubmit(); });
  await expect(page.getByRole("button", { name: "Sending…" })).toBeDisabled();
  await expect(page.getByRole("status")).toContainText("acknowledgement is queued");
  await expect(page.getByRole("status")).toBeFocused();
  assert.equal(requests, 1); await page.close();
});
it("invalidates expired Turnstile tokens before submitting", async () => {
  const page = await pageFor(); let requests = 0;
  await page.route("**/api/v1/leads", route => { requests++; return route.abort(); });
  await fill(page); await page.evaluate(() => (window as any).contactChallenge["expired-callback"]());
  await submit(page).click();
  await expect(page.locator(".contact-form")).toContainText("Please complete the verification");
  assert.equal(requests, 0); await page.close();
});
it("refreshes a consumed challenge after a rejection and allows a retry", async () => {
  const page = await pageFor(); let requests = 0;
  await page.route("**/api/v1/leads", async route => {
    requests++;
    if (requests === 1) return route.fulfill({ status: 422, json: { code: "unprocessable" } });
    assert.equal(route.request().postDataJSON().turnstileToken, "refreshed-token");
    return route.fulfill({ status: 202, json: { id: "test-id", status: "received" } });
  });
  await fill(page); await submit(page).click();
  await expect(page.locator(".contact-form")).toContainText("verification check failed");
  await submit(page).click(); await expect(page.getByRole("status")).toContainText("queued");
  assert.equal(requests, 2); await page.close();
});
it("retains form values and offers a mail link when the API is unconfigured", async () => {
  const page = await pageFor();
  await page.route("**/api/v1/leads", route => route.fulfill({ status: 503, json: { code: "api_unavailable" } }));
  await fill(page); await submit(page).click();
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("visitor@example.com");
  await expect(page.getByRole("link", { name: "Send it by email instead" })).toHaveAttribute("href", /^mailto:/);
  await expect(submit(page)).toBeEnabled(); await page.close();
});
it("does not display success for a malformed successful API response", async () => {
  const page = await pageFor();
  await page.route("**/api/v1/leads", route => route.fulfill({ status: 200, json: {} }));
  await fill(page); await submit(page).click();
  await expect(page.locator(".contact-form")).toContainText("could not send");
  await expect(page.locator(".contact-form--sent")).toHaveCount(0); await page.close();
});
it("keeps the mobile form within the viewport and accessible", async () => {
  const page = await pageFor(390);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const result = await new AxeBuilder({ page }).include(".contact-form").withTags(["wcag2a", "wcag2aa"]).analyze();
  assert.deepEqual(result.violations.map(v => v.id), []);
  await page.setViewportSize({ width: 280, height: 900 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.close();
});
