import { and, asc, eq, lte } from "drizzle-orm";
import { schema, type Db } from "../../db";
import type { Deps } from "../../deps";
import { ulid } from "../../lib/ids";
import type { EmailMessage } from "./mailer";

/** Delay before retry n (1-based). After the last entry the job is marked dead. */
export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 12 * 3_600_000];
const CLAIM_LEASE_MS = 2 * 60_000;
const BATCH_SIZE = 20;

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

/**
 * Sends due jobs. Each job is claimed with a short lease first so two
 * concurrent drains never send the same message twice.
 */
export async function drainOutbox(deps: Deps): Promise<{ sent: number; failed: number }> {
  const { db } = deps;
  const now = deps.now();
  const due = await db
    .select()
    .from(schema.outbox)
    .where(and(eq(schema.outbox.state, "pending"), lte(schema.outbox.nextAttemptAt, now)))
    .orderBy(asc(schema.outbox.createdAt))
    .limit(BATCH_SIZE);

  let sent = 0;
  let failed = 0;
  for (const job of due) {
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
    if (claimed.length === 0) continue;

    try {
      await deliver(deps, job.topic, job.payload);
      await db.update(schema.outbox).set({ state: "sent", lastError: null }).where(eq(schema.outbox.id, job.id));
      sent += 1;
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
      failed += 1;
    }
  }
  return { sent, failed };
}
