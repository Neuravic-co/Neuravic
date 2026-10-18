import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../app";
import { AppError, badRequest } from "../../lib/errors";
import { ulid } from "../../lib/ids";
import { rateLimit } from "../../lib/rate-limit";
import { parseJson } from "../../lib/validate";
import { writeAudit } from "../audit/audit";
import { requireActor } from "../auth/middleware";
import { requireOrgRole } from "../orgs/policy";

export const TOKEN_TTL_SECONDS = 300;

const exchangeSchema = z.object({
  audience: z.string().trim().min(1).max(60),
  orgId: z.string().max(40).optional(),
});

/** Token exchange for Neuravic products. Mounted at /token. */
export const ssoRoutes = new Hono<AppEnv>();

/**
 * Exchanges the Portal session for a 5-minute JWT the product can verify
 * with GET /.well-known/jwks.json. Claims: sub, email, name, aud, iss, iat, exp, jti,
 * plus `org` and `role` when an org is selected, and `staff` for Neuravic staff.
 */
ssoRoutes.post(
  "/exchange",
  rateLimit({ name: "sso", limit: 30, windowSeconds: 60, key: (c) => c.get("actor")?.user.id ?? "anon" }),
  async (c) => {
    const actor = requireActor(c);
    const deps = c.get("deps");
    const { audience, orgId } = await parseJson(c, exchangeSchema);
    if (!deps.sso) throw new AppError(503, "sso_unavailable", "Single sign-on is not configured");
    if (!deps.config.ssoAudiences.includes(audience)) throw badRequest("Unknown audience");

    const issuedAt = Math.floor(deps.now() / 1000);
    const claims: Record<string, unknown> = {
      iss: deps.config.appUrl,
      aud: audience,
      sub: actor.user.id,
      email: actor.user.email,
      name: actor.user.name,
      iat: issuedAt,
      exp: issuedAt + TOKEN_TTL_SECONDS,
      jti: ulid(deps.now()),
    };
    if (actor.user.staffRole) claims.staff = actor.user.staffRole;
    if (orgId) {
      claims.org = orgId;
      claims.role = requireOrgRole(actor, orgId, "viewer");
    }

    const token = await deps.sso.sign(claims);
    await writeAudit(deps.db, { actorId: actor.user.id, orgId, action: "sso.token_issued", meta: { audience } }, deps.now());
    return c.json({ token, expiresIn: TOKEN_TTL_SECONDS });
  },
);

/** Public keys products use to verify tokens. Mounted at /.well-known/jwks.json. */
export const jwksRoutes = new Hono<AppEnv>();

jwksRoutes.get("/", async (c) => {
  const sso = c.get("deps").sso;
  if (!sso) throw new AppError(503, "sso_unavailable", "Single sign-on is not configured");
  c.header("cache-control", "public, max-age=300");
  return c.json({ keys: [await sso.publicJwk()] });
});
