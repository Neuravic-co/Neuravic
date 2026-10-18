import { and, asc, count, desc, eq, getTableColumns, inArray } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "../../app";
import { runBatch, schema } from "../../db";
import { conflict, forbidden, unprocessable } from "../../lib/errors";
import { ulid } from "../../lib/ids";
import { olderThan, pageQuery, toPage } from "../../lib/pagination";
import { parseJson, parseQuery } from "../../lib/validate";
import { auditInsert } from "../audit/audit";
import { requireActor } from "../auth/middleware";
import { drainOutbox, emailJob } from "../notifications/outbox";
import { requireOrgRole } from "../orgs/policy";
import { loadProject, loadRequest } from "./loaders";
import {
  commentSchema,
  createProjectSchema,
  createRequestSchema,
  decisionSchema,
  listRequestsQuery,
  updateProjectSchema,
  updateRequestStateSchema,
} from "./schemas";

/** Request columns plus the requester's display details. */
const requestColumns = {
  ...getTableColumns(schema.requests),
  requesterName: schema.users.name,
  requesterEmail: schema.users.email,
};

/** Client portal: projects, requests, approvals, comments and the activity feed. */
export const portalRoutes = new Hono<AppEnv>();

// ---- Projects ----------------------------------------------------------

portalRoutes.get("/orgs/:orgId/projects", async (c) => {
  const actor = requireActor(c);
  const orgId = c.req.param("orgId");
  requireOrgRole(actor, orgId, "viewer");
  const { cursor, limit } = parseQuery(c, pageQuery);
  const rows = await c
    .get("deps")
    .db.select()
    .from(schema.projects)
    .where(and(eq(schema.projects.orgId, orgId), olderThan(schema.projects.createdAt, schema.projects.id, cursor)))
    .orderBy(desc(schema.projects.createdAt), desc(schema.projects.id))
    .limit(limit + 1);
  return c.json(toPage(rows, limit));
});

portalRoutes.post("/orgs/:orgId/projects", async (c) => {
  const actor = requireActor(c);
  const deps = c.get("deps");
  const orgId = c.req.param("orgId");
  requireOrgRole(actor, orgId, "admin");
  const input = await parseJson(c, createProjectSchema);
  const now = deps.now();
  const project = {
    id: ulid(now),
    orgId,
    name: input.name,
    description: input.description ?? null,
    status: "active" as const,
    createdBy: actor.user.id,
    createdAt: now,
  };
  await runBatch(deps.db, [
    deps.db.insert(schema.projects).values(project),
    auditInsert(deps.db, { actorId: actor.user.id, orgId, action: "project.created", targetType: "project", targetId: project.id }, now),
  ]);
  return c.json(project, 201);
});

portalRoutes.get("/projects/:id", async (c) => {
  const actor = requireActor(c);
  const project = await loadProject(c.get("deps").db, c.req.param("id"));
  requireOrgRole(actor, project.orgId, "viewer");
  return c.json(project);
});

portalRoutes.patch("/projects/:id", async (c) => {
  const actor = requireActor(c);
  const deps = c.get("deps");
  const project = await loadProject(deps.db, c.req.param("id"));
  requireOrgRole(actor, project.orgId, "admin");
  const changes = await parseJson(c, updateProjectSchema);
  const now = deps.now();
  await runBatch(deps.db, [
    deps.db.update(schema.projects).set(changes).where(eq(schema.projects.id, project.id)),
    auditInsert(deps.db, { actorId: actor.user.id, orgId: project.orgId, action: "project.updated", targetType: "project", targetId: project.id, meta: { fields: Object.keys(changes) } }, now),
  ]);
  return c.json({ ...project, ...changes });
});

// ---- Requests ----------------------------------------------------------

