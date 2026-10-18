import { z } from "zod";
import type { Env } from "./env";

export interface Config {
  environment: "development" | "staging" | "production";
  version: string;
  appUrl: string;
  allowedOrigins: string[];
  emailFrom: string;
  notifyTo: string;
  bootstrapAdminEmail: string | null;
  turnstileSecret: string | null;
  slackWebhookUrl: string | null;
  resendApiKey: string | null;
  ssoAudiences: string[];
  ssoKeyId: string;
  ssoPrivateJwk: string | null;
  cookieSecure: boolean;
  maxUploadBytes: number;
}

const list = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const envSchema = z.object({
  APP_URL: z.string().url(),
  EMAIL_FROM: z.string().min(3),
  NOTIFY_TO: z.string().email(),
});

/** Validates the Worker environment once and returns typed configuration. */
export function loadConfig(env: Env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.message}`);
  }
  const environment =
    env.APP_ENV === "production" || env.APP_ENV === "staging" ? env.APP_ENV : "development";

  return {
    environment,
    version: env.APP_VERSION ?? "dev",
    appUrl: env.APP_URL.replace(/\/$/, ""),
    allowedOrigins: list(env.ALLOWED_ORIGINS),
    emailFrom: env.EMAIL_FROM,
    notifyTo: env.NOTIFY_TO,
    bootstrapAdminEmail: env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase() || null,
    turnstileSecret: env.TURNSTILE_SECRET || null,
    slackWebhookUrl: env.SLACK_WEBHOOK_URL || null,
    resendApiKey: env.RESEND_API_KEY || null,
    ssoAudiences: list(env.SSO_AUDIENCES),
    ssoKeyId: env.SSO_KEY_ID ?? "neuravic-1",
    ssoPrivateJwk: env.SSO_PRIVATE_JWK || null,
    cookieSecure: environment !== "development",
    maxUploadBytes: 10 * 1024 * 1024,
  };
}
