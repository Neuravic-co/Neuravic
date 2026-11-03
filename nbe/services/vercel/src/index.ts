import { getRequestListener } from "@hono/node-server";
import { waitUntil } from "@vercel/functions";
import { createBackend } from "./app";

/** The Vercel function entry: Node's request listener around the one-process backend. */
export default getRequestListener(createBackend({ waitUntil }).fetch);
