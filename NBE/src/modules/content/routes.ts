import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "../../app";
import { runBatch, schema } from "../../db";
import { notFound } from "../../lib/errors";
import { ulid } from "../../lib/ids";
import { parseJson } from "../../lib/validate";
import { auditInsert } from "../audit/audit";
import { requireStaff } from "../auth/middleware";
import { contentDataSchemas, KIND_BY_SEGMENT, slugParam, upsertContentSchema, type Segment } from "./schemas";
import { ensureSeeded, listAllContent, listContent } from "./service";

/** Public site content (services, projects, process, team, company). */
export const contentRoutes = new Hono<AppEnv>();
const CACHE = "public, max-age=60, s-maxage=300, stale-while-revalidate=600";

function segmentOf(value: string): Segment {
  if (!(value in KIND_BY_SEGMENT)) throw notFound("Unknown content type");
  return value as Segment;
}

/** Everything the home page needs in one request. */
contentRoutes.get("/", async (c) => {
  const deps = c.get("deps");
  const content = await listAllContent(deps.db, deps.now());
  c.header("cache-control", CACHE);
  return c.json(content);
});

contentRoutes.get("/:segment", async (c) => {
  const deps = c.get("deps");
  const segment = segmentOf(c.req.param("segment"));
  c.header("cache-control", CACHE);
  return c.json({ items: await listContent(deps.db, segment, deps.now()) });
});

/** Staff admin editing of site content. Mounted under /admin/content. */
export const contentAdminRoutes = new Hono<AppEnv>();

contentAdminRoutes.get("/:segment", async (c) => {
  requireStaff(c, ["admin"]);
  const deps = c.get("deps");
  const segment = segmentOf(c.req.param("segment"));
  return c.json({ items: await listContent(deps.db, segment, deps.now(), true) });
});

contentAdminRoutes.put("/:segment/:slug", async (c) => {
  const actor = requireStaff(c, ["admin"]);
  const deps = c.get("deps");
  const segment = segmentOf(c.req.param("segment"));
  const kind = KIND_BY_SEGMENT[segment];
  const slug = slugParam.parse(c.req.param("slug"));
  const input = await parseJson(c, upsertContentSchema);
  const data = contentDataSchemas[kind].parse(input.data);
  const now = deps.now();
  await ensureSeeded(deps.db, now); // never leave a half-seeded table behind

  await runBatch(deps.db, [
    deps.db
      .insert(schema.contentItems)
      .values({ id: ulid(now), kind, slug, position: input.position, data, published: input.published, updatedAt: now })
      .onConflictDoUpdate({
        target: [schema.contentItems.kind, schema.contentItems.slug],
        set: { position: input.position, data, published: input.published, updatedAt: now },
      }),
    auditInsert(deps.db, { actorId: actor.user.id, action: "content.upserted", targetType: kind, targetId: slug }, now),
  ]);
  return c.json({ kind, slug, position: input.position, published: input.published, ...data });
});

contentAdminRoutes.delete("/:segment/:slug", async (c) => {
  const actor = requireStaff(c, ["admin"]);
  const deps = c.get("deps");
  const kind = KIND_BY_SEGMENT[segmentOf(c.req.param("segment"))];
  const slug = slugParam.parse(c.req.param("slug"));
  await ensureSeeded(deps.db, deps.now());
  const removed = await deps.db
    .delete(schema.contentItems)
    .where(and(eq(schema.contentItems.kind, kind), eq(schema.contentItems.slug, slug)))
    .returning({ id: schema.contentItems.id });
  if (removed.length === 0) throw notFound("Content item not found");
  await auditInsert(deps.db, { actorId: actor.user.id, action: "content.deleted", targetType: kind, targetId: slug }, deps.now());
  return c.body(null, 204);
});
