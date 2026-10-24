import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { timingSafeEqual } from "node:crypto";
import { resolveService, type ServiceName } from "./routes";

/**
 * The single public entrance to the backend. It sends each request to the service that owns the path
 * and keeps the body, cookies and status codes untouched. Every service still checks origin, session
 * and role itself, so the gateway is routing, not a security boundary.
 */
const url = (name: string, port: number) => (process.env[`${name}_URL`] ?? `http://127.0.0.1:${port}`).replace(/\/$/, "");
const services = {
  auth: url("AUTH", 8801),
  portal: url("PORTAL", 8802),
  leads: url("LEADS", 8803),
  admin: url("ADMIN", 8804),
  files: url("FILES", 8805),
  worker: url("WORKER", 8806),
} as const;

const HOP_BY_HOP = [
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer",
  "transfer-encoding", "upgrade", "host", "content-length",
];
const DECODED = ["content-encoding", "content-length", "transfer-encoding", "connection"];
const proxySecret = process.env.PROXY_SECRET ?? "";
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean);

function sameSecret(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

const problem = (status: number, code: string, title: string, extra: Record<string, unknown> = {}) =>
  Response.json({ type: "about:blank", title, status, code, ...extra }, {
    status,
    headers: { "content-type": "application/problem+json", "cache-control": "no-store" },
  });

const app = new Hono<{ Bindings: { incoming?: { socket?: { remoteAddress?: string } } } }>();

/** The gateway answers health and version itself, so it adds the CORS header the services add for their own answers. */
const withCors = (c: { req: { header: (n: string) => string | undefined } }, headers: Record<string, string>) => {
  const origin = c.req.header("origin");
  return origin && allowedOrigins.includes(origin)
    ? { ...headers, "access-control-allow-origin": origin, "access-control-allow-credentials": "true", vary: "Origin" }
    : headers;
};

app.get("/api/v1/health", async (c) => {
  const checks = await Promise.all(
    (Object.keys(services) as ServiceName[]).map(async (name) => {
      try {
        const res = await fetch(`${services[name]}/api/v1/health`, { signal: AbortSignal.timeout(1500) });
        const body = (await res.json()) as { status?: string };
        return [name, body.status ?? (res.ok ? "ok" : "down")] as const;
      } catch {
        return [name, "down"] as const;
      }
    }),
  );
  const states = Object.fromEntries(checks);
  const values = Object.values(states);
  const status = values.every((v) => v === "ok") ? "ok" : values.includes("maintenance") ? "maintenance" : "degraded";
  return c.json({ status, services: states }, 200, withCors(c, { "cache-control": "no-store" }));
});

app.get("/api/v1/version", (c) => c.json({ version: process.env.APP_VERSION ?? "dev" }, 200, withCors(c, { "cache-control": "no-store" })));

app.all("*", async (c) => {
  const incoming = new URL(c.req.url);
  const target = resolveService(incoming.pathname);
  if (!target) return problem(404, "not_found", "Not found");

  const headers = new Headers(c.req.raw.headers);
  for (const name of HOP_BY_HOP) headers.delete(name);
  // Visitor address: keep the website proxy's signed value, otherwise use the connection's own address.
  const trusted = proxySecret !== "" && sameSecret(c.req.header("x-proxy-secret") ?? "", proxySecret);
  if (!trusted) {
    headers.delete("x-client-ip");
    headers.delete("x-proxy-secret");
    const remote = c.env?.incoming?.socket?.remoteAddress?.replace(/^::ffff:/, "");
    if (proxySecret && remote) {
      headers.set("x-client-ip", remote);
      headers.set("x-proxy-secret", proxySecret);
    }
  }

  const hasBody = !["GET", "HEAD"].includes(c.req.method) && c.req.raw.body !== null;
  try {
    const init: RequestInit & { duplex?: "half" } = {
      method: c.req.method,
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(60_000),
    };
    if (hasBody) {
      init.body = c.req.raw.body;
      init.duplex = "half";
    }
    const upstream = await fetch(`${services[target]}${incoming.pathname}${incoming.search}`, init);
    const out = new Headers(upstream.headers);
    for (const name of DECODED) out.delete(name);
    return new Response(upstream.body, { status: upstream.status, headers: out });
  } catch {
    const res = problem(503, "service_unavailable", "This service is not available right now", { service: target });
    res.headers.set("retry-after", "5");
    return res;
  }
});

const port = Number(process.env.GATEWAY_PORT ?? 8787);
const hostname = process.env.HOST ?? "127.0.0.1";
serve({ fetch: app.fetch, port, hostname }, (info) => {
  console.log(JSON.stringify({ level: "info", message: "service_started", service: "gateway", url: `http://${info.address}:${info.port}` }));
});
