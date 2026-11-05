import type { Logger } from "../../core/logger";
import type { LeadRepository } from "../leads/repository";
import type { OutboxRepository } from "../outbox/repository";
import type { DbRateLimiter } from "../rate-limit/limiter";

const DAY_MS = 24 * 3_600_000;
const BATCH_LIMIT = 500;

export const RETENTION = {
  spamLeadsMs: 90 * DAY_MS,
  sentOutboxMs: 30 * DAY_MS,
  deadOutboxMs: 90 * DAY_MS,
};

export interface MaintenanceReport {
  leadsRemoved: number;
  outboxRemoved: number;
  rateLimitsRemoved: number;
}

export class MaintenanceService {
  constructor(
    private readonly deps: {
      leads: LeadRepository;
      outbox: OutboxRepository;
      limiter: Pick<DbRateLimiter, "prune">;
      log: Logger;
      now: () => number;
    },
  ) {}

  async run(): Promise<MaintenanceReport> {
    const { leads, outbox, limiter, log, now: clock } = this.deps;
    const now = clock();
    const [leadsRemoved, sent, dead, rateLimitsRemoved] = await Promise.all([
      leads.pruneSpam(now - RETENTION.spamLeadsMs, BATCH_LIMIT),
      outbox.prune("sent", now - RETENTION.sentOutboxMs, BATCH_LIMIT),
      outbox.prune("dead", now - RETENTION.deadOutboxMs, BATCH_LIMIT),
      limiter.prune(now, BATCH_LIMIT),
    ]);
    const report = { leadsRemoved, outboxRemoved: sent + dead, rateLimitsRemoved };
    log.info("maintenance_completed", report);
    return report;
  }
}
