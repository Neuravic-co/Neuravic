import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { createContainer } from "./container";

const MAINTENANCE_INTERVAL_MS = 5 * 60_000;

const container = createContainer({ env: process.env });
const { config, log, services } = container;

const server = serve({ fetch: createApp(container).fetch, port: config.port, hostname: config.host }, (info) => {
  log.info("service_started", { url: `http://${info.address}:${info.port}`, environment: config.environment });
  if (container.devMailbox) log.info("dev_mailbox", { url: `http://${info.address}:${info.port}/api/v1/dev/mailbox` });
});

const timers = [
  setInterval(() => void services.outbox.drain().catch(() => log.error("outbox_timer_failed")), config.outboxPollMs),
  setInterval(() => void services.maintenance.run().catch(() => log.error("maintenance_timer_failed")), MAINTENANCE_INTERVAL_MS),
];

async function shutdown() {
  timers.forEach(clearInterval);
  server.close();
  await container.close().catch(() => undefined);
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
