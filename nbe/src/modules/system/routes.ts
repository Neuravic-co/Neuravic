import { Hono } from "hono";
import { safeEqual } from "../../core/crypto";
import type { AppEnv } from "../../core/http";
import type { Container } from "../../container";

export function systemRoutes({ config, devMailbox }: Container) {
  const routes = new Hono<AppEnv>();

  routes.get("/health", (c) => c.json({ status: config.maintenanceMode ? "maintenance" : "ok" }));
  routes.get("/version", (c) => c.json({ version: config.version }));

  if (devMailbox) {
    routes.get("/dev/mailbox", (c) => c.json({ messages: devMailbox.inbox }));
    routes.delete("/dev/mailbox", (c) => {
      devMailbox.inbox.length = 0;
      return c.body(null, 204);
    });
  }

  return routes;
}

export function cronRoutes({ config, services, now, log }: Container) {
  const routes = new Hono<AppEnv>();

  routes.on(["GET", "POST"], "/cron", async (c) => {
    const bearer = (c.req.header("authorization") ?? "").replace(/^Bearer /i, "");
    if (!config.cronSecret || !safeEqual(bearer, config.cronSecret)) {
      return c.json({ type: "about:blank", title: "Unauthorized", status: 401, code: "unauthorized" }, 401, {
        "content-type": "application/problem+json",
      });
    }
    const outbox = await services.outbox.drain();
    const maintenance = new Date(now()).getUTCMinutes() % 5 === 0 ? await services.maintenance.run() : null;
    log.info("cron_completed", { ...outbox, maintenance: maintenance ? "ran" : "skipped" });
    return c.json({ outbox, maintenance: maintenance ? "ran" : "skipped" });
  });

  return routes;
}
