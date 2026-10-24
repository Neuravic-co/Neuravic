import { and, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../app";
import { runBatch, schema } from "../../db";
import { notFound } from "../../lib/errors";
import { ulid } from "../../lib/ids";
import { olderThan, toPage } from "../../lib/pagination";
import { parseJson, parseQuery } from "../../lib/validate";
import { auditInsert, writeAudit } from "../audit/audit";
import { requireStaff } from "../auth/middleware";
import { leadNoteSchema, listLeadsQuery, updateLeadSchema } from "./schemas";

const exportQuery = z.object({
  from: z.coerce.number().int().min(0).default(0),
  to: z.coerce.number().int().min(0).default(Number.MAX_SAFE_INTEGER),
});

/** Lead inbox for Neuravic staff (admin and sales roles). */
export const leadsAdminRoutes = new Hono<AppEnv>();

const INBOX_ROLES = ["admin", "sales"] as const;

leadsAdminRoutes.get("/", async (c) => {
  requireStaff(c, INBOX_ROLES);
  const { status, cursor, limit } = parseQuery(c, listLeadsQuery);
  const filters: (SQL | undefined)[] = [
    status ? eq(schema.leads.status, status) : undefined,
    olderThan(schema.leads.createdAt, schema.leads.id, cursor),
  ];
  const rows = await c
    .get("deps")
    .db.select()
    .from(schema.leads)
    .where(and(...filters))
    .orderBy(desc(schema.leads.createdAt), desc(schema.leads.id))
    .limit(limit + 1);
  const { items, nextCursor } = toPage(rows, limit);
  return c.json({ items: items.map(({ messageHash: _hash, ipHash: _ip, ...lead }) => lead), nextCursor });
});

/** CSV export of leads, optionally limited to a date range (epoch ms). */
leadsAdminRoutes.get("/export.csv", async (c) => {
  const actor = requireStaff(c, INBOX_ROLES);
  const deps = c.get("deps");
  const { from, to } = parseQuery(c, exportQuery);
  const rows = await deps.db
    .select()
    .from(schema.leads)
    .where(and(gte(schema.leads.createdAt, from), lte(schema.leads.createdAt, to)))
    .orderBy(desc(schema.leads.createdAt))
    .limit(5000);

  const cell = (value: unknown) => {
    let text = Array.isArray(value) ? value.join("|") : String(value ?? "");
    // Neutralise spreadsheet formula injection.
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const header = ["id", "created_at", "status", "name", "email", "company", "services", "budget", "message"];
  const lines = rows.map((r) =>
    [r.id, new Date(r.createdAt).toISOString(), r.status, r.name, r.email, r.company, r.serviceInterest, r.budgetBand, r.message]
      .map(cell)
      .join(","),
  );
  // Exporting personal data is recorded, with how much was taken.
  await writeAudit(deps.db, { actorId: actor.user.id, action: "lead.exported", meta: { rows: rows.length, from, to } }, deps.now());
  return new Response([header.join(","), ...lines].join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="leads.csv"',
    },
  });
});

leadsAdminRoutes.get("/:id", async (c) => {
  requireStaff(c, INBOX_ROLES);
  const db = c.get("deps").db;
  const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, c.req.param("id"))).limit(1);
  if (!lead) throw notFound("Lead not found");
  const notes = await db
    .select()
    .from(schema.leadNotes)
    .where(eq(schema.leadNotes.leadId, lead.id))
    .orderBy(desc(schema.leadNotes.createdAt));
  const { messageHash: _hash, ipHash: _ip, ...safe } = lead;
  return c.json({ ...safe, notes });
});

leadsAdminRoutes.patch("/:id", async (c) => {
  const actor = requireStaff(c, INBOX_ROLES);
  const deps = c.get("deps");
  const { status } = await parseJson(c, updateLeadSchema);
  const id = c.req.param("id");
  const now = deps.now();
  const [lead] = await deps.db.select({ id: schema.leads.id, status: schema.leads.status }).from(schema.leads).where(eq(schema.leads.id, id)).limit(1);
  if (!lead) throw notFound("Lead not found");

  await runBatch(deps.db, [
    deps.db.update(schema.leads).set({ status, updatedAt: now }).where(eq(schema.leads.id, id)),
    auditInsert(deps.db, { actorId: actor.user.id, action: "lead.status_changed", targetType: "lead", targetId: id, meta: { from: lead.status, to: status } }, now),
  ]);
  return c.json({ id, status });
});

leadsAdminRoutes.post("/:id/notes", async (c) => {
  const actor = requireStaff(c, INBOX_ROLES);
  const deps = c.get("deps");
  const { body } = await parseJson(c, leadNoteSchema);
  const leadId = c.req.param("id");
  const [lead] = await deps.db.select({ id: schema.leads.id }).from(schema.leads).where(eq(schema.leads.id, leadId)).limit(1);
  if (!lead) throw notFound("Lead not found");
  const now = deps.now();
  const note = { id: ulid(now), leadId, authorId: actor.user.id, body, createdAt: now };
  await deps.db.insert(schema.leadNotes).values(note);
  return c.json(note, 201);
});
