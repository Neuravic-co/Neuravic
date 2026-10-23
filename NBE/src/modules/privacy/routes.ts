import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../app";
import { runBatch, schema } from "../../db";
import { AppError, conflict, forbidden, notFound } from "../../lib/errors";
import { ulid } from "../../lib/ids";
import { olderThan, pageQuery, toPage } from "../../lib/pagination";
import { rateLimit } from "../../lib/rate-limit";
import { parseJson, parseQuery } from "../../lib/validate";
import { auditInsert } from "../audit/audit";
import { requireActor, requireStaff } from "../auth/middleware";
import type { Actor } from "../auth/actor";

export const privacyRoutes = new Hono<AppEnv>();
export const privacyAdminRoutes = new Hono<AppEnv>();
function requireRecent(actor: Actor, now: number) {
  if (actor.sessionCreatedAt === undefined || actor.sessionCreatedAt <= now - 15 * 60_000) throw new AppError(403, "recent_auth_required", "Sign in again before continuing this privacy action");
}
const accountLimit = () => rateLimit({ name: "privacy-user", limit: 5, windowSeconds: 3600, key: (c) => requireActor(c).user.id });

/** A minimal self-service account copy; tenant content/full legal exports require reviewed fulfillment. */
privacyRoutes.get("/export", accountLimit(), async (c) => {
  const actor = requireActor(c);
  const deps = c.get("deps");
  requireRecent(actor, deps.now());
  const memberships = await deps.db.select({ orgId: schema.memberships.orgId, role: schema.memberships.role, joinedAt: schema.memberships.createdAt }).from(schema.memberships).where(eq(schema.memberships.userId, actor.user.id)).limit(101);
  if (memberships.length > 100) throw new AppError(409, "reviewed_export_required", "Request a reviewed export for this account");
  await auditInsert(deps.db, { actorId: actor.user.id, action: "privacy.account_copy_downloaded" }, deps.now());
  c.header("content-disposition", 'attachment; filename="neuravic-account.json"');
  return c.json({ exportedAt: deps.now(), scope: "account_profile_and_current_memberships", profile: { id: actor.user.id, email: actor.user.email, name: actor.user.name, createdAt: actor.user.createdAt }, memberships,
    notice: "This account copy excludes tenant records, security credentials and internal records. Request a reviewed export for a full privacy response." });
});

privacyRoutes.get("/requests", async (c) => {
  const actor = requireActor(c);
  const { cursor, limit } = parseQuery(c, pageQuery);
  const rows = await c.get("deps").db.select({ id: schema.privacyRequests.id, kind: schema.privacyRequests.kind, state: schema.privacyRequests.state, createdAt: schema.privacyRequests.createdAt, updatedAt: schema.privacyRequests.updatedAt })
    .from(schema.privacyRequests).where(and(eq(schema.privacyRequests.userId, actor.user.id), olderThan(schema.privacyRequests.createdAt, schema.privacyRequests.id, cursor)))
    .orderBy(desc(schema.privacyRequests.createdAt), desc(schema.privacyRequests.id)).limit(limit + 1);
  return c.json(toPage(rows, limit));
});

privacyRoutes.post("/requests", accountLimit(), async (c) => {
  const actor = requireActor(c);
  const deps = c.get("deps");
  const now = deps.now();
  requireRecent(actor, now);
  const { kind } = await parseJson(c, z.object({ kind: z.enum(["export", "erasure"]) }).strict());
  const [existing] = await deps.db.select({ id: schema.privacyRequests.id }).from(schema.privacyRequests).where(and(eq(schema.privacyRequests.userId, actor.user.id), eq(schema.privacyRequests.kind, kind), inArray(schema.privacyRequests.state, ["pending", "in_review"]))).limit(1);
  if (existing) return c.json({ id: existing.id, status: "pending_review" }, 202);
  const id = ulid(now);
  const [created] = await runBatch(deps.db, [
    deps.db.insert(schema.privacyRequests).values({ id, userId: actor.user.id, kind, createdAt: now, updatedAt: now }).onConflictDoNothing().returning({ id: schema.privacyRequests.id }),
    auditInsert(deps.db, { actorId: actor.user.id, action: "privacy.requested", targetType: "privacy_request", targetId: id, meta: { kind } }, now, null, sql`changes() > 0`),
  ]);
  if (Array.isArray(created) && created.length === 1) return c.json({ id, status: "pending_review" }, 202);
  const [pending] = await deps.db.select({ id: schema.privacyRequests.id }).from(schema.privacyRequests).where(and(eq(schema.privacyRequests.userId, actor.user.id), eq(schema.privacyRequests.kind, kind), inArray(schema.privacyRequests.state, ["pending", "in_review"]))).limit(1);
  if (!pending) throw conflict("The privacy request changed. Reload your requests before trying again");
  return c.json({ id: pending.id, status: "pending_review" }, 202);
});

privacyAdminRoutes.get("/", async (c) => {
  requireStaff(c, ["admin"]);
  const { cursor, limit } = parseQuery(c, pageQuery);
  const rows = await c.get("deps").db.select().from(schema.privacyRequests).where(olderThan(schema.privacyRequests.createdAt, schema.privacyRequests.id, cursor))
    .orderBy(desc(schema.privacyRequests.createdAt), desc(schema.privacyRequests.id)).limit(limit + 1);
  return c.json(toPage(rows, limit));
});

/** Record supervised fulfillment without pretending this endpoint erases tenant/business records. */
privacyAdminRoutes.patch("/:id", async (c) => {
  const actor = requireStaff(c, ["admin"]);
  const deps = c.get("deps");
  requireRecent(actor, deps.now());
  const input = await parseJson(c, z.object({ state: z.enum(["in_review", "fulfilled", "declined"]), expectedState: z.enum(["pending", "in_review"]),
    reviewReference: z.string().regex(/^[A-Za-z0-9._-]{8,100}$/), identityVerified: z.literal(true), retentionReviewed: z.literal(true) }).strict());
  const [request] = await deps.db.select().from(schema.privacyRequests).where(eq(schema.privacyRequests.id, c.req.param("id"))).limit(1);
  if (!request) throw notFound();
  if (request.userId === actor.user.id) throw forbidden("Another staff admin must review your request");
  if (input.state !== "in_review" && input.expectedState !== "in_review") throw conflict("Review the request before recording completion");
  const now = deps.now();
  const [changed] = await runBatch(deps.db, [
    deps.db.update(schema.privacyRequests).set({ state: input.state, updatedAt: now, reviewedBy: actor.user.id, reviewReference: input.reviewReference }).where(and(eq(schema.privacyRequests.id, request.id), eq(schema.privacyRequests.state, input.expectedState))).returning({ id: schema.privacyRequests.id }),
    auditInsert(deps.db, { actorId: actor.user.id, action: `privacy.${input.state}`, targetType: "privacy_request", targetId: request.id, meta: { reviewReference: input.reviewReference } }, now, null, sql`changes() > 0`),
  ]);
  if (!Array.isArray(changed) || changed.length !== 1) throw conflict("The request changed; reload before continuing");
  return c.json({ id: request.id, state: input.state });
});
