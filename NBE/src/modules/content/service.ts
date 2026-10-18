import { and, asc, eq } from "drizzle-orm";
import { schema, type Db } from "../../db";
import { ulid } from "../../lib/ids";
import { DEFAULT_CONTENT } from "./defaults";
import { KIND_BY_SEGMENT, type Segment } from "./schemas";

type Row = typeof schema.contentItems.$inferSelect;

/** Inserts the default site content the first time it is requested. */
export async function ensureSeeded(db: Db, now: number): Promise<void> {
  const [any] = await db.select({ id: schema.contentItems.id }).from(schema.contentItems).limit(1);
  if (any) return;
  await db
    .insert(schema.contentItems)
    .values(DEFAULT_CONTENT.map((item) => ({ id: ulid(now), ...item, published: true, updatedAt: now })))
    .onConflictDoNothing();
}

export const toItem = (row: Row) => ({ slug: row.slug, position: row.position, published: row.published, ...row.data });

export async function listContent(db: Db, segment: Segment, includeUnpublished = false) {
  const kind = KIND_BY_SEGMENT[segment];
  const rows = await db
    .select()
    .from(schema.contentItems)
    .where(and(eq(schema.contentItems.kind, kind), includeUnpublished ? undefined : eq(schema.contentItems.published, true)))
    .orderBy(asc(schema.contentItems.position), asc(schema.contentItems.slug));
  return rows.map(toItem);
}
