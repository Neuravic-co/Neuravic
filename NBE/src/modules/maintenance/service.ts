import { and, eq, inArray, lt, or } from "drizzle-orm";
import { runBatch, schema } from "../../db";
import type { Deps } from "../../deps";
import { drainOutbox } from "../notifications/outbox";

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
  const { db } = deps;
  const now = deps.now();

  const { sent } = await drainOutbox(deps);

  const sessions = await db
    .delete(schema.sessions)
    .where(inArray(schema.sessions.id, db.select({ id: schema.sessions.id }).from(schema.sessions)
      .where(or(lt(schema.sessions.expiresAt, now), lt(schema.sessions.absoluteExpiresAt, now))).limit(CLEANUP_BATCH_LIMIT)))
    .returning({ id: schema.sessions.id });

  const tokens = await db
    .delete(schema.authTokens)
    .where(inArray(schema.authTokens.id, db.select({ id: schema.authTokens.id }).from(schema.authTokens)
      .where(lt(schema.authTokens.expiresAt, now - RETENTION.usedTokensMs)).limit(CLEANUP_BATCH_LIMIT)))
    .returning({ id: schema.authTokens.id });

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
      db.delete(schema.leads).where(and(inArray(schema.leads.id, chunk), staleLead)).returning({ id: schema.leads.id }),
    ]);
    if (Array.isArray(removed)) leadsRemoved += removed.length;
  }

  const outbox = await db
    .delete(schema.outbox)
    .where(inArray(schema.outbox.id, db.select({ id: schema.outbox.id }).from(schema.outbox).where(
      or(
        and(eq(schema.outbox.state, "sent"), lt(schema.outbox.createdAt, now - RETENTION.sentOutboxMs)),
        and(eq(schema.outbox.state, "dead"), lt(schema.outbox.createdAt, now - RETENTION.deadOutboxMs)),
      ),
    ).limit(CLEANUP_BATCH_LIMIT)))
    .returning({ id: schema.outbox.id });

  const limits = await db
    .delete(schema.rateLimits)
    .where(inArray(schema.rateLimits.key, db.select({ key: schema.rateLimits.key }).from(schema.rateLimits)
      .where(lt(schema.rateLimits.expiresAt, now)).limit(CLEANUP_BATCH_LIMIT)))
    .returning({ key: schema.rateLimits.key });

  const report = {
    emailsSent: sent,
    sessionsRemoved: sessions.length,
    tokensRemoved: tokens.length,
    leadsRemoved,
    outboxRemoved: outbox.length,
    rateLimitsRemoved: limits.length,
  };
  deps.log.info("maintenance_completed", report);
  return report;
}
