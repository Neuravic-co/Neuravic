import { and, asc, count, desc, eq, sql, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "../../app";
import { runBatch, schema, type Db } from "../../db";
import { badRequest, conflict, forbidden, notFound } from "../../lib/errors";
import { ulid } from "../../lib/ids";
import { olderThan, pageQuery, toPage } from "../../lib/pagination";
import { parseJson, parseQuery } from "../../lib/validate";
import { auditInsert } from "../audit/audit";
import { requireActor, requireStaff } from "../auth/middleware";
import { loginLinkWrites } from "../auth/service";
import { drainOutbox } from "../notifications/outbox";
import { ROLE_RANK, requireOrgRole } from "./policy";
import { addMemberSchema, changeRoleSchema, createOrgSchema, slugify } from "./schemas";

export const orgsRoutes = new Hono<AppEnv>();

/**
 * SQL condition that is true unless the statement would remove the organisation's last owner.
 * It runs inside the same statement as the change, so two owners cannot remove each other at once.
 */
function keepsAnOwner(orgId: string, staysOwner: boolean): SQL {
  if (staysOwner) return sql`1 = 1`;
  return sql`(${schema.memberships.role} <> 'owner' OR (SELECT count(*) FROM memberships WHERE org_id = ${orgId} AND role = 'owner') > 1)`;
}

const memberOf = (orgId: string, userId: string) =>
  and(eq(schema.memberships.orgId, orgId), eq(schema.memberships.userId, userId));

const LAST_OWNER_MESSAGE = "An organisation must keep at least one owner";

/** Staff admin creates a client organisation, optionally inviting its first owner. */
orgsRoutes.post("/", async (c) => {
  const actor = requireStaff(c, ["admin"]);
  const deps = c.get("deps");
  const input = await parseJson(c, createOrgSchema);
  const now = deps.now();
  const id = ulid(now);
  const slug = input.slug ?? slugify(input.name);

  const [taken] = await deps.db.select({ id: schema.orgs.id }).from(schema.orgs).where(eq(schema.orgs.slug, slug)).limit(1);
  if (taken) throw conflict("An organisation with this slug already exists");

  const writes: unknown[] = [
    deps.db.insert(schema.orgs).values({ id, name: input.name, slug, createdAt: now }),
    auditInsert(deps.db, { actorId: actor.user.id, orgId: id, action: "org.created", targetType: "org", targetId: id }, now),
  ];
  if (input.ownerEmail) writes.push(...(await inviteWrites(deps, input.ownerEmail, "owner", id, input.name, now)));
  await runBatch(deps.db, writes);
  if (input.ownerEmail) await deps.runInBackground(() => drainOutbox(deps));
  return c.json({ id, name: input.name, slug }, 201);
});

/** Staff directory of all client organisations. Clients use GET /me instead. */
orgsRoutes.get("/", async (c) => {
  requireStaff(c, ["admin", "delivery"]);
  const { cursor, limit } = parseQuery(c, pageQuery);
  const rows = await c
    .get("deps")
    .db.select()
    .from(schema.orgs)
    .where(olderThan(schema.orgs.createdAt, schema.orgs.id, cursor))
    .orderBy(desc(schema.orgs.createdAt), desc(schema.orgs.id))
    .limit(limit + 1);
  return c.json(toPage(rows, limit));
});

orgsRoutes.get("/:orgId", async (c) => {
  const actor = requireActor(c);
  const orgId = c.req.param("orgId");
  const role = requireOrgRole(actor, orgId, "viewer");
  const [org] = await c.get("deps").db.select().from(schema.orgs).where(eq(schema.orgs.id, orgId)).limit(1);
  if (!org) throw notFound("Organisation not found");
  return c.json({ ...org, role });
});

orgsRoutes.get("/:orgId/members", async (c) => {
  const actor = requireActor(c);
  const orgId = c.req.param("orgId");
  requireOrgRole(actor, orgId, "viewer");
  const rows = await c
    .get("deps")
    .db.select({
      userId: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      status: schema.users.status,
      role: schema.memberships.role,
    })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(eq(schema.memberships.orgId, orgId))
    .orderBy(asc(schema.users.email));
  return c.json({ items: rows });
});

/** Creates the user if needed, adds the membership and emails a sign-in invitation. */
async function inviteWrites(
  deps: import("../../deps").Deps,
  email: string,
  role: (typeof schema.memberships.$inferInsert)["role"],
  orgId: string,
  orgName: string,
  now: number,
  name?: string,
) {
  const writes: unknown[] = [];
  let [user] = await deps.db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (!user) {
    user = { id: ulid(now), email, name: name ?? null, status: "invited", staffRole: null, createdAt: now, lastLoginAt: null };
    writes.push(deps.db.insert(schema.users).values(user));
  } else if (user.status === "disabled") {
    throw badRequest("This user is disabled");
  }
  const [existing] = await deps.db
    .select({ userId: schema.memberships.userId })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.userId, user.id), eq(schema.memberships.orgId, orgId)))
    .limit(1);
  if (existing) throw conflict("This person is already a member");

  writes.push(
    deps.db.insert(schema.memberships).values({ userId: user.id, orgId, role, createdAt: now }),
    ...(await loginLinkWrites(deps, user, now, orgName)),
    auditInsert(deps.db, { orgId, action: "org.member_invited", targetType: "user", targetId: user.id, meta: { role } }, now),
  );
  return writes;
}

