import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { routePath } from "hono/route";
import { secureHeaders } from "hono/secure-headers";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ZodError } from "zod";
import type { Container } from "./container";
import { AppError } from "./core/errors";
import type { AppEnv } from "./core/http";
import { ulid } from "./core/ids";
import { leadsRoutes } from "./modules/leads/routes";
import { cronRoutes, systemRoutes } from "./modules/system/routes";

const MAX_BODY_BYTES = 64 * 1024;
const REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

type Problem = { status: number; code: string; title: string; requestId: string; errors?: unknown };

function respond(c: { json: (body: unknown, status: ContentfulStatusCode, headers: Record<string, string>) => Response }, problem: Problem) {
  return c.json({ type: "about:blank", ...problem }, problem.status as ContentfulStatusCode, {
    "content-type": "application/problem+json",
    "cache-control": "no-store",
  });
}

export function createApp(container: Container) {
  const { config, log, now } = container;
  const app = new Hono<AppEnv>();

  app.use("*", async (c, next) => {
    const supplied = c.req.header("x-request-id");
    const requestId = supplied && REQUEST_ID.test(supplied) ? supplied : ulid();
    const started = now();
    c.set("requestId", requestId);
    await next();
    c.header("x-request-id", requestId);
    c.header("cache-control", "no-store");
    log.info("request", { requestId, method: c.req.method, path: routePath(c, -1) || "unmatched", status: c.res.status, ms: now() - started });
  });

  app.use("*", secureHeaders());
  app.use(
    "*",
    cors({
      origin: (origin) => (config.allowedOrigins.includes(origin) ? origin : null),
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["content-type", "x-request-id"],
      maxAge: 600,
    }),
  );

  const api = new Hono<AppEnv>();

  api.use("*", async (c, next) => {
    if (config.maintenanceMode && !["/api/v1/health", "/api/v1/version"].includes(c.req.path.replace(/\/+$/, ""))) {
      c.header("retry-after", "300");
      return respond(c, { status: 503, code: "maintenance", title: "The service is temporarily unavailable for maintenance", requestId: c.get("requestId") });
    }
    return next();
  });

  api.use("*", async (c, next) => {
    const origin = c.req.header("origin");
    if (origin && UNSAFE_METHODS.has(c.req.method) && !config.allowedOrigins.includes(origin)) {
      throw new AppError(403, "forbidden", "This origin is not allowed");
    }
    return next();
  });

  api.use("*", bodyLimit({ maxSize: MAX_BODY_BYTES, onError: () => { throw new AppError(413, "payload_too_large", "Request body is too large"); } }));

  api.route("/", systemRoutes(container));
  api.route("/leads", leadsRoutes(container));

  app.route("/api/v1", api);
  app.route("/internal", cronRoutes(container));

  app.notFound((c) => respond(c, { status: 404, code: "not_found", title: "Not found", requestId: c.get("requestId") }));

  app.onError((error, c) => {
    const requestId = c.get("requestId");
    if (error instanceof AppError) {
      return respond(c, { status: error.status, code: error.code, title: error.message, requestId, ...(error.details ? { errors: error.details } : {}) });
    }
    if (error instanceof ZodError) {
      const errors = error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
      return respond(c, { status: 400, code: "validation_failed", title: "Validation failed", requestId, errors });
    }
    if (error instanceof HTTPException && error.status < 500) {
      return respond(c, { status: error.status, code: "bad_request", title: error.message || "Bad request", requestId });
    }
    log.error("unhandled_error", { requestId, error: error.name });
    return respond(c, { status: 500, code: "internal_error", title: "Internal server error", requestId });
  });

  return app;
}
