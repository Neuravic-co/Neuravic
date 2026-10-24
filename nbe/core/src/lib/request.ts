import type { Context } from "hono";
import type { AppEnv } from "../app";

const IP_PATTERN = /^[0-9a-fA-F:.]{3,45}$/;

/** Compares two strings in time that does not depend on where they first differ. */
function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Best-effort client address.
 * Behind the frontend proxy, Cloudflare only sees the proxy's address, so the proxy sends the visitor's
 * address in `x-client-ip` together with a shared secret. The header is trusted only when the secret matches.
 */
export function clientIp(c: Context<AppEnv>): string {
  const secret = c.get("deps").config.proxySecret;
  const forwarded = c.req.header("x-client-ip");
  if (secret && forwarded && IP_PATTERN.test(forwarded) && sameSecret(c.req.header("x-proxy-secret") ?? "", secret)) {
    return forwarded;
  }
  // Workers overwrite CF-Connecting-IP at the edge. Arbitrary X-Forwarded-For is not trusted.
  const edge = c.req.header("cf-connecting-ip");
  if (edge && IP_PATTERN.test(edge)) return edge;
  // Plain Node server: the address of the TCP connection itself.
  const socket = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming?.socket;
  const remote = socket?.remoteAddress?.replace(/^::ffff:/, "");
  return remote && IP_PATTERN.test(remote) ? remote : "unknown";
}
