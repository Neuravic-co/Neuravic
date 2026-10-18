import type { Deps } from "../../deps";

/**
 * Verifies a Cloudflare Turnstile token.
 * Skipped (with a warning) when no secret is configured; set TURNSTILE_SECRET in production.
 * Fails closed when the verification service cannot be reached.
 */
export async function verifyTurnstile(deps: Deps, token: string | undefined, ip: string): Promise<boolean> {
  const secret = deps.config.turnstileSecret;
  if (!secret) {
    if (deps.config.environment === "production") deps.log.warn("turnstile_not_configured");
    return true;
  }
  if (!token) return false;
  try {
    const form = new URLSearchParams({ secret, response: token });
    if (ip !== "unknown") form.set("remoteip", ip);
    const res = await deps.http("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
    });
    if (!res.ok) return false;
    const result = (await res.json()) as { success?: boolean };
    return result.success === true;
  } catch (error) {
    deps.log.error("turnstile_unreachable", { error: String(error) });
    return false;
  }
}
