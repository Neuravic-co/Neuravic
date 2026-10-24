import { startService } from "@neuravic/core/bootstrap";
import { drainOutbox } from "@neuravic/core/modules/notifications/outbox";
import { runMaintenance } from "@neuravic/core/modules/maintenance/service";

const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 2000);

/**
 * Background work, with no public routes of its own: sends queued email (the only service that does),
 * and every 5 minutes retries failures, cleans up expired data and applies the retention rules.
 * In development it also serves the dev mailbox at /api/v1/dev/mailbox.
 */
startService({
  name: "worker",
  defaultPort: 8806,
  deliversMail: true,
  mount() {},
  timers: [
    { everyMs: POLL_MS, run: (deps) => drainOutbox(deps) },
    { everyMs: 5 * 60_000, run: (deps) => runMaintenance(deps) },
  ],
});
