import type { Context } from "hono";
import type { z } from "zod";
import { AppError, badRequest } from "./errors";

const JSON_CONTENT_TYPE = /^application\/(?:[\w.+-]+\+)?json(?:\s*;|$)/i;

/**
 * Parses and validates a JSON body. Throws a 400 problem on failure.
 * The body must be declared as JSON: a cross-site HTML form can only send form or plain-text types without
 * a CORS preflight, so refusing those closes a whole class of cross-site posts.
 */
export async function parseJson<S extends z.ZodTypeAny>(c: Context, schema: S): Promise<z.infer<S>> {
  if (!JSON_CONTENT_TYPE.test(c.req.header("content-type") ?? "")) {
    throw new AppError(415, "unsupported_media_type", "Send the request body as application/json");
  }
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw badRequest("Request body must be valid JSON");
  }
  return schema.parse(raw);
}

export function parseQuery<S extends z.ZodTypeAny>(c: Context, schema: S): z.infer<S> {
  return schema.parse(c.req.query());
}
