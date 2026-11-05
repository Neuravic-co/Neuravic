import { Hono } from "hono";
import { unprocessable } from "../../core/errors";
import { clientIp, parseJson, type AppEnv } from "../../core/http";
import type { Container } from "../../container";
import { rateLimit } from "../rate-limit/middleware";
import { createLeadSchema } from "./schema";

export function leadsRoutes({ config, services, rateLimiter, now }: Container) {
  const routes = new Hono<AppEnv>();

  routes.post("/", rateLimit({ config, limiter: rateLimiter, now }, { name: "leads", limit: 5, windowSeconds: 300 }), async (c) => {
    const input = await parseJson(c, createLeadSchema);
    const ip = clientIp(c, config.proxySecret);
    if (!(await services.botCheck.verify(input.turnstileToken, ip))) {
      throw unprocessable("The verification check failed. Please try again.");
    }
    return c.json(await services.leads.create(input, ip), 202);
  });

  return routes;
}
