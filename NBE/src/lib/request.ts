import type { Context } from "hono";

/** Best-effort client address (Cloudflare sets cf-connecting-ip). */
export function clientIp(c: Context): string {
  return (
    c.req.header("cf-connecting-ip") ??
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}
