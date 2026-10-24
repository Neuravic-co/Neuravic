import { z } from "zod";
import type { Env } from "./env";

export interface Config {
  environment: "development" | "staging" | "production";
  version: string;
  maintenanceMode: boolean;
  appUrl: string;
  allowedOrigins: string[];
  emailFrom: string;
  notifyTo: string;
  bootstrapAdminEmail: string | null;
  slackWebhookUrl: string | null;
  resendApiKey: string | null;
  smtpUrl: string | null;
  ssoAudiences: string[];
  ssoKeyId: string;
  ssoPrivateJwk: string | null;
  ssoPublicJwks: string | null;
  proxySecret: string | null;
  privacyHashSecret: string;
  mfaEncryptionKey: string | null;
  staffMfaRequired: boolean;
  cookieSecure: boolean;
  maxUploadBytes: number;
}

const list = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const envSchema = z.object({
  APP_ENV: z.enum(["development", "staging", "production"]).default("development"),
  APP_URL: z.string().url(),
  ALLOWED_ORIGINS: z.string().min(1),
  EMAIL_FROM: z.string().min(3),
  NOTIFY_TO: z.string().email(),
  PROXY_SECRET: z.string().min(32).optional(),
  PRIVACY_HASH_SECRET: z.string().min(32).optional(),
  MFA_ENCRYPTION_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/).optional(),
  STAFF_MFA_REQUIRED: z.enum(["true", "false"]).optional(),
  MAINTENANCE_MODE: z.enum(["true", "false"]).optional(),
});

/** Validates the Worker environment once and returns typed configuration. */
export function loadConfig(env: Env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    // Report field names only: configuration values may contain credentials.
    throw new Error(`Invalid environment fields: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`);
  }
  const environment = parsed.data.APP_ENV;
  const deployed = environment !== "development";
  const origins = list(env.ALLOWED_ORIGINS);
  const validOrigin = (value: string) => {
    try {
      const url = new URL(value);
      return value === url.origin && !url.username && !url.password &&
        (url.protocol === "https:" || (!deployed && url.protocol === "http:"));
    } catch { return false; }
  };
  const appUrl = env.APP_URL.replace(/\/$/, "");
  if (!validOrigin(appUrl) || origins.some((origin) => !validOrigin(origin)) || !origins.includes(appUrl)) {
    throw new Error("APP_URL and ALLOWED_ORIGINS must be explicit website origins (HTTPS outside development)");
  }
  if (deployed && !env.PRIVACY_HASH_SECRET) throw new Error("PRIVACY_HASH_SECRET is required outside development");
  if (env.PRIVACY_HASH_SECRET && (env.PRIVACY_HASH_SECRET.trim().length < 32 ||
    env.PRIVACY_HASH_SECRET === "neuravic-development-identifiers-only" ||
    [env.PROXY_SECRET, env.RESEND_API_KEY, env.MFA_ENCRYPTION_KEY, env.SSO_PRIVATE_JWK].includes(env.PRIVACY_HASH_SECRET))) {
    throw new Error("PRIVACY_HASH_SECRET must be an independent private key");
  }
  const staffMfaRequired = env.STAFF_MFA_REQUIRED ? env.STAFF_MFA_REQUIRED === "true" : deployed;
  if (staffMfaRequired && !env.MFA_ENCRYPTION_KEY) throw new Error("MFA_ENCRYPTION_KEY is required for staff MFA enforcement");
  if (env.MFA_ENCRYPTION_KEY && [env.PROXY_SECRET, env.PRIVACY_HASH_SECRET, env.SSO_PRIVATE_JWK].includes(env.MFA_ENCRYPTION_KEY)) throw new Error("MFA_ENCRYPTION_KEY must be independent");
  if (env.SLACK_WEBHOOK_URL) {
    const webhook = new URL(env.SLACK_WEBHOOK_URL);
    if (webhook.protocol !== "https:" || !["hooks.slack.com", "hooks.slack-gov.com"].includes(webhook.hostname) || webhook.username || webhook.password) {
      throw new Error("SLACK_WEBHOOK_URL must be an HTTPS Slack webhook");
    }
  }

  return {
    environment,
    version: env.APP_VERSION ?? "dev",
    maintenanceMode: env.MAINTENANCE_MODE === "true",
    appUrl,
    allowedOrigins: [...new Set(origins)],
    emailFrom: env.EMAIL_FROM,
    notifyTo: env.NOTIFY_TO,
    bootstrapAdminEmail: env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase() || null,
    slackWebhookUrl: env.SLACK_WEBHOOK_URL || null,
    resendApiKey: env.RESEND_API_KEY || null,
    smtpUrl: env.SMTP_URL || null,
    ssoAudiences: list(env.SSO_AUDIENCES),
    ssoKeyId: env.SSO_KEY_ID ?? "neuravic-1",
    ssoPrivateJwk: env.SSO_PRIVATE_JWK || null,
    ssoPublicJwks: env.SSO_PUBLIC_JWKS || null,
    proxySecret: env.PROXY_SECRET || null,
    // Development only: deployed environments must provide their own independent random key.
    privacyHashSecret: env.PRIVACY_HASH_SECRET ?? "neuravic-development-identifiers-only",
    mfaEncryptionKey: env.MFA_ENCRYPTION_KEY ?? null,
    staffMfaRequired,
    cookieSecure: environment !== "development",
    maxUploadBytes: 10 * 1024 * 1024,
  };
}
