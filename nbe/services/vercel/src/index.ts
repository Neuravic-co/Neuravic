import { getRequestListener } from "@hono/node-server";
import { waitUntil } from "@vercel/functions";
import { createBackend } from "./app";

export default getRequestListener(createBackend({ waitUntil }).fetch);
