import type { HttpBindings } from "@hono/node-server";
import type { Context } from "hono";
import type { z } from "zod";
import { safeEqual } from "./crypto";
import { AppError, badRequest } from "./errors";

export type AppEnv = {
  Bindings: Partial<HttpBindings>;
  Variables: { requestId: string };
};

const JSON_CONTENT_TYPE = /^application\/(?:[\w.+-]+\+)?json(?:\s*;|$)/i;
const IP_PATTERN = /^[0-9a-fA-F:.]{3,45}$/;

export async function parseJson<S extends z.ZodType>(c: Context, schema: S): Promise<z.infer<S>> {
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

export function clientIp(c: Context<AppEnv>, proxySecret: string | null): string {
  const forwarded = c.req.header("x-client-ip");
  if (proxySecret && forwarded && IP_PATTERN.test(forwarded) && safeEqual(c.req.header("x-proxy-secret") ?? "", proxySecret)) {
    return forwarded;
  }
  const remote = c.env?.incoming?.socket?.remoteAddress?.replace(/^::ffff:/, "");
  return remote && IP_PATTERN.test(remote) ? remote : "unknown";
}
