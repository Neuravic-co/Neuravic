import type { Config } from "../../config";
import { unavailable } from "../../core/errors";
import type { Logger } from "../../core/logger";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface BotCheck {
  verify(token: string | undefined, ip: string): Promise<boolean>;
}

export class TurnstileBotCheck implements BotCheck {
  private readonly hostnames: string[];

  constructor(private readonly config: Config, private readonly http: typeof fetch, private readonly log: Logger) {
    this.hostnames = config.allowedOrigins.map((origin) => new URL(origin).hostname);
  }

  async verify(token: string | undefined, ip: string): Promise<boolean> {
    const secret = this.config.turnstileSecret;
    if (!secret) {
      if (!this.config.deployed) return true;
      this.log.warn("turnstile_not_configured");
      throw unavailable("bot_check_unavailable", "Contact verification is not configured");
    }
    if (!token) return false;
    try {
      const body = new URLSearchParams({ secret, response: token });
      if (ip !== "unknown") body.set("remoteip", ip);
      const response = await this.http(VERIFY_URL, { method: "POST", body, signal: AbortSignal.timeout(5000), redirect: "error" });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error("verification_unavailable");
      }
      const result = (await response.json()) as { success?: unknown; hostname?: unknown; action?: unknown };
      return result?.success === true && result.action === "contact" && typeof result.hostname === "string" && this.hostnames.includes(result.hostname);
    } catch {
      this.log.warn("turnstile_unavailable");
      throw unavailable("bot_check_unavailable", "Contact verification is temporarily unavailable");
    }
  }
}