portalRoutes.get("/projects/:id/requests", async (c) => {
  const actor = requireActor(c);
  const deps = c.get("deps");
  const project = await loadProject(deps.db, c.req.param("id"));
  requireOrgRole(actor, project.orgId, "viewer");
  const { state, cursor, limit } = parseQuery(c, listRequestsQuery);
  const rows = await deps.db
    .select(requestColumns)
    .from(schema.requests)
    .innerJoin(schema.users, eq(schema.users.id, schema.requests.requestedBy))
    .where(and(eq(schema.requests.projectId, project.id), state ? eq(schema.requests.state, state) : undefined, olderThan(schema.requests.createdAt, schema.requests.id, cursor)))
    .orderBy(desc(schema.requests.createdAt), desc(schema.requests.id))
    .limit(limit + 1);
  return c.json(toPage(rows, limit));
});

/** Approver queue across all projects of an organisation. */
portalRoutes.get("/orgs/:orgId/requests", async (c) => {
  const actor = requireActor(c);
  const orgId = c.req.param("orgId");
  requireOrgRole(actor, orgId, "viewer");
  const { state, cursor, limit } = parseQuery(c, listRequestsQuery);
  const rows = await c
    .get("deps")
    .db.select(requestColumns)
    .from(schema.requests)
    .innerJoin(schema.users, eq(schema.users.id, schema.requests.requestedBy))
    .where(and(eq(schema.requests.orgId, orgId), state ? eq(schema.requests.state, state) : undefined, olderThan(schema.requests.createdAt, schema.requests.id, cursor)))
    .orderBy(desc(schema.requests.createdAt), desc(schema.requests.id))
    .limit(limit + 1);
  return c.json(toPage(rows, limit));
});

portalRoutes.post("/projects/:id/requests", async (c) => {
  const actor = requireActor(c);
  const deps = c.get("deps");
  const project = await loadProject(deps.db, c.req.param("id"));
  requireOrgRole(actor, project.orgId, "member");
  if (project.status !== "active") throw conflict("Requests can only be added to active projects");
  const input = await parseJson(c, createRequestSchema);
  const now = deps.now();
  const request = {
    id: ulid(now),
    projectId: project.id,
    orgId: project.orgId,
    type: input.type,
    title: input.title,
    body: input.body,
    state: "open" as const,
    requiredApprovals: input.requiredApprovals,
    requestedBy: actor.user.id,
    createdAt: now,
    updatedAt: now,
  };

  // Tell the people who can approve it (org owners and admins, not the requester).
  const approvers = await deps.db
    .select({ email: schema.users.email })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(and(eq(schema.memberships.orgId, project.orgId), inArray(schema.memberships.role, ["admin", "owner"])));
  const notifications = approvers
    .filter((a) => a.email !== actor.user.email)
    .slice(0, 10)
    .map((a) =>
      emailJob(deps.db, now, {
        to: a.email,
        subject: `Approval needed: ${request.title.replace(/[\r\n]+/g, " ")}`,
        text: `${actor.user.name ?? actor.user.email} submitted a ${request.type} request in "${project.name}".\n\nOpen the portal to review: ${deps.config.appUrl}/portal`,
      }),
    );

  await runBatch(deps.db, [
    deps.db.insert(schema.requests).values(request),
    ...notifications,
    auditInsert(deps.db, { actorId: actor.user.id, orgId: project.orgId, action: "request.created", targetType: "request", targetId: request.id, meta: { type: request.type } }, now),
  ]);
  if (notifications.length) await deps.runInBackground(() => drainOutbox(deps));
  return c.json(request, 201);
});

