import type { Context } from "hono";
import type { z } from "zod";
import { badRequest } from "./errors";

/** Parses and validates a JSON body. Throws a 400 problem on failure. */
export async function parseJson<S extends z.ZodTypeAny>(c: Context, schema: S): Promise<z.infer<S>> {
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
