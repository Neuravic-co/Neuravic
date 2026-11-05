import { and, eq, inArray, lt } from "drizzle-orm";
import { schema, type Db, type Executor } from "../../db/client";

export type NewLead = typeof schema.leads.$inferInsert;

export class LeadRepository {
  constructor(private readonly db: Db) {}

  async insertIfNew(executor: Executor, lead: NewLead): Promise<boolean> {
    const inserted = await executor
      .insert(schema.leads)
      .values(lead)
      .onConflictDoNothing({ target: schema.leads.dedupeKey })
      .returning({ id: schema.leads.id });
    return inserted.length > 0;
  }

  async idByDedupeKey(dedupeKey: string): Promise<string | undefined> {
    const [row] = await this.db.select({ id: schema.leads.id }).from(schema.leads).where(eq(schema.leads.dedupeKey, dedupeKey)).limit(1);
    return row?.id;
  }

  async pruneSpam(olderThan: number, limit: number): Promise<number> {
    const stale = this.db
      .select({ id: schema.leads.id })
      .from(schema.leads)
      .where(and(eq(schema.leads.status, "spam"), lt(schema.leads.createdAt, olderThan)))
      .limit(limit);
    const removed = await this.db.delete(schema.leads).where(inArray(schema.leads.id, stale)).returning({ id: schema.leads.id });
    return removed.length;
  }
}
