import type { Deps } from "../../deps";
import { AppError } from "../../lib/errors";

/** Contact-only verification. A provider outage never permits an unverified enquiry. */
export async function verifyTurnstile(deps: Deps, token: string | undefined, ip: string): Promise<boolean> {
  const secret = deps.config.turnstileSecret;
  if (!secret) {
    if (deps.config.environment === "development") return true;
    deps.log.warn("turnstile_not_configured");
    throw new AppError(503, "bot_check_unavailable", "Contact verification is not configured");
  }
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip !== "unknown") body.set("remoteip", ip);
    const response = await deps.http("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", body, signal: AbortSignal.timeout(5000), redirect: "error",
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error("verification_unavailable");
    }
    const result = await response.json() as { success?: unknown; hostname?: unknown; action?: unknown };
    return result?.success === true && result.action === "contact" && typeof result.hostname === "string" &&
      deps.config.allowedOrigins.some((origin) => new URL(origin).hostname === result.hostname);
  } catch {
    deps.log.warn("turnstile_unavailable");
    throw new AppError(503, "bot_check_unavailable", "Contact verification is temporarily unavailable");
  }
}
