import { Hono } from "hono";
import { cors } from "hono/cors";
import { routePath } from "hono/route";
import { secureHeaders } from "hono/secure-headers";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ZodError } from "zod";
import type { Deps } from "./deps";
import type { Env } from "./env";
import { AppError, isDatabaseGuard, isUniqueViolation } from "./lib/errors";
import { readBoundedBody } from "./lib/body";
import { ulid } from "./lib/ids";
import type { Actor } from "./modules/auth/actor";
import { loadActor, requireStaffMfa, requireTrustedOrigin } from "./modules/auth/middleware";

export type AppEnv = {
  Bindings: Env;
  Variables: {
    deps: Deps;
    requestId: string;
    actor: Actor | null;
  };
};

/** The only part of the Workers execution context the app needs. */
export interface BackgroundContext {
  waitUntil(promise: Promise<unknown>): void;
}

export type DepsFactory = (env: Env, ctx?: BackgroundContext) => Deps;

const PROBLEM_TYPE = "application/problem+json";

function problem(
  c: { json: (body: unknown, status: ContentfulStatusCode, headers: Record<string, string>) => Response; get: (key: "requestId") => string },
  status: number,
  code: string,
  title: string,
  extra: Record<string, unknown> = {},
) {
  return c.json(
    { type: "about:blank", title, status, code, requestId: c.get("requestId"), ...extra },
    status as ContentfulStatusCode,
    { "content-type": PROBLEM_TYPE, "cache-control": "no-store" },
  );
}

/** Lets a service attach the routes it owns: `api` is mounted at /api/v1, `root` is the bare application. */
export type MountRoutes = (api: Hono<AppEnv>, root: Hono<AppEnv>) => void;

export function createApp(makeDeps: DepsFactory, mount: MountRoutes) {
  const app = new Hono<AppEnv>();

  // Request id, dependency injection and access log.
  app.use("*", async (c, next) => {
    // Only accept a well-formed caller-supplied id; anything else could pollute logs.
    const supplied = c.req.header("x-request-id");
    const requestId = supplied && /^[A-Za-z0-9._-]{8,64}$/.test(supplied) ? supplied : ulid();
    c.set("requestId", requestId);
    c.header("cache-control", "no-store");
    c.header("x-request-id", requestId);
    let ctx: BackgroundContext | undefined;
    try {
      ctx = c.executionCtx;
    } catch {
      ctx = undefined;
    }
    const deps = makeDeps(c.env, ctx);
    c.set("deps", deps);
    const started = deps.now();
    await next();
    c.header("x-request-id", requestId);
    if (c.res.headers.has("set-cookie") || c.res.status >= 400) c.header("cache-control", "no-store");
    deps.log.info("request", {
      requestId,
      method: c.req.method,
      path: routePath(c, -1) || "unmatched",
      status: c.res.status,
      ms: deps.now() - started,
    });
  });

  app.use("*", secureHeaders());
  app.use("*", async (c, next) => {
    const { allowedOrigins } = c.get("deps").config;
    return cors({
      origin: (origin) => (allowedOrigins.includes(origin) ? origin : null),
      credentials: true,
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["content-type", "idempotency-key", "x-request-id"],
      maxAge: 600,
    })(c, next);
  });

  const api = new Hono<AppEnv>();
  api.use("*", async (c, next) => {
    const path = c.req.path.replace(/\/+$/, "");
    if (c.get("deps").config.maintenanceMode && !["/api/v1/health", "/api/v1/version"].includes(path)) {
      c.header("retry-after", "300");
      return problem(c, 503, "maintenance", "The service is temporarily unavailable for maintenance");
    }
    return next();
  });
  // JSON bodies are small. File uploads (PUT .../files) have their own, larger limit in the files module.
  const MAX_JSON_BYTES = 256 * 1024;
  api.use("*", async (c, next) => {
    if (c.req.method === "PUT" && /\/requests\/[^/]+\/files$/.test(c.req.path)) return next();
    if (c.req.raw.body) {
      const body = await readBoundedBody(c.req.raw, MAX_JSON_BYTES);
      c.req.raw = new Request(c.req.raw, { body });
    }
    return next();
  });
  api.use("*", requireTrustedOrigin, loadActor, requireStaffMfa);

  api.get("/health", (c) => c.json({ status: c.get("deps").config.maintenanceMode ? "maintenance" : "ok" }));
  api.get("/version", (c) => c.json({ version: c.get("deps").config.version }));

  mount(api, app);

  app.route("/api/v1", api);

  app.notFound((c) => problem(c, 404, "not_found", "Not found"));

  app.onError((error, c) => {
    if (error instanceof AppError) {
      return problem(c, error.status, error.code, error.message, error.details ? { errors: error.details } : {});
    }
    if (error instanceof ZodError) {
      return problem(c, 400, "validation_failed", "Validation failed", {
        errors: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
      });
    }
    // Two requests raced past a "does it exist?" check and the unique index caught the loser.
    if (isUniqueViolation(error)) return problem(c, 409, "conflict", "This already exists");
    if (isDatabaseGuard(error, "request_not_open")) return problem(c, 409, "conflict", "This request is no longer open");
    if (isDatabaseGuard(error, "file_limit_reached")) return problem(c, 409, "conflict", "Too many files on this request");
    if (isDatabaseGuard(error, "file_request_unavailable")) return problem(c, 409, "conflict", "This request no longer accepts files");
    if (isDatabaseGuard(error, "last_staff_admin")) return problem(c, 409, "conflict", "At least one active staff admin is required");
    if (isDatabaseGuard(error, "approver_not_authorized")) return problem(c, 403, "forbidden", "You cannot decide on this request");
    c.get("deps")?.log.error("unhandled_error", {
      requestId: c.get("requestId"),
      error: "internal_error",
    });
    return problem(c, 500, "internal_error", "Internal server error");
  });

  return app;
}