orgsRoutes.post("/:orgId/members", async (c) => {
  const actor = requireActor(c);
  const deps = c.get("deps");
  const orgId = c.req.param("orgId");
  const callerRole = requireOrgRole(actor, orgId, "admin");
  const input = await parseJson(c, addMemberSchema);
  if (ROLE_RANK[input.role] > ROLE_RANK[callerRole]) throw forbidden("You cannot grant a higher role than your own");

  const [org] = await deps.db.select().from(schema.orgs).where(eq(schema.orgs.id, orgId)).limit(1);
  if (!org) throw notFound("Organisation not found");
  const now = deps.now();
  const writes = await inviteWrites(deps, input.email, input.role, orgId, org.name, now, input.name);
  await runBatch(deps.db, writes);
  await deps.runInBackground(() => drainOutbox(deps));
  return c.json({ email: input.email, role: input.role }, 201);
});

orgsRoutes.patch("/:orgId/members/:userId", async (c) => {
  const actor = requireActor(c);
  const deps = c.get("deps");
  const { orgId, userId } = c.req.param();
  const callerRole = requireOrgRole(actor, orgId, "admin");
  const { role } = await parseJson(c, changeRoleSchema);

  const [target] = await deps.db
    .select()
    .from(schema.memberships)
    .where(memberOf(orgId, userId))
    .limit(1);
  if (!target) throw notFound("Member not found");
  if (ROLE_RANK[role] > ROLE_RANK[callerRole] || ROLE_RANK[target.role] > ROLE_RANK[callerRole]) {
    throw forbidden("You cannot change a role higher than your own");
  }
  const now = deps.now();
  const [changed] = await runBatch(deps.db, [deps.db
    .update(schema.memberships)
    .set({ role })
    .where(and(memberOf(orgId, userId), keepsAnOwner(orgId, role === "owner")))
    .returning({ userId: schema.memberships.userId }),
    auditInsert(deps.db, { actorId: actor.user.id, orgId, action: "org.member_role_changed", targetType: "user", targetId: userId, meta: { from: target.role, to: role } }, now, null, sql`changes() > 0`),
  ]);
  if (!Array.isArray(changed) || changed.length === 0) throw conflict(LAST_OWNER_MESSAGE);
  return c.json({ userId, role });
});

orgsRoutes.delete("/:orgId/members/:userId", async (c) => {
  const actor = requireActor(c);
  const deps = c.get("deps");
  const { orgId, userId } = c.req.param();
  const leavingSelf = userId === actor.user.id;
  const callerRole = requireOrgRole(actor, orgId, leavingSelf ? "viewer" : "admin");

  const [target] = await deps.db
    .select()
    .from(schema.memberships)
    .where(memberOf(orgId, userId))
    .limit(1);
  if (!target) throw notFound("Member not found");
  if (!leavingSelf && ROLE_RANK[target.role] > ROLE_RANK[callerRole]) throw forbidden();
  const now = deps.now();
  const [removed] = await runBatch(deps.db, [deps.db
    .delete(schema.memberships)
    .where(and(memberOf(orgId, userId), keepsAnOwner(orgId, false)))
    .returning({ userId: schema.memberships.userId }),
    auditInsert(deps.db, { actorId: actor.user.id, orgId, action: "org.member_removed", targetType: "user", targetId: userId }, now, null, sql`changes() > 0`),
  ]);
  if (!Array.isArray(removed) || removed.length === 0) throw conflict(LAST_OWNER_MESSAGE);
  return c.body(null, 204);
});
