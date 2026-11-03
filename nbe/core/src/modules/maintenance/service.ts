import { and, eq, inArray, lt, or, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { affectedRows, runBatch, schema, type Db } from "../../db";
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

/** Deletes at most CLEANUP_BATCH_LIMIT matching rows. Postgres has no DELETE ... LIMIT, so the rows are picked by key first. */
function deleteBounded(db: Db, table: PgTable, key: PgColumn, where: SQL | undefined) {
  return db.delete(table).where(inArray(key, db.select({ key }).from(table).where(where).limit(CLEANUP_BATCH_LIMIT)));
}

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

  const sessions = affectedRows(await deleteBounded(db, schema.sessions, schema.sessions.id,
    or(lt(schema.sessions.expiresAt, now), lt(schema.sessions.absoluteExpiresAt, now))));

  const tokens = affectedRows(await deleteBounded(db, schema.authTokens, schema.authTokens.id,
    lt(schema.authTokens.expiresAt, now - RETENTION.usedTokensMs)));

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

  const outbox = affectedRows(await deleteBounded(db, schema.outbox, schema.outbox.id, or(
    and(eq(schema.outbox.state, "sent"), lt(schema.outbox.createdAt, now - RETENTION.sentOutboxMs)),
    and(eq(schema.outbox.state, "dead"), lt(schema.outbox.createdAt, now - RETENTION.deadOutboxMs)),
  )));

  await deleteBounded(db, schema.leadIntakeLocks, schema.leadIntakeLocks.key, lt(schema.leadIntakeLocks.expiresAt, now));

  const limits = affectedRows(await deleteBounded(db, schema.rateLimits, schema.rateLimits.key, lt(schema.rateLimits.expiresAt, now)));

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
