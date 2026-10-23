import { getRequestListener } from "@hono/node-server";
import { Hono } from "hono";
import { app, maintenance } from "./vercel";

/** The Vercel function: the API app, plus the cron-only maintenance endpoint. */
const entry = new Hono();
entry.all("/internal/maintenance", (c) => maintenance(c.req.raw));
entry.mount("/", app.fetch);

export default getRequestListener(entry.fetch);
