import { z } from "zod";

export interface Config {
  environment: "development" | "staging" | "production";
  deployed: boolean;
  version: string;
  maintenanceMode: boolean;
  appUrl: string;
  allowedOrigins: string[];
  host: string;
  port: number;
  databaseUrl: string;
  databaseCaCert: string | null;
  dbPoolSize: number;
  emailFrom: string;
  notifyTo: string;
  resendApiKey: string | null;
  smtpUrl: string | null;
  slackWebhookUrl: string | null;
  turnstileSecret: string | null;
  proxySecret: string | null;
  cronSecret: string | null;
  hashSecret: string;
  outboxPollMs: number;
}

const secret = z.string().min(32);
const FROM_PATTERN = /^(?:[^<>]+ <([^<>]+)>|([^<>]+))$/;
const CONTROL_CHARACTERS = /[\r\n\x00-\x1f\x7f]/;

const envSchema = z.object({
  APP_ENV: z.enum(["development", "staging", "production"]).default("development"),
  APP_VERSION: z.string().default("dev"),
  APP_URL: z.url(),
  ALLOWED_ORIGINS: z.string().min(1),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(0).max(65535).default(8787),
  DATABASE_URL: z.string().min(1),
  DATABASE_CA_CERT: z.string().optional(),
  DB_POOL_SIZE: z.coerce.number().int().min(1).max(100).default(10),
  EMAIL_FROM: z.string().max(320).refine((value) => {
    if (CONTROL_CHARACTERS.test(value)) return false;
    const match = FROM_PATTERN.exec(value);
    return !!match && z.email().safeParse(match[1] ?? match[2]).success;
  }),
  NOTIFY_TO: z.email(),
  RESEND_API_KEY: z.string().optional(),
  SMTP_URL: z.string().optional(),
  SLACK_WEBHOOK_URL: z.url().optional(),
  TURNSTILE_SECRET: z.string().trim().optional(),
  PROXY_SECRET: secret.optional(),
  CRON_SECRET: secret.optional(),
  PRIVACY_HASH_SECRET: secret,
  MAINTENANCE_MODE: z.enum(["true", "false"]).optional(),
  OUTBOX_POLL_MS: z.coerce.number().int().min(250).default(2000),
});

const list = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);

function isExplicitOrigin(value: string, deployed: boolean): boolean {
  try {
    const url = new URL(value);
    return value === url.origin && !url.username && !url.password && (url.protocol === "https:" || (!deployed && url.protocol === "http:"));
  } catch {
    return false;
  }
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const present = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== undefined && value !== ""));
  const parsed = envSchema.safeParse(present);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${[...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))].join(", ")}`);
  }
  const e = parsed.data;
  const deployed = e.APP_ENV !== "development";
  const appUrl = e.APP_URL.replace(/\/$/, "");
  const allowedOrigins = [...new Set(list(e.ALLOWED_ORIGINS))];

  if (!isExplicitOrigin(appUrl, deployed) || !allowedOrigins.every((origin) => isExplicitOrigin(origin, deployed)) || !allowedOrigins.includes(appUrl)) {
    throw new Error("APP_URL and ALLOWED_ORIGINS must be explicit website origins (HTTPS outside development)");
  }
  if ([e.PROXY_SECRET, e.CRON_SECRET, e.RESEND_API_KEY].includes(e.PRIVACY_HASH_SECRET)) {
    throw new Error("PRIVACY_HASH_SECRET must be an independent private key");
  }
  if (e.SLACK_WEBHOOK_URL) {
    const webhook = new URL(e.SLACK_WEBHOOK_URL);
    if (webhook.protocol !== "https:" || !["hooks.slack.com", "hooks.slack-gov.com"].includes(webhook.hostname)) {
      throw new Error("SLACK_WEBHOOK_URL must be an HTTPS Slack webhook");
    }
  }

  return {
    environment: e.APP_ENV,
    deployed,
    version: e.APP_VERSION,
    maintenanceMode: e.MAINTENANCE_MODE === "true",
    appUrl,
    allowedOrigins,
    host: e.HOST,
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    databaseCaCert: e.DATABASE_CA_CERT ?? null,
    dbPoolSize: e.DB_POOL_SIZE,
    emailFrom: e.EMAIL_FROM,
    notifyTo: e.NOTIFY_TO,
    resendApiKey: e.RESEND_API_KEY ?? null,
    smtpUrl: e.SMTP_URL ?? null,
    slackWebhookUrl: e.SLACK_WEBHOOK_URL ?? null,
    turnstileSecret: e.TURNSTILE_SECRET || null,
    proxySecret: e.PROXY_SECRET ?? null,
    cronSecret: e.CRON_SECRET ?? null,
    hashSecret: e.PRIVACY_HASH_SECRET,
    outboxPollMs: e.OUTBOX_POLL_MS,
  };
}
