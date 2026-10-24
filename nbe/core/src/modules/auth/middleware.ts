import type { MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { AppEnv } from "../../app";
import { AppError, forbidden, unauthorized } from "../../lib/errors";
import type { Actor } from "./actor";
import { actorFromSession } from "./service";

export const sessionCookieName = (secure: boolean) => (secure ? "__Host-nv_session" : "nv_session");

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Resolves the session cookie, if any, into c.get("actor"). Never rejects. */
export const loadActor: MiddlewareHandler<AppEnv> = async (c, next) => {
  const deps = c.get("deps");
  const cookieName = sessionCookieName(deps.config.cookieSecure);
  const token = getCookie(c, cookieName);
  c.set("actor", null);
  if (token) {
    const actor = await actorFromSession(deps, token);
    if (actor) {
      c.set("actor", actor);
      if (actor.sessionRenewalSeconds) setCookie(c, cookieName, token, {
        path: "/", httpOnly: true, secure: deps.config.cookieSecure, sameSite: "Lax", maxAge: actor.sessionRenewalSeconds,
      });
    }
    else deleteCookie(c, cookieName, { path: "/", secure: deps.config.cookieSecure });
  }
  await next();
};

/** A first-factor staff session has no application or SSO access, including client memberships. */
export const requireStaffMfa: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get("actor")?.mfaRequired) {
    const path = c.req.path.replace(/\/+$/, "");
    const allowed = path === "/api/v1/auth/logout" || path === "/api/v1/auth/verify" ||
      path === "/api/v1/auth/magic-link" || /^\/api\/v1\/auth\/mfa(?:\/(?:setup|confirm|verify))?$/.test(path);
    if (!allowed) throw new AppError(403, "mfa_required", "Complete staff verification to continue");
  }
  await next();
};

/**
 * CSRF defence for cookie sessions: state-changing requests that carry a
 * session cookie must come from an allowed Origin (SameSite=Lax is the second layer).
 *
 * The sign-in endpoints are checked even without a cookie. Otherwise another site could post an
 * attacker's own sign-in token from a visitor's browser and silently sign the visitor into the attacker's
 * account ("login CSRF"). Browsers always send Origin on such a post, so a request that names a foreign
 * origin is refused; requests with no origin at all (scripts, curl) are not browsers and stay allowed.
 */
export const requireTrustedOrigin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (UNSAFE_METHODS.has(c.req.method)) {
    const deps = c.get("deps");
    const origin = c.req.header("origin") ?? safeOrigin(c.req.header("referer"));
    const hasSession = Boolean(getCookie(c, sessionCookieName(deps.config.cookieSecure)));
    const isSignIn = c.req.path.startsWith("/api/v1/auth/");
    const trusted = origin !== undefined && deps.config.allowedOrigins.includes(origin);
    if (hasSession && !trusted) throw forbidden("Untrusted origin");
    if (isSignIn && origin !== undefined && !trusted) throw forbidden("Untrusted origin");
  }
  await next();
};

function safeOrigin(url: string | undefined): string | undefined {
  try {
    return url ? new URL(url).origin : undefined;
  } catch {
    return undefined;
  }
}

/** Returns the signed-in actor or throws 401. */
export function requireActor(c: { get: (key: "actor") => Actor | null }): Actor {
  const actor = c.get("actor");
  if (!actor) throw unauthorized();
  return actor;
}

/** Staff only; optionally restricted to specific staff roles. */
export function requireStaff(
  c: { get: (key: "actor") => Actor | null },
  roles?: readonly ("admin" | "delivery" | "sales")[],
): Actor {
  const actor = requireActor(c);
  const role = actor.user.staffRole;
  if (!role || (roles && !roles.includes(role))) throw forbidden();
  return actor;
}
