import { Hono } from "hono";
import type { DevMailer } from "../notifications/mailer";

/**
 * Development mailbox, mounted only when APP_ENV=development and no mail provider is configured.
 * Sign-in links are single use secrets, so this never exists in staging or production.
 * It sends no CORS headers: other websites cannot read it from a browser.
 */
export function devRoutes(mailer: DevMailer) {
  const routes = new Hono();
  routes.get("/mailbox", (c) => c.json({ messages: mailer.inbox }, 200, { "cache-control": "no-store" }));
  routes.delete("/mailbox", (c) => {
    mailer.inbox.length = 0;
    return c.body(null, 204);
  });
  return routes;
}
