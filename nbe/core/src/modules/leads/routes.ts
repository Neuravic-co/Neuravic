import { Hono } from "hono";
import type { AppEnv } from "../../app";
import { rateLimit } from "../../lib/rate-limit";
import { clientIp } from "../../lib/request";
import { parseJson } from "../../lib/validate";
import { leadsAdminRoutes } from "./admin";
import { createLeadSchema } from "./schemas";
import { createLead } from "./service";
import { verifyTurnstile } from "./turnstile";
import { unprocessable } from "../../lib/errors";

export const leadsRoutes = new Hono<AppEnv>();

/** Public: used by every "Start a project / Start a conversation" action on the site. */
leadsRoutes.post("/", rateLimit({ name: "leads", limit: 5, windowSeconds: 3600 }), async (c) => {
  const deps = c.get("deps");
  const input = await parseJson(c, createLeadSchema);
  const ip = clientIp(c);

  if (!await verifyTurnstile(deps, input.turnstileToken, ip)) {
    throw unprocessable("The verification check failed. Please try again.");
  }

  const created = await createLead(deps, input, ip);
  return c.json(created, 202);
});

leadsRoutes.route("/", leadsAdminRoutes);