portalRoutes.get("/requests/:id", async (c) => {
  const actor = requireActor(c);
  const deps = c.get("deps");
  const request = await loadRequest(deps.db, c.req.param("id"));
  requireOrgRole(actor, request.orgId, "viewer");
  const [approvals, comments, files, [requester]] = await Promise.all([
    deps.db
      .select({ ...getTableColumns(schema.approvals), approverName: schema.users.name, approverEmail: schema.users.email })
      .from(schema.approvals)
      .innerJoin(schema.users, eq(schema.users.id, schema.approvals.approverId))
      .where(eq(schema.approvals.requestId, request.id))
      .orderBy(asc(schema.approvals.decidedAt)),
    deps.db
      .select({ ...getTableColumns(schema.comments), authorName: schema.users.name, authorEmail: schema.users.email })
      .from(schema.comments)
      .innerJoin(schema.users, eq(schema.users.id, schema.comments.authorId))
      .where(eq(schema.comments.requestId, request.id))
      .orderBy(asc(schema.comments.createdAt)),
    deps.db
      .select({ id: schema.files.id, name: schema.files.name, size: schema.files.size, mime: schema.files.mime, createdAt: schema.files.createdAt, uploadedBy: schema.files.uploadedBy })
      .from(schema.files)
      .where(eq(schema.files.requestId, request.id))
      .orderBy(asc(schema.files.createdAt)),
    deps.db.select({ name: schema.users.name, email: schema.users.email }).from(schema.users).where(eq(schema.users.id, request.requestedBy)).limit(1),
  ]);
  return c.json({ ...request, requesterName: requester?.name ?? null, requesterEmail: requester?.email ?? null, approvals, comments, files });
});

/** Requester (or an org admin) can cancel an open request; admins mark approved work completed. */
portalRoutes.patch("/requests/:id", async (c) => {
  const actor = requireActor(c);
  const deps = c.get("deps");
  const request = await loadRequest(deps.db, c.req.param("id"));
  const role = requireOrgRole(actor, request.orgId, "member");
  const { state } = await parseJson(c, updateRequestStateSchema);
  const isAdmin = role === "admin" || role === "owner";

  if (state === "cancelled") {
    if (request.state !== "open") throw conflict("Only open requests can be cancelled");
    if (request.requestedBy !== actor.user.id && !isAdmin) throw forbidden();
  } else {
    if (!isAdmin) throw forbidden();
    if (request.state !== "approved") throw conflict("Only approved requests can be completed");
  }
  const now = deps.now();
  await runBatch(deps.db, [
    deps.db.update(schema.requests).set({ state, updatedAt: now }).where(eq(schema.requests.id, request.id)),
    auditInsert(deps.db, { actorId: actor.user.id, orgId: request.orgId, action: `request.${state}`, targetType: "request", targetId: request.id }, now),
  ]);
  return c.json({ id: request.id, state });
});

// ---- Approvals ---------------------------------------------------------

portalRoutes.post("/requests/:id/approvals", async (c) => {
  const actor = requireActor(c);
  const deps = c.get("deps");
  const request = await loadRequest(deps.db, c.req.param("id"));
  requireOrgRole(actor, request.orgId, "admin");
  if (request.requestedBy === actor.user.id) throw forbidden("You cannot decide on your own request");
  if (request.state !== "open") throw conflict("This request is no longer open");
  const input = await parseJson(c, decisionSchema);

  const [already] = await deps.db
    .select({ id: schema.approvals.id })
    .from(schema.approvals)
    .where(and(eq(schema.approvals.requestId, request.id), eq(schema.approvals.approverId, actor.user.id)))
    .limit(1);
  if (already) throw conflict("You have already decided on this request");

  const [{ approved }] = (await deps.db
    .select({ approved: count() })
    .from(schema.approvals)
    .where(and(eq(schema.approvals.requestId, request.id), eq(schema.approvals.decision, "approved")))) as [{ approved: number }];

  const now = deps.now();
  const state =
    input.decision === "rejected" ? "rejected" : approved + 1 >= request.requiredApprovals ? "approved" : "open";
  const [requester] = await deps.db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, request.requestedBy)).limit(1);

  const writes: unknown[] = [
    deps.db.insert(schema.approvals).values({
      id: ulid(now),
      requestId: request.id,
      approverId: actor.user.id,
      decision: input.decision,
      comment: input.comment ?? null,
      decidedAt: now,
    }),
    deps.db.update(schema.requests).set({ state, updatedAt: now }).where(eq(schema.requests.id, request.id)),
    auditInsert(deps.db, { actorId: actor.user.id, orgId: request.orgId, action: `request.${input.decision}`, targetType: "request", targetId: request.id }, now),
  ];
  if (requester && state !== "open") {
    writes.push(
      emailJob(deps.db, now, {
        to: requester.email,
        subject: `Your request was ${state}: ${request.title.replace(/[\r\n]+/g, " ")}`,
        text: `Your request "${request.title}" is now ${state}.${input.comment ? `\n\nComment: ${input.comment}` : ""}\n\n${deps.config.appUrl}/portal`,
      }),
    );
  }
  try {
    await runBatch(deps.db, writes);
  } catch (error) {
    // The unique (request, approver) index closes the race between two clicks.
    if (String(error).includes("UNIQUE")) throw unprocessable("You have already decided on this request");
    throw error;
  }
  if (state !== "open") await deps.runInBackground(() => drainOutbox(deps));
  return c.json({ requestId: request.id, decision: input.decision, state }, 201);
});

