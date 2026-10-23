import { eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import type { AppEnv } from "../../app";
import { schema } from "../../db";
import { rateLimit } from "../../lib/rate-limit";
import { clientIp } from "../../lib/request";
import { parseJson } from "../../lib/validate";
import { requireActor, sessionCookieName } from "./middleware";
import { endSession, requestMagicLink, verifyMagicLink } from "./service";
import { mfaRecord, requireMfaStaff, setupMfa, verifyMfa } from "./mfa";

export const authRoutes = new Hono<AppEnv>();
export const meRoutes = new Hono<AppEnv>();

const emailSchema = z.object({ email: z.string().trim().toLowerCase().email().max(254) });
const verifySchema = z.object({ token: z.string().min(20).max(200) });

authRoutes.get("/mfa", async (c) => {
  const actor = requireActor(c);
  requireMfaStaff(actor);
  const record = await mfaRecord(c.get("deps"), actor.user.id);
  return c.json({ enrolled: record?.enabledAt != null, required: actor.mfaRequired === true });
});

// Bound attempts by account as well as IP so rotating networks cannot bypass the guessing budget.
const mfaLimit = () => rateLimit({ name: "mfa-user", limit: 10, windowSeconds: 600, key: (c) => requireActor(c).user.id });
authRoutes.post("/mfa/setup", mfaLimit(), async (c) => c.json(await setupMfa(c.get("deps"), requireActor(c))));
for (const action of ["confirm", "verify"] as const) {
  authRoutes.post(`/mfa/${action}`, mfaLimit(), async (c) => {
    const { code } = await parseJson(c, z.object({ code: z.string().trim().min(6).max(32) }));
    return c.json(await verifyMfa(c.get("deps"), requireActor(c), code, action === "confirm"));
  });
}

authRoutes.post("/magic-link", rateLimit({ name: "magic-ip", limit: 20, windowSeconds: 3600 }), async (c) => {
  const { email } = await parseJson(c, emailSchema);
  await requestMagicLink(c.get("deps"), email, clientIp(c));
  return c.json({ status: "sent_if_account_exists" }, 202);
});

authRoutes.post("/verify", rateLimit({ name: "verify-ip", limit: 30, windowSeconds: 3600 }), async (c) => {
  const deps = c.get("deps");
  const { token } = await parseJson(c, verifySchema);
  const login = await verifyMagicLink(deps, token, clientIp(c), c.req.header("user-agent"), c.get("actor")?.sessionId);
  setCookie(c, sessionCookieName(deps.config.cookieSecure), login.sessionToken, {
    httpOnly: true,
    secure: deps.config.cookieSecure,
    sameSite: "Lax",
    path: "/",
    maxAge: login.maxAgeSeconds,
  });
  return c.json({ user: { id: login.user.id, email: login.user.email, name: login.user.name } });
});

authRoutes.post("/logout", async (c) => {
  const deps = c.get("deps");
  const actor = c.get("actor");
  if (actor && getCookie(c, sessionCookieName(deps.config.cookieSecure))) await endSession(deps, actor);
  deleteCookie(c, sessionCookieName(deps.config.cookieSecure), { path: "/", secure: deps.config.cookieSecure });
  return c.body(null, 204);
});

/** Current user with their organisations. The Portal UI boots from this. */
meRoutes.get("/", async (c) => {
  const actor = requireActor(c);
  const orgIds = [...actor.memberships.keys()];
  const orgs = orgIds.length
    ? await c.get("deps").db.select().from(schema.orgs).where(inArray(schema.orgs.id, orgIds))
    : [];
  return c.json({
    user: {
      id: actor.user.id,
      email: actor.user.email,
      name: actor.user.name,
      staffRole: actor.user.staffRole,
    },
    memberships: orgs.map((org) => ({
      orgId: org.id,
      name: org.name,
      slug: org.slug,
      role: actor.memberships.get(org.id),
    })),
  });
});

meRoutes.patch("/", async (c) => {
  const actor = requireActor(c);
  const { name } = await parseJson(c, z.object({ name: z.string().trim().min(1).max(120) }));
  await c.get("deps").db.update(schema.users).set({ name }).where(eq(schema.users.id, actor.user.id));
  return c.json({ id: actor.user.id, name });
});
