import type { Config } from "../../config";
import { DeliveryError, requireDeliverySuccess } from "../../core/errors";
import type { Logger } from "../../core/logger";
import type { EmailMessage, Mailer } from "../mail/mailer";
import type { Completion, OutboxJob, OutboxRepository } from "./repository";

export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 12 * 3_600_000];
const LEASE_MS = 2 * 60_000;
const IDEMPOTENCY_WINDOW_MS = 23 * 3_600_000;
const BATCH_SIZE = 20;
const CONCURRENCY = 5;

type Outcome = "sent" | "failed" | "skipped";

export interface DispatcherDeps {
  repository: OutboxRepository;
  mailer: Mailer;
  http: typeof fetch;
  config: Config;
  log: Logger;
  now: () => number;
}

export class OutboxDispatcher {
  constructor(private readonly deps: DispatcherDeps) {}

  async drain(): Promise<{ sent: number; failed: number }> {
    const { repository, config, now } = this.deps;
    const totals = { sent: 0, failed: 0 };
    if (config.maintenanceMode) return totals;

    const start = now();
    const jobs = await repository.claimDue(start, start + LEASE_MS, BATCH_SIZE);
    for (let i = 0; i < jobs.length; i += CONCURRENCY) {
      const outcomes = await Promise.all(jobs.slice(i, i + CONCURRENCY).map((job) => this.process(job, start + LEASE_MS)));
      for (const outcome of outcomes) if (outcome !== "skipped") totals[outcome] += 1;
    }
    return totals;
  }

  private async process(job: OutboxJob, lease: number): Promise<Outcome> {
    const { repository, log, now } = this.deps;
    const expiresAt = job.createdAt + IDEMPOTENCY_WINDOW_MS;
    try {
      if (now() >= expiresAt) {
        log.warn("outbox_delivery_expired", { jobId: job.id, topic: job.topic });
        const owned = await repository.complete(job.id, lease, { state: "dead", lastError: "delivery_expired", payload: {} });
        return owned ? "failed" : "skipped";
      }
      const receipt = await this.deliver(job);
      const owned = await repository.complete(job.id, lease, {
        state: "sent",
        lastError: null,
        provider: receipt?.provider ?? null,
        providerMessageId: receipt?.messageId ?? null,
        acceptedAt: now(),
        payload: {},
      });
      return owned ? "sent" : "skipped";
    } catch (error) {
      return this.recordFailure(job, lease, expiresAt, error);
    }
  }

  private async recordFailure(job: OutboxJob, lease: number, expiresAt: number, error: unknown): Promise<Outcome> {
    const { repository, log, now } = this.deps;
    const attempts = job.attempts + 1;
    const delay = RETRY_DELAYS_MS[attempts - 1];
    const permanent = error instanceof DeliveryError && !error.retryable;
    const lastError = error instanceof DeliveryError ? error.code : "delivery_failed";
    const terminal = permanent || delay === undefined || now() + delay >= expiresAt;
    const changes: Completion =
      terminal || delay === undefined
        ? { state: "dead", attempts, lastError, payload: {} }
        : { attempts, lastError, nextAttemptAt: Math.min(expiresAt, now() + delay + Math.floor(Math.random() * delay * 0.2)) };
    try {
      if (!(await repository.complete(job.id, lease, changes))) return "skipped";
      log.warn("outbox_delivery_failed", { jobId: job.id, topic: job.topic, attempts, terminal });
    } catch {
      log.error("outbox_processing_failed", { jobId: job.id });
    }
    return "failed";
  }

  private async deliver(job: OutboxJob) {
    const { mailer, http, config } = this.deps;
    if (job.topic === "email") {
      return mailer.send(job.payload as unknown as EmailMessage, { idempotencyKey: `outbox/${job.id}` });
    }
    if (!config.slackWebhookUrl) return undefined;
    const response = await http(config.slackWebhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: String(job.payload.text ?? "") }),
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
    });
    await response.body?.cancel();
    requireDeliverySuccess(response, "slack");
    return undefined;
  }
}
