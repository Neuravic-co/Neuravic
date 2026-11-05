import { loadConfig, type Config } from "./config";
import { jsonLogger, type Logger } from "./core/logger";
import { createDatabase, type Db } from "./db/client";
import { LeadRepository } from "./modules/leads/repository";
import { LeadService } from "./modules/leads/service";
import { TurnstileBotCheck, type BotCheck } from "./modules/leads/turnstile";
import type { DevMailer } from "./modules/mail/local";
import type { Mailer } from "./modules/mail/mailer";
import { selectMailer } from "./modules/mail/select";
import { MaintenanceService } from "./modules/maintenance/service";
import { OutboxDispatcher } from "./modules/outbox/dispatcher";
import { OutboxRepository } from "./modules/outbox/repository";
import { DbRateLimiter, type RateLimiter } from "./modules/rate-limit/limiter";

export interface Container {
  config: Config;
  log: Logger;
  now: () => number;
  rateLimiter: RateLimiter;
  devMailbox: DevMailer | null;
  services: {
    leads: LeadService;
    botCheck: BotCheck;
    outbox: OutboxDispatcher;
    maintenance: MaintenanceService;
  };
  close(): Promise<void>;
}

export interface ContainerOptions {
  env: Record<string, string | undefined>;
  defer?: (task: Promise<unknown>) => void;
  overrides?: {
    db?: Db;
    mailer?: Mailer;
    http?: typeof fetch;
    now?: () => number;
    rateLimiter?: RateLimiter;
    botCheck?: BotCheck;
    log?: Logger;
  };
}

export function createContainer({ env, defer, overrides = {} }: ContainerOptions): Container {
  const config = loadConfig(env);
  const log = overrides.log ?? jsonLogger;
  const now = overrides.now ?? Date.now;
  const http = overrides.http ?? fetch;

  const database = overrides.db ? null : createDatabase({ url: config.databaseUrl, poolSize: config.dbPoolSize, caCert: config.databaseCaCert });
  const db = overrides.db ?? database!.db;
  const selected = selectMailer(config, log);
  const mailer = overrides.mailer ?? selected.mailer;

  const leadRepository = new LeadRepository(db);
  const outboxRepository = new OutboxRepository(db);
  const dbLimiter = new DbRateLimiter(db);
  const outbox = new OutboxDispatcher({ repository: outboxRepository, mailer, http, config, log, now });

  const background = (task: () => Promise<unknown>) => {
    const running = task().catch(() => log.error("background_task_failed"));
    if (defer) defer(running);
  };

  return {
    config,
    log,
    now,
    rateLimiter: overrides.rateLimiter ?? dbLimiter,
    devMailbox: overrides.mailer ? null : selected.devMailbox,
    services: {
      outbox,
      botCheck: overrides.botCheck ?? new TurnstileBotCheck(config, http, log),
      leads: new LeadService({
        db,
        leads: leadRepository,
        outbox: outboxRepository,
        config,
        log,
        now,
        afterCommit: background,
        deliverQueued: () => outbox.drain(),
      }),
      maintenance: new MaintenanceService({ leads: leadRepository, outbox: outboxRepository, limiter: dbLimiter, log, now }),
    },
    close: async () => {
      await database?.close();
    },
  };
}
