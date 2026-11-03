import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { createApp, type AppEnv } from "@neuravic/core/app";
import { buildDeps } from "@neuravic/core/bootstrap";
import type { Deps } from "@neuravic/core/deps";
import { jsonLogger } from "@neuravic/core/lib/logger";
import { runMaintenance } from "@neuravic/core/modules/maintenance/service";
import { drainOutbox } from "@neuravic/core/modules/notifications/outbox";
import { mountAll } from "@neuravic/core/services";
import { resolveService } from "../../gateway/src/routes";

const problem = (status: number, code: string, title: string, headers: Record<string, string> = {}) =>
  Response.json({ type: "about:blank", title, status, code }, {
    status,
    headers: { "content-type": "application/problem+json", "cache-control": "no-store", ...headers },
  });

function sameSecret(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

/** A committed enquiry queues email jobs; with no worker polling, the host sends them as soon as the response is out. */
export function shouldDrainAfter(request: Request, response: Response): boolean {
  return request.method === "POST" && new URL(request.url).pathname.replace(/\/+$/, "") === "/api/v1/leads" && response.status === 202;
}

export interface BackendOptions {
  /** Keeps the function alive until the task ends (Vercel's waitUntil). */
  waitUntil: (promise: Promise<unknown>) => void;
  env?: NodeJS.ProcessEnv;
  /** Test hook: build the dependencies yourself. */
  makeDeps?: () => Deps;
}

/**
 * The whole backend in one request handler, for a host that runs functions instead of long-lived services.
 * Differences from the multi-service setup: file hosting and the dev mailbox are not part of it (those
 * paths answer 503 / 404), the worker's timers become `/internal/cron`, and work that follows a response
 * is kept alive with waitUntil.
 */
export function createBackend(options: BackendOptions) {
  const env = options.env ?? process.env;
  let built: { deps: Deps; app: Hono<AppEnv> } | undefined;

  function get() {
    if (!built) {
      const deps =
        options.makeDeps?.() ??
        buildDeps({
          name: "api",
          defaultPort: 0,
          mount: mountAll,
          deliversMail: true,
          runInBackground: (task) => {
            options.waitUntil(task().catch(() => jsonLogger.error("background_task_failed")));
          },
        }).deps;
      built = { deps, app: createApp(() => deps, mountAll) };
    }
    return built;
  }

  /** Cron: send queued mail every minute, and run the maintenance rules every fifth minute. */
  async function cron(request: Request): Promise<Response> {
    const secret = env.CRON_SECRET ?? "";
    const bearer = (request.headers.get("authorization") ?? "").replace(/^Bearer /i, "");
    if (!secret || !sameSecret(bearer, secret)) return problem(401, "unauthorized", "Unauthorized");
    const { deps } = get();
    const outbox = await drainOutbox(deps);
    const maintenance = new Date(deps.now()).getUTCMinutes() % 5 === 0 ? await runMaintenance(deps) : null;
    return Response.json({ outbox, maintenance: maintenance ? "ran" : "skipped" }, { headers: { "cache-control": "no-store" } });
  }

  /** The visitor address is only believed when the website proxy signed it; otherwise use the platform's own value. */
  function withVisitorAddress(request: Request): Request {
    const secret = env.PROXY_SECRET ?? "";
    if (secret && sameSecret(request.headers.get("x-proxy-secret") ?? "", secret)) return request;
    const headers = new Headers(request.headers);
    headers.delete("x-client-ip");
    headers.delete("x-proxy-secret");
    const platformAddress = request.headers.get("x-real-ip")?.trim();
    if (secret && platformAddress) {
      headers.set("x-client-ip", platformAddress);
      headers.set("x-proxy-secret", secret);
    }
    return new Request(request, { headers });
  }

  async function fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    const owner = resolveService(pathname);
    if (owner === "files") return problem(503, "service_unavailable", "File uploads are not available on this deployment", { "retry-after": "300" });
    if (owner === "worker") return problem(404, "not_found", "Not found");
    try {
      if (pathname === "/internal/cron") return await cron(request);
      const { app, deps } = get();
      const response = await app.fetch(withVisitorAddress(request), env as never);
      if (shouldDrainAfter(request, response)) {
        options.waitUntil(drainOutbox(deps).catch(() => jsonLogger.error("background_task_failed")));
      }
      return response;
    } catch (error) {
      jsonLogger.error("backend_unavailable", { error: error instanceof Error ? error.message : "unknown" });
      return problem(503, "service_unavailable", "This service is not available right now", { "retry-after": "5" });
    }
  }

  return { fetch };
}
