import { and, eq, inArray, lt, or } from "drizzle-orm";
import { schema } from "../../db";
import type { Deps } from "../../deps";
import { drainOutbox } from "../notifications/outbox";

const DAY = 24 * 3_600_000;

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
}

/** Runs on the cron trigger (every 5 minutes): retries, housekeeping and retention. */
export async function runMaintenance(deps: Deps): Promise<MaintenanceReport> {
  const { db } = deps;
  const now = deps.now();

  const { sent } = await drainOutbox(deps);

  const sessions = await db
    .delete(schema.sessions)
    .where(or(lt(schema.sessions.expiresAt, now), lt(schema.sessions.absoluteExpiresAt, now)))
    .returning({ id: schema.sessions.id });

  const tokens = await db
    .delete(schema.authTokens)
    .where(lt(schema.authTokens.expiresAt, now - RETENTION.usedTokensMs))
    .returning({ id: schema.authTokens.id });

  const staleLeads = await db
    .select({ id: schema.leads.id })
    .from(schema.leads)
    .where(
      or(
        and(eq(schema.leads.status, "spam"), lt(schema.leads.createdAt, now - RETENTION.spamLeadsMs)),
        and(eq(schema.leads.status, "lost"), lt(schema.leads.updatedAt, now - RETENTION.lostLeadsMs)),
      ),
    );
  const staleIds = staleLeads.map((lead) => lead.id);
  for (let i = 0; i < staleIds.length; i += 50) {
    const chunk = staleIds.slice(i, i + 50);
    await db.delete(schema.leadNotes).where(inArray(schema.leadNotes.leadId, chunk));
    await db.delete(schema.leads).where(inArray(schema.leads.id, chunk));
  }

  const outbox = await db
    .delete(schema.outbox)
    .where(
      or(
        and(eq(schema.outbox.state, "sent"), lt(schema.outbox.createdAt, now - RETENTION.sentOutboxMs)),
        and(eq(schema.outbox.state, "dead"), lt(schema.outbox.createdAt, now - RETENTION.deadOutboxMs)),
      ),
    )
    .returning({ id: schema.outbox.id });

  const report = {
    emailsSent: sent,
    sessionsRemoved: sessions.length,
    tokensRemoved: tokens.length,
    leadsRemoved: staleIds.length,
    outboxRemoved: outbox.length,
  };
  deps.log.info("maintenance_completed", report);
  return report;
}
