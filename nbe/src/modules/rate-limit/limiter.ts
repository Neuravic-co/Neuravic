import { inArray, lt, sql } from "drizzle-orm";
import { schema, type Db } from "../../db/client";

export interface RateLimiter {
  hit(key: string, limit: number, windowSeconds: number, now: number): Promise<boolean>;
}

const bucketOf = (now: number, windowSeconds: number) => Math.floor(now / 1000 / windowSeconds);

export class DbRateLimiter implements RateLimiter {
  constructor(private readonly db: Db) {}

  async hit(key: string, limit: number, windowSeconds: number, now: number): Promise<boolean> {
    const bucket = bucketOf(now, windowSeconds);
    const [row] = await this.db
      .insert(schema.rateLimits)
      .values({ key: `${key}:${bucket}`, count: 1, expiresAt: (bucket + 1) * windowSeconds * 1000 })
      .onConflictDoUpdate({ target: schema.rateLimits.key, set: { count: sql`${schema.rateLimits.count} + 1` } })
      .returning({ count: schema.rateLimits.count });
    return (row?.count ?? 1) <= limit;
  }

  async prune(now: number, limit: number): Promise<number> {
    const stale = this.db
      .select({ key: schema.rateLimits.key })
      .from(schema.rateLimits)
      .where(lt(schema.rateLimits.expiresAt, now))
      .limit(limit);
    const removed = await this.db.delete(schema.rateLimits).where(inArray(schema.rateLimits.key, stale)).returning({ key: schema.rateLimits.key });
    return removed.length;
  }
}

export class MemoryRateLimiter implements RateLimiter {
  private readonly counts = new Map<string, number>();

  async hit(key: string, limit: number, windowSeconds: number, now: number): Promise<boolean> {
    const storageKey = `${key}:${bucketOf(now, windowSeconds)}`;
    const count = (this.counts.get(storageKey) ?? 0) + 1;
    this.counts.set(storageKey, count);
    if (this.counts.size > 10_000) this.counts.clear();
    return count <= limit;
  }
}
