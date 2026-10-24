// Shared helpers for the integration tests. They talk to the real, running backend through the gateway:
//   npm run db:local && npm run db:migrate && npm start      (once, in another terminal)
//   npm run test:integration
// Nothing here changes production data: it refuses to run unless APP_ENV is development.
import { createConnection } from "mysql2/promise";
import { before } from "node:test";

export const BASE = process.env.API_URL ?? "http://127.0.0.1:8787";
export const API = `${BASE}/api/v1`;
export const ORIGIN = process.env.APP_ORIGIN ?? "http://localhost:5173";
export const ADMIN_EMAIL = process.env.BOOTSTRAP_ADMIN_EMAIL ?? "admin@neuravic.local";
export const run = Date.now().toString(36);
export const email = (name: string) => `${name}+${run}@example.com`.toLowerCase();

export interface Reply {
  status: number;
  data: any;
  headers: Headers;
}

/** A browser stand-in: keeps the session cookie between calls. */
export class Client {
  cookie = "";

  async call(method: string, path: string, body?: unknown, extra: Record<string, string> = {}): Promise<Reply> {
    const headers: Record<string, string> = { origin: ORIGIN, ...extra };
    const raw = body instanceof Uint8Array;
    if (body !== undefined && !raw) headers["content-type"] = "application/json";
    if (this.cookie) headers.cookie = this.cookie;
    const res = await fetch(`${API}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : raw ? (body as unknown as BodyInit) : JSON.stringify(body),
    });
    for (const line of res.headers.getSetCookie?.() ?? []) {
      const [pair] = line.split(";");
      if (!pair) continue;
      this.cookie = /Max-Age=0/i.test(line) || pair.endsWith("=") ? "" : pair;
    }
    const type = res.headers.get("content-type") ?? "";
    const data = type.includes("json") ? await res.json() : await res.text();
    return { status: res.status, data, headers: res.headers };
  }
}

/** Fails fast, with a clear message, when the backend is not running. */
export function requireBackend() {
  before(async () => {
    const health = await fetch(`${API}/health`, { signal: AbortSignal.timeout(3000) }).catch(() => null);
    if (!health?.ok) throw new Error(`The backend is not reachable at ${BASE}. Start it first with: npm start`);
    const body = (await health.json()) as { status?: string };
    if (body.status !== "ok") throw new Error(`The backend is not healthy: ${JSON.stringify(body)}`);
    await clearRateLimits();
  });
}

/** Sign-up, login and enquiry limits are per visitor address; clear them so repeated runs do not trip them (development only). */
export async function clearRateLimits() {
  if (process.env.DATABASE_URL && process.env.APP_ENV === "development") {
    const connection = await createConnection({ uri: process.env.DATABASE_URL });
    await connection.query("DELETE FROM rate_limits");
    await connection.end();
  }
}

export async function mailbox() {
  const res = await fetch(`${API}/dev/mailbox`);
  return ((await res.json()) as { messages: { to: string; subject: string; text: string }[] }).messages;
}

export async function waitForMail(to: string, subjectPart: string) {
  for (let i = 0; i < 60; i += 1) {
    const found = (await mailbox()).find((m) => m.to === to && m.subject.includes(subjectPart));
    if (found) return found;
    await new Promise((done) => setTimeout(done, 200));
  }
  return undefined;
}

export const tokenOf = (text: string) => decodeURIComponent(/#token=([^\s]+)/.exec(text)?.[1] ?? "");

/** Signs a person in through the emailed one-time link, the way an invited person does. */
export async function signInByLink(client: Client, address: string) {
  await fetch(`${API}/dev/mailbox`, { method: "DELETE" });
  await client.call("POST", "/auth/magic-link", { email: address });
  const mail = await waitForMail(address, "sign-in");
  if (!mail) throw new Error(`No sign-in email arrived for ${address}`);
  const verified = await client.call("POST", "/auth/verify", { token: tokenOf(mail.text) });
  if (verified.status !== 200) throw new Error(`Link sign-in failed: ${verified.status}`);
  return verified;
}

/** A signed-in staff admin (the bootstrap account). */
export async function staffAdmin() {
  const client = new Client();
  await signInByLink(client, ADMIN_EMAIL);
  return client;
}

/** Creates a person with a password and returns them signed in. */
export async function newPerson(name: string) {
  const client = new Client();
  const address = email(name);
  const password = `pass-${run}-${name}`;
  const res = await client.call("POST", "/auth/register", { name, email: address, password, consent: true });
  if (res.status !== 200) throw new Error(`Could not register ${name}: ${res.status} ${JSON.stringify(res.data)}`);
  return { client, email: address, password, id: res.data.user.id as string };
}

/** Creates an organisation (as staff) and signs its owner in through the invitation link. */
export async function newOrganisation(staff: Client, label: string) {
  const ownerEmail = email(`${label}-owner`);
  await fetch(`${API}/dev/mailbox`, { method: "DELETE" });
  const created = await staff.call("POST", "/orgs", { name: `${label} ${run}`, ownerEmail });
  if (created.status !== 201) throw new Error(`Could not create the organisation: ${created.status} ${JSON.stringify(created.data)}`);
  const owner = new Client();
  await signInByLink(owner, ownerEmail);
  return { orgId: created.data.id as string, owner, ownerEmail };
}

/** A tiny valid PNG, to upload as a file. */
export const PNG = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
