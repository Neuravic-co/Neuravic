# Running the backend on Vercel

The backend (`NBE`) runs as a Vercel function next to the website. The Cloudflare Worker still works and shares the same code; use one or the other for a given database.

## Moving parts

| Piece | What | Where it is set up |
| --- | --- | --- |
| Website | Next.js, root directory `NFE` | existing Vercel project `neuravic` |
| Backend | Hono function, root directory `NBE` | a second Vercel project |
| Database | Turso (libSQL, SQLite), same migrations as Cloudflare D1 | Vercel Marketplace or turso.tech |

The website forwards `/api/*` to the backend using `API_ORIGIN`, and signs forwarded requests with a shared secret.

## 1. Database

Create a Turso database (Vercel Marketplace gives `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` to the project it is connected to). Apply the schema once, from your own machine:

```bash
cd NBE
npm ci
TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... npm run db:migrate:libsql
```

The script is safe to run again; it records applied files in `_migrations`.

## 2. Secrets

```bash
node Security/scripts/generate-secrets.mjs
```

Paste the values into Vercel yourself, as Sensitive variables. Do not commit or share them.

## 3. Backend project variables (Production)

| Name | Value |
| --- | --- |
| `APP_ENV` | `production` |
| `APP_URL` | `https://neuravic.vercel.app` (the website origin, HTTPS, no path) |
| `ALLOWED_ORIGINS` | same as `APP_URL` |
| `EMAIL_FROM` | a sender on a domain verified with your email provider |
| `NOTIFY_TO` | where enquiry notifications go |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | from the database |
| `PROXY_SECRET`, `PRIVACY_HASH_SECRET`, `MFA_ENCRYPTION_KEY`, `CRON_SECRET` | generated above |
| `BOOTSTRAP_ADMIN_EMAIL` | your email: becomes the first staff admin |
| `RESEND_API_KEY` | needed for sign-in and notification emails |
| `TURNSTILE_SECRET` | needed for the contact form: it refuses submissions without it |

## 4. Website project variables (Production)

| Name | Value |
| --- | --- |
| `API_ORIGIN` | the backend project's address, for example `https://neuravic-api.vercel.app` |
| `API_PROXY_SECRET` | the same value as `PROXY_SECRET` |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | the public key of the same Turnstile widget |
| `NEXT_PUBLIC_PORTAL_OPEN` | `true` once sign-in should be live |

Turn Vercel deployment protection off for the backend project's production domain, or the website's calls get a login page instead of the API.

## 5. Check

`https://<backend>/api/v1/health` answers `{"status":"ok"}`, and `https://neuravic.vercel.app/api/v1/health` answers the same through the website.

## Limits to know

- Uploads are off on this host (the file endpoints answer 503) until a private file store is added.
- Vercel's free plan runs cron once a day, so email retries and cleanup run daily here, not every five minutes.
- MFA keys cannot be changed without re-enrolling staff; keep `MFA_ENCRYPTION_KEY` safe.
