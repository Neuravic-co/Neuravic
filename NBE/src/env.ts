/** Cloudflare bindings and variables available to the Worker. */
export interface Env {
  DB: D1Database;
  BUCKET?: R2Bucket;
  /** Private service binding. Scanner must return a digest-bound verdict. */
  MALWARE_SCANNER?: Fetcher;

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
  /** Shared with the frontend proxy so the real visitor address can be trusted. */
  PROXY_SECRET?: string;
  /** Dedicated HMAC key for pseudonymous audit and rate-limit identifiers (32+ random characters). */
  PRIVACY_HASH_SECRET?: string;
  /** Independent 32-byte AES key encoded as 64 hexadecimal characters. */
  MFA_ENCRYPTION_KEY?: string;
  /** Defaults to true in staging/production; false only for development. */
  STAFF_MFA_REQUIRED?: string;
}
