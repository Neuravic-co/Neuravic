import { and, asc, eq, inArray, lt, lte } from "drizzle-orm";
import { schema, type Db, type Executor } from "../../db/client";
import { ulid } from "../../core/ids";
import type { EmailMessage } from "../mail/mailer";

const { outbox } = schema;

export type OutboxJob = typeof outbox.$inferSelect;

export type NewJob =
  | { topic: "email"; message: EmailMessage; leadId?: string; kind?: "team" | "acknowledgement" }
  | { topic: "slack"; text: string };

export interface Completion {
  state?: "sent" | "dead";
  attempts?: number;
  nextAttemptAt?: number;
  lastError?: string | null;
  provider?: string | null;
  providerMessageId?: string | null;
  acceptedAt?: number | null;
  payload?: Record<string, unknown>;
}

export class OutboxRepository {
  constructor(private readonly db: Db) {}

  async enqueue(executor: Executor, jobs: NewJob[], now: number): Promise<void> {
    if (jobs.length === 0) return;
    await executor.insert(outbox).values(
      jobs.map((job) => ({
        id: ulid(now),
        topic: job.topic,
        payload: job.topic === "email" ? { ...job.message } : { text: job.text },
        leadId: job.topic === "email" ? job.leadId : undefined,
        notificationKind: job.topic === "email" ? job.kind : undefined,
        nextAttemptAt: now,
        createdAt: now,
      })),
    );
  }

  claimDue(now: number, leaseUntil: number, limit: number): Promise<OutboxJob[]> {
    const due = this.db
      .select({ id: outbox.id })
      .from(outbox)
      .where(and(eq(outbox.state, "pending"), lte(outbox.nextAttemptAt, now)))
      .orderBy(asc(outbox.nextAttemptAt))
      .limit(limit)
      .for("update", { skipLocked: true });
    return this.db.update(outbox).set({ nextAttemptAt: leaseUntil }).where(inArray(outbox.id, due)).returning();
  }

  async complete(id: string, leaseUntil: number, changes: Completion): Promise<boolean> {
    const updated = await this.db
      .update(outbox)
      .set(changes)
      .where(and(eq(outbox.id, id), eq(outbox.state, "pending"), eq(outbox.nextAttemptAt, leaseUntil)))
      .returning({ id: outbox.id });
    return updated.length > 0;
  }

  async prune(state: "sent" | "dead", olderThan: number, limit: number): Promise<number> {
    const stale = this.db
      .select({ id: outbox.id })
      .from(outbox)
      .where(and(eq(outbox.state, state), lt(outbox.createdAt, olderThan)))
      .limit(limit);
    const removed = await this.db.delete(outbox).where(inArray(outbox.id, stale)).returning({ id: outbox.id });
    return removed.length;
  }
}
