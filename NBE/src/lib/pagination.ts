import { and, eq, lt, or, type SQL } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { z } from "zod";
import { fromBase64Url, toBase64Url } from "./crypto";
import { badRequest } from "./errors";

export const pageQuery = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

interface Cursor {
  t: number;
  id: string;
}

export function encodeCursor(row: { createdAt: number; id: string }): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify({ t: row.createdAt, id: row.id })));
}

function decodeCursor(cursor: string): Cursor {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(fromBase64Url(cursor))) as Cursor;
    if (typeof parsed.t !== "number" || typeof parsed.id !== "string") throw new Error("shape");
    return parsed;
  } catch {
    throw badRequest("Invalid cursor");
  }
}

/** WHERE fragment for "rows strictly older than the cursor" when ordering by (createdAt desc, id desc). */
export function olderThan(
  createdAt: SQLiteColumn,
  id: SQLiteColumn,
  cursor: string | undefined,
): SQL | undefined {
  if (!cursor) return undefined;
  const { t, id: lastId } = decodeCursor(cursor);
  return or(lt(createdAt, t), and(eq(createdAt, t), lt(id, lastId)));
}

/** Trims the extra probe row and builds the response envelope. */
export function toPage<T extends { createdAt: number; id: string }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return { items, nextCursor: hasMore && last ? encodeCursor(last) : null };
}
