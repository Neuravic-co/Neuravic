/** Cloudflare bindings and variables available to the Worker. */
export interface Env {
  DB: D1Database;
  BUCKET?: R2Bucket;
  KV?: KVNamespace;

  APP_ENV?: string;
  APP_VERSION?: string;
  APP_URL: string;
  ALLOWED_ORIGINS: string;
  EMAIL_FROM: string;
  NOTIFY_TO: string;
  SSO_KEY_ID?: string;
  SSO_AUDIENCES?: string;

  // Secrets
  BOOTSTRAP_ADMIN_EMAIL?: string;
  TURNSTILE_SECRET?: string;
  RESEND_API_KEY?: string;
  SLACK_WEBHOOK_URL?: string;
  SSO_PRIVATE_JWK?: string;
}
