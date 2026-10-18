# NBE — Neuravic Backend

TypeScript API for the Neuravic website and client portal. Runs on Cloudflare Workers
(Hono) with D1 (SQLite) through Drizzle, plus optional R2 (files) and KV (rate limits).
It is a modular monolith: one deployable, one folder per feature under `src/modules/`.

## What it serves for NFE

| NFE (frontend) | Backend |
|---|---|
| "Start a Project" and "Start a Conversation" buttons | `POST /api/v1/leads` (validation, spam checks, email to the team and the sender) |
| Services, Work, Process, Team and About sections | `GET /api/v1/content` (all sections in one call) |
| Header "Portal" button | Sign-in (`/auth/*`), `GET /me`, organisations, projects, requests, approvals, comments, files, activity |
| Staff running the business | Lead inbox and CSV export, user and content management, audit log, overview |
| DARKAGENT and COOLACCESS_DXB | `POST /token/exchange` and `/.well-known/jwks.json` (single sign-on) |

Full endpoint list: [../Docs/API.md](../Docs/API.md). Design background: [../Docs/Neuravic_Backend_Architecture.pdf](../Docs/Neuravic_Backend_Architecture.pdf). Security: [../Security](../Security/README.md).

## Run it locally

Requires Node 22.13 or newer.

```bash
cd NBE
npm install
cp .dev.vars.example .dev.vars      # set BOOTSTRAP_ADMIN_EMAIL to your email
npm run db:migrate:local            # create the local D1 database
npm run dev                         # http://localhost:8787/api/v1/health
```

The defaults in `wrangler.jsonc` match the frontend dev server (`http://localhost:5173`), so
[NFE](../NFE) connects with no extra setup. In development, emails are printed to the console (including sign-in links), so no mail
provider is needed. Sign in once with your bootstrap email and you are a staff admin.

```bash
npm test            # 72 tests (they live in ../Test/backend), in-memory SQLite, no network
npm run typecheck
```

## Deploy

1. `wrangler d1 create neuravic-db`, then put the id into `wrangler.jsonc` (`database_id`).
2. Set production values in `wrangler.jsonc` `vars`: `APP_ENV=production`, `APP_URL`, `ALLOWED_ORIGINS`, `EMAIL_FROM`, `NOTIFY_TO`.
3. Secrets: `wrangler secret put` for `BOOTSTRAP_ADMIN_EMAIL`, `RESEND_API_KEY`, `TURNSTILE_SECRET`, `SSO_PRIVATE_JWK` (generate with `npm run sso:keygen`), and `SLACK_WEBHOOK_URL` if wanted.
4. Optional bindings: R2 bucket `BUCKET` (enables file attachments), KV `KV` (shared rate limits). Uncomment them in `wrangler.jsonc`.
5. `npm run db:migrate:remote`, then `npm run deploy`.

Route the API on the same domain as the site (for example `neuravic.com/api/*` to this Worker, everything else to NFE) so the session cookie is first-party and NFE needs no API setting. `APP_URL` must be the public site URL: sign-in links point to `APP_URL/portal/verify`.

## Schema changes

Edit `src/db/schema.ts`, run `npm run db:generate -- --name <what_changed>`, review the SQL in `migrations/`, commit it, and apply with the migrate scripts. Migrations are forward-only.

## How it fits together

```
request -> security headers, CORS, request id -> origin check + session -> route
route   -> zod validation -> role check (orgs/policy.ts) -> service/queries -> D1
writes  -> one atomic batch: data change + audit row + outbox emails
outbox  -> sent after the response, retried by the 5-minute cron (backoff, then dead)
```

- **Auth:** passwordless email links (single use, 15 minutes, stored hashed) and server-side sessions in an HttpOnly cookie. Staff sessions last 12 hours; client sessions slide for 30 days (90 maximum). Only invited users can sign in; the bootstrap email creates the first admin.
- **Access control:** deny by default. Non-members get 404 for an organisation, members with too little privilege get 403. Roles: viewer, member, admin, owner. Staff admins act as owners everywhere, delivery staff as admins, sales staff only see leads.
- **Privacy:** IPs and user agents are stored only as hashes. Retention runs in the cron job: spam leads 90 days, lost leads 365 days, expired sessions and tokens daily.

## Not built yet

These are in the architecture PDF but intentionally not in this first version:

- Passkeys (WebAuthn) and TOTP for staff. Staff are protected by short sessions and email links only.
- OpenAPI generation. The API is described by hand in `../Docs/API.md`.
- Virus scanning for uploads. Files are stored with `scan_state = pending`; the download endpoint already blocks `infected`.
- Cloudflare Queues. The outbox is drained after each request and by the cron trigger instead, which is enough at this scale.
- A Turnstile widget on the site. The API verifies tokens as soon as `TURNSTILE_SECRET` is set.
