import { and, asc, eq, lte } from "drizzle-orm";
import { affectedRows, schema, type Db } from "../../db";
import type { Deps } from "../../deps";
import { ulid } from "../../lib/ids";
import { DeliveryError, requireDeliverySuccess } from "../../lib/delivery";
import type { EmailMessage } from "./mailer";

/** Delay before retry n (1-based). After the last entry the job is marked dead. */
export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 12 * 3_600_000];
const CLAIM_LEASE_MS = 2 * 60_000;
const BATCH_SIZE = 20;
const CONCURRENCY = 5;

/** Builds (does not run) an email job insert so callers can add it to an atomic batch. */
export function emailJob(db: Db, now: number, message: EmailMessage, expiresAt?: number) {
  return db.insert(schema.outbox).values({
    id: ulid(now),
    topic: "email",
    payload: { ...message, ...(expiresAt ? { expiresAt } : {}) },
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

async function deliver(deps: Deps, job: OutboxJob) {
  const { topic, payload } = job;
  if (topic === "email") {
    await deps.mailer.send(payload as unknown as EmailMessage, { idempotencyKey: `outbox/${job.id}` });
    return;
  }
  const url = deps.config.slackWebhookUrl;
  if (!url) return; // Slack is optional; treat as delivered.
  const res = await deps.http(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: String(payload.text ?? "") }),
    signal: AbortSignal.timeout(10_000),
    redirect: "error",
  });
  requireDeliverySuccess(res, "slack");
  await res.body?.cancel();
}

type OutboxJob = typeof schema.outbox.$inferSelect;
type JobResult = "sent" | "failed" | "skipped";

/** Claims one job with a short lease, delivers it, and records the outcome. */
async function processJob(deps: Deps, job: OutboxJob): Promise<JobResult> {
  const { db } = deps;
  const now = deps.now();
  const leaseUntil = now + CLAIM_LEASE_MS;
  const claimed = await db
    .update(schema.outbox)
    .set({ nextAttemptAt: leaseUntil })
    .where(
      and(
        eq(schema.outbox.id, job.id),
        eq(schema.outbox.state, "pending"),
        eq(schema.outbox.nextAttemptAt, job.nextAttemptAt),
      ),
    );
  if (affectedRows(claimed) === 0) return "skipped"; // another drain took it

  const ownsLease = and(eq(schema.outbox.id, job.id), eq(schema.outbox.state, "pending"), eq(schema.outbox.nextAttemptAt, leaseUntil));
  // Keep retries inside the provider's 24-hour idempotency window; magic links expire sooner.
  const expiresAt = typeof job.payload.expiresAt === "number" ? job.payload.expiresAt : job.createdAt + 23 * 3_600_000;
  if (expiresAt <= now) {
    await db.update(schema.outbox).set({ state: "dead", payload: {}, lastError: "delivery_expired" }).where(ownsLease);
    return "failed";
  }

  try {
    await deliver(deps, job);
    await db.update(schema.outbox).set({ state: "sent", payload: {}, lastError: null }).where(ownsLease);
    return "sent";
  } catch (error) {
    const attempts = job.attempts + 1;
    const delay = RETRY_DELAYS_MS[attempts - 1];
    const permanent = error instanceof DeliveryError && !error.retryable;
    const dead = permanent || delay === undefined;
    // Positive jitter preserves the minimum delay and spreads a provider outage across workers.
    // Retry timing is not secret material; ordinary scheduling randomness is appropriate here.
    const jitter = delay === undefined ? 0 : Math.floor(Math.random() * delay * 0.2);
    await db
      .update(schema.outbox)
      .set({
        attempts,
        state: dead ? "dead" : "pending",
        nextAttemptAt: deps.now() + (delay ?? 0) + jitter,
        lastError: error instanceof DeliveryError ? error.code : "delivery_failed",
        ...(dead ? { payload: {} } : {}),
      })
      .where(ownsLease);
    deps.log.warn("outbox_delivery_failed", { jobId: job.id, topic: job.topic, attempts });
    return "failed";
  }
}

/**
 * Sends due jobs, a few at a time. Each job is claimed with a short lease first
 * to prevent overlapping sends within the lease. Resend additionally deduplicates retries by job ID;
 * Slack webhooks offer no equivalent, so a crash after acceptance can still duplicate a Slack alert.
 */
export async function drainOutbox(deps: Deps): Promise<{ sent: number; failed: number }> {
  const now = deps.now();
  const due = await deps.db
    .select()
    .from(schema.outbox)
    .where(and(eq(schema.outbox.state, "pending"), lte(schema.outbox.nextAttemptAt, now)))
    .orderBy(asc(schema.outbox.nextAttemptAt))
    .limit(BATCH_SIZE);

  const totals = { sent: 0, failed: 0 };
  for (let i = 0; i < due.length; i += CONCURRENCY) {
    const results = await Promise.all(due.slice(i, i + CONCURRENCY).map((job) => processJob(deps, job)));
    for (const result of results) if (result !== "skipped") totals[result] += 1;
  }
  return totals;
}
