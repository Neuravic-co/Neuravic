import { and, eq, inArray, lt, or } from "drizzle-orm";
import { affectedRows, runBatch, schema } from "../../db";
import type { Deps } from "../../deps";
import { drainOutbox } from "../notifications/outbox";
import { scanPendingFiles } from "../files/scanner";

const DAY = 24 * 3_600_000;
export const CLEANUP_BATCH_LIMIT = 500;

/** Retention windows. Keep in sync with the privacy notice. */
export const RETENTION = {
  spamLeadsMs: 90 * DAY,
  lostLeadsMs: 365 * DAY,
  sentOutboxMs: 30 * DAY,
  deadOutboxMs: 90 * DAY,
  usedTokensMs: DAY,
};

export interface MaintenanceReport {
  emailsSent: number;
  sessionsRemoved: number;
  tokensRemoved: number;
  leadsRemoved: number;
  outboxRemoved: number;
  rateLimitsRemoved: number;
}

/** Runs on the cron trigger (every 5 minutes): retries, housekeeping and retention. */
export async function runMaintenance(deps: Deps): Promise<MaintenanceReport> {
  if (deps.config.maintenanceMode) {
    deps.log.info("maintenance_paused");
    return { emailsSent: 0, sessionsRemoved: 0, tokensRemoved: 0, leadsRemoved: 0, outboxRemoved: 0, rateLimitsRemoved: 0 };
  }
  const { db } = deps;
  const now = deps.now();

  const { sent } = await drainOutbox(deps);
  await scanPendingFiles(deps);

  // MySQL can delete a bounded batch directly (DELETE ... LIMIT); the rows are chosen by their index.
  const sessions = affectedRows(await db
    .delete(schema.sessions)
    .where(or(lt(schema.sessions.expiresAt, now), lt(schema.sessions.absoluteExpiresAt, now)))
    .limit(CLEANUP_BATCH_LIMIT));

  const tokens = affectedRows(await db
    .delete(schema.authTokens)
    .where(lt(schema.authTokens.expiresAt, now - RETENTION.usedTokensMs))
    .limit(CLEANUP_BATCH_LIMIT));

  const staleLead = or(
    and(eq(schema.leads.status, "spam"), lt(schema.leads.createdAt, now - RETENTION.spamLeadsMs)),
    and(eq(schema.leads.status, "lost"), lt(schema.leads.updatedAt, now - RETENTION.lostLeadsMs)),
  );
  const staleLeads = await db
    .select({ id: schema.leads.id })
    .from(schema.leads)
    .where(staleLead).limit(CLEANUP_BATCH_LIMIT);
  const staleIds = staleLeads.map((lead) => lead.id);
  let leadsRemoved = 0;
  for (let i = 0; i < staleIds.length; i += 50) {
    const chunk = staleIds.slice(i, i + 50);
    const stillStale = db.select({ id: schema.leads.id }).from(schema.leads).where(and(inArray(schema.leads.id, chunk), staleLead));
    const [, removed] = await runBatch(db, [
      db.delete(schema.leadNotes).where(inArray(schema.leadNotes.leadId, stillStale)),
      db.delete(schema.leads).where(and(inArray(schema.leads.id, chunk), staleLead)),
    ]);
    leadsRemoved += removed?.affectedRows ?? 0;
  }

  const outbox = affectedRows(await db
    .delete(schema.outbox)
    .where(or(
      and(eq(schema.outbox.state, "sent"), lt(schema.outbox.createdAt, now - RETENTION.sentOutboxMs)),
      and(eq(schema.outbox.state, "dead"), lt(schema.outbox.createdAt, now - RETENTION.deadOutboxMs)),
    ))
    .limit(CLEANUP_BATCH_LIMIT));

  await db.delete(schema.leadIntakeLocks).where(lt(schema.leadIntakeLocks.expiresAt, now)).limit(CLEANUP_BATCH_LIMIT);

  const limits = affectedRows(await db
    .delete(schema.rateLimits)
    .where(lt(schema.rateLimits.expiresAt, now))
    .limit(CLEANUP_BATCH_LIMIT));

  const report = {
    emailsSent: sent,
    sessionsRemoved: sessions,
    tokensRemoved: tokens,
    leadsRemoved,
    outboxRemoved: outbox,
    rateLimitsRemoved: limits,
  };
  deps.log.info("maintenance_completed", report);
  return report;
}
