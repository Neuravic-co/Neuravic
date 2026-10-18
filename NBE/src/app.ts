import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ZodError } from "zod";
import type { Deps } from "./deps";
import type { Env } from "./env";
import { AppError } from "./lib/errors";
import { ulid } from "./lib/ids";
import type { Actor } from "./modules/auth/actor";
import { loadActor, requireTrustedOrigin } from "./modules/auth/middleware";
import { authRoutes, meRoutes } from "./modules/auth/routes";
import { leadsRoutes } from "./modules/leads/routes";

export type AppEnv = {
  Bindings: Env;
  Variables: {
    deps: Deps;
    requestId: string;
    actor: Actor | null;
  };
};

export type DepsFactory = (env: Env, ctx?: ExecutionContext) => Deps;

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
    { "content-type": PROBLEM_TYPE },
  );
}

export function createApp(makeDeps: DepsFactory) {
  const app = new Hono<AppEnv>();

  // Request id, dependency injection and access log.
  app.use("*", async (c, next) => {
    const requestId = c.req.header("x-request-id") ?? ulid();
    let ctx: ExecutionContext | undefined;
    try {
      ctx = c.executionCtx;
    } catch {
      ctx = undefined;
    }
    const deps = makeDeps(c.env, ctx);
    c.set("requestId", requestId);
    c.set("deps", deps);
    const started = deps.now();
    await next();
    c.header("x-request-id", requestId);
    deps.log.info("request", {
      requestId,
      method: c.req.method,
      path: new URL(c.req.url).pathname,
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
  api.use("*", requireTrustedOrigin, loadActor);

  api.get("/health", (c) => c.json({ status: "ok" }));
  api.get("/version", (c) => c.json({ version: c.get("deps").config.version }));

  api.route("/auth", authRoutes);
  api.route("/me", meRoutes);
  api.route("/leads", leadsRoutes);

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
    c.get("deps")?.log.error("unhandled_error", {
      requestId: c.get("requestId"),
      error: error instanceof Error ? error.message : String(error),
    });
    return problem(c, 500, "internal_error", "Internal server error");
  });

  return app;
}