// ---- Comments ----------------------------------------------------------

portalRoutes.get("/requests/:id/comments", async (c) => {
  const actor = requireActor(c);
  const deps = c.get("deps");
  const request = await loadRequest(deps.db, c.req.param("id"));
  requireOrgRole(actor, request.orgId, "viewer");
  const rows = await deps.db
    .select({ ...getTableColumns(schema.comments), authorName: schema.users.name, authorEmail: schema.users.email })
    .from(schema.comments)
    .innerJoin(schema.users, eq(schema.users.id, schema.comments.authorId))
    .where(eq(schema.comments.requestId, request.id))
    .orderBy(asc(schema.comments.createdAt));
  return c.json({ items: rows });
});

portalRoutes.post("/requests/:id/comments", async (c) => {
  const actor = requireActor(c);
  const deps = c.get("deps");
  const request = await loadRequest(deps.db, c.req.param("id"));
  requireOrgRole(actor, request.orgId, "member");
  const { body } = await parseJson(c, commentSchema);
  const now = deps.now();
  const comment = { id: ulid(now), requestId: request.id, authorId: actor.user.id, body, createdAt: now };
  await runBatch(deps.db, [
    deps.db.insert(schema.comments).values(comment),
    auditInsert(deps.db, { actorId: actor.user.id, orgId: request.orgId, action: "comment.added", targetType: "request", targetId: request.id }, now),
  ]);
  return c.json({ ...comment, authorName: actor.user.name, authorEmail: actor.user.email }, 201);
});

// ---- Activity feed -----------------------------------------------------

portalRoutes.get("/orgs/:orgId/activity", async (c) => {
  const actor = requireActor(c);
  const orgId = c.req.param("orgId");
  requireOrgRole(actor, orgId, "viewer");
  const { cursor, limit } = parseQuery(c, pageQuery);
  const rows = await c
    .get("deps")
    .db.select({
      id: schema.auditLog.id,
      createdAt: schema.auditLog.at,
      actorId: schema.auditLog.actorId,
      actorName: schema.users.name,
      actorEmail: schema.users.email,
      action: schema.auditLog.action,
      targetType: schema.auditLog.targetType,
      targetId: schema.auditLog.targetId,
    })
    .from(schema.auditLog)
    .leftJoin(schema.users, eq(schema.users.id, schema.auditLog.actorId))
    .where(and(eq(schema.auditLog.orgId, orgId), olderThan(schema.auditLog.at, schema.auditLog.id, cursor)))
    .orderBy(desc(schema.auditLog.at), desc(schema.auditLog.id))
    .limit(limit + 1);
  return c.json(toPage(rows, limit));
});
