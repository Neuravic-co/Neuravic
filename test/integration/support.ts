import { before } from "node:test";
import pg from "pg";

export const BASE = process.env.API_URL ?? "http://127.0.0.1:8787";
export const API = `${BASE}/api/v1`;
export const ORIGIN = process.env.APP_ORIGIN ?? "http://localhost:5173";
export const run = Date.now().toString(36);
export const email = (name: string) => `${name}+${run}@example.com`.toLowerCase();

export interface Reply {
  status: number;
  data: any;
  headers: Headers;
}

export async function call(method: string, path: string, body?: unknown, extra: Record<string, string> = {}): Promise<Reply> {
  const headers: Record<string, string> = { origin: ORIGIN, ...extra };
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${API}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const isJson = (response.headers.get("content-type") ?? "").includes("json");
  return { status: response.status, data: isJson ? await response.json() : await response.text(), headers: response.headers };
}

export function requireBackend() {
  before(async () => {
    const health = await fetch(`${API}/health`, { signal: AbortSignal.timeout(3000) }).catch(() => null);
    if (!health?.ok) throw new Error(`The backend is not reachable at ${BASE}. Start it first with: npm start`);
    const body = (await health.json()) as { status?: string };
    if (body.status !== "ok") throw new Error(`The backend is not healthy: ${JSON.stringify(body)}`);
    await clearRateLimits();
  });
}

export async function clearRateLimits() {
  if (process.env.DATABASE_URL && process.env.APP_ENV === "development") {
    const connection = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await connection.connect();
    await connection.query("DELETE FROM rate_limits");
    await connection.end();
  }
}

export async function mailbox() {
  const response = await fetch(`${API}/dev/mailbox`);
  return ((await response.json()) as { messages: { to: string; subject: string; text: string }[] }).messages;
}

export async function waitForMail(to: string, subjectPart: string) {
  for (let i = 0; i < 60; i += 1) {
    const found = (await mailbox()).find((message) => message.to === to && message.subject.includes(subjectPart));
    if (found) return found;
    await new Promise((done) => setTimeout(done, 200));
  }
  return undefined;
}
