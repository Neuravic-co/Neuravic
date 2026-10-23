import type { Deps } from "../../deps";
import { AppError } from "../../lib/errors";

/**
 * Verifies a Cloudflare Turnstile token.
 * Optional only in development. Deployed contact intake requires TURNSTILE_SECRET.
 * Fails closed when the verification service cannot be reached.
 */
export async function verifyTurnstile(deps: Deps, token: string | undefined, ip: string): Promise<boolean> {
  const secret = deps.config.turnstileSecret;
  if (!secret) {
    if (deps.config.environment !== "development") {
      deps.log.warn("turnstile_not_configured");
      throw new AppError(503, "bot_check_unavailable", "Contact verification is not configured");
    }
    return true;
  }
  if (!token) return false;
  try {
    const form = new URLSearchParams({ secret, response: token });
    if (ip !== "unknown") form.set("remoteip", ip);
    const res = await deps.http("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(5000),
      redirect: "error",
    });
    if (!res.ok) return false;
    const result = (await res.json()) as { success?: boolean; hostname?: unknown };
    // A valid token from another website/widget deployment is not proof for our contact form.
    // Match explicit trusted hostnames; never use a suffix match or a caller-supplied Origin.
    const hostname = result.hostname;
    return result.success === true && typeof hostname === "string" &&
      deps.config.allowedOrigins.some((origin) => new URL(origin).hostname === hostname.toLowerCase());
  } catch {
    deps.log.error("turnstile_unreachable");
    return false;
  }
}
