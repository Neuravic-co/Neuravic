import { and, count, desc, eq, isNotNull, isNull, min, sql, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "../../app";
import { runBatch, schema } from "../../db";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { ulid } from "../../lib/ids";
import { olderThan, toPage } from "../../lib/pagination";
import { parseJson, parseQuery } from "../../lib/validate";
import { auditInsert } from "../audit/audit";
import { requireStaff } from "../auth/middleware";
import { loginLinkWrites } from "../auth/service";
import { contentAdminRoutes } from "../content/routes";
import { drainOutbox } from "../notifications/outbox";
import { auditQuery, inviteStaffSchema, listUsersQuery, updateUserSchema } from "./schemas";

/** Staff-only management API. Each handler enforces the staff role it needs. */
export const adminRoutes = new Hono<AppEnv>();

adminRoutes.route("/content", contentAdminRoutes);

/** Private operational evidence, never keys, hashes, recipients or file content. */
adminRoutes.get("/security-status", async (c) => {
  requireStaff(c, ["admin"]);
  const deps = c.get("deps");
  const [staff, factors, scans, jobs] = await Promise.all([
    deps.db.select({ total: count() }).from(schema.users).where(and(eq(schema.users.status, "active"), isNotNull(schema.users.staffRole))),
    deps.db.select({ total: count() }).from(schema.staffMfa).innerJoin(schema.users, eq(schema.users.id, schema.staffMfa.userId)).where(and(isNotNull(schema.staffMfa.enabledAt), eq(schema.users.status, "active"), isNotNull(schema.users.staffRole))),
    deps.db.select({ state: schema.files.scanState, total: count(), oldest: min(schema.files.createdAt) }).from(schema.files).groupBy(schema.files.scanState),
    deps.db.select({ state: schema.outbox.state, total: count(), oldest: min(schema.outbox.createdAt) }).from(schema.outbox).groupBy(schema.outbox.state),
  ]);
  await deps.db.execute(sql`select 1 as ready`);
  return c.json({
    database: "reachable",
    controls: { deployedEnvironment: deps.config.environment !== "development", dedicatedPrivacyKey: deps.config.privacyHashSecret !== "neuravic-development-identifiers-only", staffMfaRequired: deps.config.staffMfaRequired, mfaKeyConfigured: Boolean(deps.config.mfaEncryptionKey), mailConfigured: Boolean(deps.config.resendApiKey || deps.config.smtpUrl), storageBound: Boolean(deps.blobs), scannerBound: Boolean(deps.scanner) },
    staff: { active: staff[0]?.total ?? 0, enrolled: factors[0]?.total ?? 0 },
    files: scans, outbox: jobs,
  });
});

/** Counts for the admin console landing page. */
adminRoutes.get("/overview", async (c) => {
  requireStaff(c, ["admin"]);
  const { db } = c.get("deps");
  const [leadsByStatus, orgs, users, openRequests, outbox] = await Promise.all([
    db.select({ status: schema.leads.status, total: count() }).from(schema.leads).groupBy(schema.leads.status),
    db.select({ total: count() }).from(schema.orgs),
    db.select({ total: count() }).from(schema.users),
    db.select({ total: count() }).from(schema.requests).where(eq(schema.requests.state, "open")),
    db.select({ state: schema.outbox.state, total: count() }).from(schema.outbox).groupBy(schema.outbox.state),
  ]);
  return c.json({
    leads: Object.fromEntries(leadsByStatus.map((r) => [r.status, r.total])),
    orgs: orgs[0]?.total ?? 0,
    users: users[0]?.total ?? 0,
    openRequests: openRequests[0]?.total ?? 0,
    outbox: Object.fromEntries(outbox.map((r) => [r.state, r.total])),
  });
});

adminRoutes.get("/users", async (c) => {
  requireStaff(c, ["admin"]);
  const { staff, cursor, limit } = parseQuery(c, listUsersQuery);
  const filters: (SQL | undefined)[] = [
    staff === "true" ? isNotNull(schema.users.staffRole) : staff === "false" ? isNull(schema.users.staffRole) : undefined,
    olderThan(schema.users.createdAt, schema.users.id, cursor),
  ];
  const rows = await c
    .get("deps")
    .db.select()
    .from(schema.users)
    .where(and(...filters))
    .orderBy(desc(schema.users.createdAt), desc(schema.users.id))
    .limit(limit + 1);
  return c.json(toPage(rows, limit));
});

/** Adds a Neuravic team member (or promotes an existing user) and emails a sign-in link. */
adminRoutes.post("/staff", async (c) => {
  const actor = requireStaff(c, ["admin"]);
  const deps = c.get("deps");
  const input = await parseJson(c, inviteStaffSchema);
  const now = deps.now();
  const [existing] = await deps.db.select().from(schema.users).where(eq(schema.users.email, input.email)).limit(1);
  if (existing?.staffRole) throw conflict("This person is already on the team");
  if (existing?.status === "disabled") throw badRequest("This user is disabled");

  const user =
    existing ?? { id: ulid(now), email: input.email, name: input.name ?? null, status: "invited" as const, staffRole: null, createdAt: now, lastLoginAt: null };
  const writes: unknown[] = [
    existing
      ? deps.db.update(schema.users).set({ staffRole: input.staffRole }).where(eq(schema.users.id, existing.id))
      : deps.db.insert(schema.users).values({ ...user, staffRole: input.staffRole }),
    ...(await loginLinkWrites(deps, { ...user, staffRole: input.staffRole }, now, "the Neuravic team")),
    auditInsert(deps.db, { actorId: actor.user.id, action: "staff.invited", targetType: "user", targetId: user.id, meta: { staffRole: input.staffRole } }, now),
  ];
  await runBatch(deps.db, writes);
  await deps.runInBackground(() => drainOutbox(deps));
  return c.json({ id: user.id, email: user.email, staffRole: input.staffRole }, 201);
});

adminRoutes.patch("/users/:id", async (c) => {
  const actor = requireStaff(c, ["admin"]);
  const deps = c.get("deps");
  const id = c.req.param("id");
  const changes = await parseJson(c, updateUserSchema);
  const [target] = await deps.db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
  if (!target) throw notFound("User not found");

  const losingAdmin =
    target.staffRole === "admin" &&
    (changes.status === "disabled" || (changes.staffRole !== undefined && changes.staffRole !== "admin"));
  if (losingAdmin) {
    if (id === actor.user.id) throw conflict("You cannot remove your own admin access");
    const admins = await deps.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(and(eq(schema.users.staffRole, "admin"), eq(schema.users.status, "active")));
    if (admins.filter((a) => a.id !== id).length === 0) throw conflict("At least one active staff admin is required");
  }

  const now = deps.now();
  const writes: unknown[] = [
    deps.db.update(schema.users).set(changes).where(eq(schema.users.id, id)),
    auditInsert(deps.db, { actorId: actor.user.id, action: "user.updated", targetType: "user", targetId: id, meta: { fields: Object.keys(changes) } }, now),
  ];
  // Disabling or changing staff access ends existing sessions immediately.
  if (changes.status === "disabled" || changes.staffRole !== undefined) {
    writes.push(deps.db.delete(schema.sessions).where(eq(schema.sessions.userId, id)));
  }
  await runBatch(deps.db, writes);
  return c.json({ id, ...changes });
});

adminRoutes.get("/audit", async (c) => {
  requireStaff(c, ["admin"]);
  const { action, orgId, cursor, limit } = parseQuery(c, auditQuery);
  const rows = await c
    .get("deps")
    .db.select({
      id: schema.auditLog.id,
      createdAt: schema.auditLog.at,
      actorId: schema.auditLog.actorId,
      orgId: schema.auditLog.orgId,
      action: schema.auditLog.action,
      targetType: schema.auditLog.targetType,
      targetId: schema.auditLog.targetId,
      meta: schema.auditLog.meta,
    })
    .from(schema.auditLog)
    .where(
      and(
        action ? eq(schema.auditLog.action, action) : undefined,
        orgId ? eq(schema.auditLog.orgId, orgId) : undefined,
        olderThan(schema.auditLog.at, schema.auditLog.id, cursor),
      ),
    )
    .orderBy(desc(schema.auditLog.at), desc(schema.auditLog.id))
    .limit(limit + 1);
  return c.json(toPage(rows, limit));
});
