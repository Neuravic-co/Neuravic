import { Hono } from "hono";
import type { AppEnv } from "../../app";
import { contentAdminRoutes } from "../content/routes";

/** Staff-only management API. Each sub-router enforces its own staff role. */
export const adminRoutes = new Hono<AppEnv>();

adminRoutes.route("/content", contentAdminRoutes);
