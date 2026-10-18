import { and, asc, eq, lte } from "drizzle-orm";
import { schema, type Db } from "../../db";
import type { Deps } from "../../deps";
import { ulid } from "../../lib/ids";
import type { EmailMessage } from "./mailer";

/** Delay before retry n (1-based). After the last entry the job is marked dead. */
export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 12 * 3_600_000];
const CLAIM_LEASE_MS = 2 * 60_000;
const BATCH_SIZE = 20;
const CONCURRENCY = 5;

/** Builds (does not run) an email job insert so callers can add it to an atomic batch. */
export function emailJob(db: Db, now: number, message: EmailMessage) {
  return db.insert(schema.outbox).values({
    id: ulid(now),
    topic: "email",
    payload: { ...message },
    nextAttemptAt: now,
    createdAt: now,
  });
}

export function slackJob(db: Db, now: number, text: string) {
  return db.insert(schema.outbox).values({
    id: ulid(now),
    topic: "slack",
    payload: { text },
    nextAttemptAt: now,
    createdAt: now,
  });
}

async function deliver(deps: Deps, topic: "email" | "slack", payload: Record<string, unknown>) {
  if (topic === "email") {
    await deps.mailer.send(payload as unknown as EmailMessage);
    return;
  }
  const url = deps.config.slackWebhookUrl;
  if (!url) return; // Slack is optional; treat as delivered.
  const res = await deps.http(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: String(payload.text ?? "") }),
  });
  if (!res.ok) throw new Error(`Slack responded ${res.status}`);
}

type OutboxJob = typeof schema.outbox.$inferSelect;
type JobResult = "sent" | "failed" | "skipped";

/** Claims one job with a short lease, delivers it, and records the outcome. */
async function processJob(deps: Deps, job: OutboxJob, now: number): Promise<JobResult> {
  const { db } = deps;
  const claimed = await db
    .update(schema.outbox)
    .set({ nextAttemptAt: now + CLAIM_LEASE_MS })
    .where(
      and(
        eq(schema.outbox.id, job.id),
        eq(schema.outbox.state, "pending"),
        eq(schema.outbox.nextAttemptAt, job.nextAttemptAt),
      ),
    )
    .returning({ id: schema.outbox.id });
  if (claimed.length === 0) return "skipped"; // another drain took it

  try {
    await deliver(deps, job.topic, job.payload);
    await db.update(schema.outbox).set({ state: "sent", lastError: null }).where(eq(schema.outbox.id, job.id));
    return "sent";
  } catch (error) {
    const attempts = job.attempts + 1;
    const delay = RETRY_DELAYS_MS[attempts - 1];
    await db
      .update(schema.outbox)
      .set({
        attempts,
        state: delay === undefined ? "dead" : "pending",
        nextAttemptAt: now + (delay ?? 0),
        lastError: error instanceof Error ? error.message.slice(0, 300) : "unknown error",
      })
      .where(eq(schema.outbox.id, job.id));
    deps.log.warn("outbox_delivery_failed", { jobId: job.id, topic: job.topic, attempts });
    return "failed";
  }
}

/**
 * Sends due jobs, a few at a time. Each job is claimed with a short lease first
 * so two concurrent drains never send the same message twice.
 */
export async function drainOutbox(deps: Deps): Promise<{ sent: number; failed: number }> {
  const now = deps.now();
  const due = await deps.db
    .select()
    .from(schema.outbox)
    .where(and(eq(schema.outbox.state, "pending"), lte(schema.outbox.nextAttemptAt, now)))
    .orderBy(asc(schema.outbox.createdAt))
    .limit(BATCH_SIZE);

  const totals = { sent: 0, failed: 0 };
  for (let i = 0; i < due.length; i += CONCURRENCY) {
    const results = await Promise.all(due.slice(i, i + CONCURRENCY).map((job) => processJob(deps, job, now)));
    for (const result of results) if (result !== "skipped") totals[result] += 1;
  }
  return totals;
}
