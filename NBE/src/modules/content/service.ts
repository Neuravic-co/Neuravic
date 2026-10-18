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

export async function listContent(db: Db, segment: Segment, now: number, includeUnpublished = false) {
  const kind = KIND_BY_SEGMENT[segment];
  const read = () =>
    db
      .select()
      .from(schema.contentItems)
      .where(and(eq(schema.contentItems.kind, kind), includeUnpublished ? undefined : eq(schema.contentItems.published, true)))
      .orderBy(asc(schema.contentItems.position), asc(schema.contentItems.slug));

  // One query normally. Only when nothing came back do we check whether the table was never seeded.
  let rows = await read();
  if (rows.length === 0) {
    await ensureSeeded(db, now);
    rows = await read();
  }
  return rows.map(toItem);
}

/**
 * Every published item, grouped by section, in ONE query (the home page asks for all of them on each visit).
 * The table-empty check (and seeding) only happens in the rare case that nothing came back.
 */
export async function listAllContent(db: Db, now: number, includeUnpublished = false) {
  const read = () =>
    db
      .select()
      .from(schema.contentItems)
      .orderBy(asc(schema.contentItems.kind), asc(schema.contentItems.position), asc(schema.contentItems.slug));

  let rows = await read();
  if (rows.length === 0) {
    await ensureSeeded(db, now);
    rows = await read();
  }
  const grouped = Object.fromEntries(
    (Object.keys(KIND_BY_SEGMENT) as Segment[]).map((segment) => [segment, [] as ReturnType<typeof toItem>[]]),
  ) as Record<Segment, ReturnType<typeof toItem>[]>;
  const segmentOfKind = Object.fromEntries(Object.entries(KIND_BY_SEGMENT).map(([segment, kind]) => [kind, segment])) as Record<string, Segment>;
  for (const row of rows) {
    if (!includeUnpublished && !row.published) continue;
    const segment = segmentOfKind[row.kind];
    if (segment) grouped[segment].push(toItem(row));
  }
  return grouped;
}
