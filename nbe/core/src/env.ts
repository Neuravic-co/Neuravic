/** Settings read from the process environment (see .env and docs/02-Getting-Started.md). */
export interface Env {
  APP_ENV?: string;
  APP_VERSION?: string;
  /** Owner-controlled containment for an approved recovery/key cutover. */
  MAINTENANCE_MODE?: string;
  APP_URL: string;
  ALLOWED_ORIGINS: string;
  EMAIL_FROM: string;
  NOTIFY_TO: string;
  SSO_KEY_ID?: string;
  SSO_AUDIENCES?: string;
  /** Public-only JWKS for prepublication/overlap. Never include private d values. */
  SSO_PUBLIC_JWKS?: string;

  // Secrets
  BOOTSTRAP_ADMIN_EMAIL?: string;
  RESEND_API_KEY?: string;
  /** Required for contact intake outside development; paired with the frontend site key. */
  TURNSTILE_SECRET?: string;
  /** Any SMTP server, e.g. smtps://you%40gmail.com:app-password@smtp.gmail.com:465 (user and password URL-encoded). */
  SMTP_URL?: string;
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
