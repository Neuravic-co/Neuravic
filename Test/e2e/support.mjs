/**
 * Shared helpers for the browser tests.
 *
 * Settings (environment variables):
 *   E2E_BASE_URL     frontend address            default http://localhost:5173
 *   E2E_API_URL      backend API address         default http://localhost:8787/api/v1
 *   E2E_ADMIN_EMAIL  bootstrap staff admin email default founder@test.dev
 *                    (must equal BOOTSTRAP_ADMIN_EMAIL in NBE/.dev.vars)
 *   NBE_LOG          file the backend's output is written to, default /tmp/nbe.log
 *                    Start the backend with:  npm run dev 2>&1 | tee /tmp/nbe.log
 *                    In development the backend prints sign-in links there instead of emailing them.
 *   CHROMIUM_PATH    optional browser executable
 */
import { mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));

export const BASE_URL = (process.env.E2E_BASE_URL ?? "http://localhost:5173").replace(/\/$/, "");
export const API_URL = (process.env.E2E_API_URL ?? "http://localhost:8787/api/v1").replace(/\/$/, "");
export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "founder@test.dev";
export const NBE_LOG = process.env.NBE_LOG ?? "/tmp/nbe.log";
export const SCREENSHOTS = join(here, "screenshots");
mkdirSync(SCREENSHOTS, { recursive: true });

export async function launch() {
  const executablePath = process.env.CHROMIUM_PATH;
  return chromium.launch(executablePath ? { executablePath } : {});
}

/** Collects JavaScript errors so a test can assert the page stayed clean. */
export function watchErrors(page, label, sink) {
  page.on("pageerror", (error) => sink.push(`${label} pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && !/Failed to load resource/.test(message.text())) {
      sink.push(`${label} console: ${message.text()}`);
    }
  });
}

export function logSize() {
  try {
    return statSync(NBE_LOG).size;
  } catch {
    throw new Error(`Cannot read ${NBE_LOG}. Start the backend with: npm run dev 2>&1 | tee ${NBE_LOG}`);
  }
}

/** Waits for the sign-in link the backend printed for `email` after `fromByte`. */
export async function waitForLoginToken(email, fromByte) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const text = readFileSync(NBE_LOG, "utf8").slice(fromByte);
    const line = text
      .split("\n")
      .reverse()
      .find((entry) => entry.includes(`"to":"${email}"`) && entry.includes("token="));
    const token = line && /token=([A-Za-z0-9_%-]+)/.exec(line)?.[1];
    if (token) return decodeURIComponent(token);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `No sign-in link for ${email} appeared in ${NBE_LOG}. If you ran the tests several times in the last hour, ` +
      "the backend's limit of 5 sign-in emails per hour per address was reached: restart the backend (npm run dev) to reset it.",
  );
}

/** Signs in through the API and returns the session cookie, for tests that do not exercise the login UI. */
export async function apiSession(email = ADMIN_EMAIL) {
  const from = logSize();
  const asked = await fetch(`${API_URL}/auth/magic-link`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (asked.status !== 202) throw new Error(`magic-link request failed: ${asked.status}`);
  const token = await waitForLoginToken(email, from);
  const verified = await fetch(`${API_URL}/auth/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (verified.status !== 200) throw new Error(`verify failed: ${verified.status}`);
  const [pair] = verified.headers.get("set-cookie").split(";");
  const [name, ...value] = pair.split("=");
  return { name, value: value.join("="), domain: new URL(BASE_URL).hostname, path: "/" };
}

/** Walks the real sign-in screens: email form, "check your inbox", then the emailed link. */
export async function signInThroughUi(page, email) {
  const from = logSize();
  await page.goto(`${BASE_URL}/portal`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /Sign in to your portal/ }).waitFor();
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: /Email me a link/ }).click();
  await page.getByRole("heading", { name: /Check your inbox/ }).waitFor();
  const token = await waitForLoginToken(email, from);
  await page.goto(`${BASE_URL}/portal/verify?token=${encodeURIComponent(token)}`);
  await page.getByRole("button", { name: "Sign out" }).waitFor({ timeout: 15000 });
}

/** Tiny assertion helper with readable output. */
export function check(description, condition, detail = "") {
  if (!condition) throw new Error(`FAILED: ${description}${detail ? ` (${detail})` : ""}`);
  console.log(`  ok  ${description}`);
}

export async function run(name, body) {
  console.log(`\n${name}`);
  const errors = [];
  const browser = await launch();
  try {
    await body(browser, errors);
    check("no JavaScript errors in the browser", errors.length === 0, errors.join(" | "));
    console.log(`PASSED ${name}`);
  } catch (error) {
    console.error(`\n${error.message.split("\n").slice(0, 6).join("\n")}`);
    if (errors.length) console.error("browser errors:", errors);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}
