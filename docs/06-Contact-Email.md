# Contact enquiry email delivery

The active application is Node.js + MySQL. The old Cloudflare Worker/D1 paths and browser suites in earlier PRs are no longer the active architecture. Resend HTTP remains the preferred provider; the existing SMTP alternative remains supported. No deployment is performed by these instructions.

## What happens

The contact form calls `/api/v1/leads` through the frontend proxy. The leads service validates JSON, consent and email, applies rate limits, and verifies Turnstile before storage. Outside development, missing `TURNSTILE_SECRET` returns 503; invalid tokens, hostnames or actions are rejected. Verified hostnames must match `ALLOWED_ORIGINS` exactly and the action must be `contact`.

A MySQL transaction saves the enquiry, audit record, team email, visitor acknowledgement and existing optional Slack alert. Duplicate email/message submissions within 24 hours reuse the original enquiry. A keyed lock row serializes concurrent inserts before the existing database duplicate guard runs. The independent worker polls every two seconds and maintenance runs every five minutes; the leads service does not send email inline.

The team notification contains the enquiry ID, name, email, company, services, budget and full plain-text message. The acknowledgement goes only to the normalized visitor address. Names in subjects cannot introduce new headers. Message text is never rendered as HTML.

**202 `status: received` means the enquiry was accepted for processing. It is not an email delivery receipt.** Honeypots and quarantined spam intentionally receive a generic response without notification jobs.

## Configuration

Keep real values in ignored `.env` files for local use and your hosting/Kubernetes secret store for staging/production. Never commit secrets. Examples below use reserved example addresses and do not establish a verified domain.

| Setting | Local development | Staging / production |
|---|---|---|
| `APP_ENV` | `development` | `staging` / `production` |
| `APP_URL` | `http://localhost:5173` | Exact HTTPS website origin |
| `ALLOWED_ORIGINS` | Explicit local website origins | Only trusted HTTPS website origins, including `APP_URL` |
| `DATABASE_URL` | Isolated local MySQL application user | Environment-specific MySQL application user |
| `MIGRATE_DATABASE_URL` | Local migration user | Restricted migration secret used only by migration job |
| `EMAIL_FROM` | `Neuravic <contact@example.com>` | One sender on your verified domain |
| `NOTIFY_TO` | `team@example.com` (local capture only) | One team mailbox or team distribution address |
| `RESEND_API_KEY` | Unset for local capture | Resend sending key restricted to the verified domain |
| `SMTP_URL` | Unset | Optional alternative; use provider-approved encrypted SMTP and URL-encoded credentials |
| `TURNSTILE_SECRET` | May be unset only in development | Required secret for the website's Turnstile widget |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Unset, or an appropriate test widget | Matching public site key; configure BEFORE the frontend build |
| `API_ORIGIN` | Local gateway origin | Reachable gateway origin on the frontend server |
| `NEXT_PUBLIC_API_BASE_URL` | Prefer unset for proxy testing | Unset to use same-origin `/api/v1` |
| `PROXY_SECRET` / `API_PROXY_SECRET` | Matching backend/frontend values | Matching secret; retain existing proxy trust configuration |

Existing privacy/MFA/runtime settings remain required as documented in [Getting started](02-Getting-Started.md). Do not disable those controls to make contact testing pass. The new Turnstile check applies to contact intake only.

Resend takes precedence if both provider settings are present. With neither set, the development worker captures messages in its private dev mailbox. Staging/production retain mail for retry and log `email_not_sent_no_provider`; they never pretend to send it. Run a persistent worker against the same database as the leads service. Setting `MAINTENANCE_MODE=true` pauses its outbox sends.

For Compose, set the example variables in `deployment/.env`. The public Turnstile key is a frontend build argument; the private key is a backend runtime secret. For Helm, add `TURNSTILE_SECRET` to the existing Secret and build the frontend image with `--build-arg NEXT_PUBLIC_TURNSTILE_SITE_KEY=<public-key>`.

A public page loading is not evidence of API connectivity. `503 The API is not configured` means the frontend server lacks `API_ORIGIN`. Verify the gateway is reachable and that its `/api/v1/health` reports healthy services; then test the contact path. No local test establishes that the public deployment works.

## Verify the sender

1. Obtain access to the intended Resend account and DNS zone. Add an owner-approved sending domain or subdomain, for example `mail.example.com`.
2. Publish the exact SPF/return-path and DKIM records shown for that domain and region. Preserve existing DNS records and avoid multiple SPF policies at the same name. Wait for Resend to report the domain verified before sending.
3. Review the domain's DMARC policy with its owner. Start with reporting where appropriate, confirm alignment, then tighten policy deliberately. Do not guess DNS record values.
4. Create a sending key for that domain and store it privately. Set `EMAIL_FROM` to an address on the verified domain, and `NOTIFY_TO` to the approved team mailbox.

Follow Resend's [domain setup](https://resend.com/docs/dashboard/domains/manage-domains) and [DMARC guide](https://resend.com/docs/dashboard/domains/dmarc). Domain verification and provider authentication must be checked in the actual account; syntax validation cannot establish them.

## Local tests with no external email

```sh
npm ci
npm ci --prefix nfe
npm run test:unit
npm run typecheck
npm run lint --prefix nfe
npm run build --prefix nfe
node security/scripts/security-check.mjs --history
```

`test:email` uses real MySQL with injected Resend responses. It refuses remote hosts and any database name other than `neuravic_contact_test`, and clears its test fixtures. Never point it at real data. Create that disposable database on a local MySQL 8 server, then set `TEST_DATABASE_URL` privately:

```sh
# Example only; use your isolated test database's actual credentials and port.
# TEST_DATABASE_URL=mysql://test_user:<local-password>@127.0.0.1:3308/neuravic_contact_test
npm run test:email
```

The suite applies all migrations, including `003_email_delivery.sql`, inside that isolated database. It exercises saved enquiries, message content/recipients, duplicate intake, concurrent outbox claims, stale workers, backoff, expiration, permanent failure, missing provider configuration and scheduled retries. No real Resend key or SMTP URL is used by this suite.

For the browser suite, build with a public dummy site key `NEXT_PUBLIC_TURNSTILE_SITE_KEY=contact-test-site-key` and `NEXT_PUBLIC_API_BASE_URL` unset/empty. Then run `npx playwright install chromium` and `npm run test:browser`. It starts the built frontend on port 5174, mocks Turnstile and API responses, and verifies validation, loading, duplicate clicks, failures, token expiry, mobile layout and accessibility. This UI-only suite does not prove MySQL or inbox delivery. After the same browser build, run `npm run test:contact-e2e` with `TEST_DATABASE_URL` to exercise the joined path: real browser -> frontend proxy -> API -> MySQL -> outbox worker -> mocked Resend -> acceptance metadata. It uses local ports 5174 and 8879. These suites are added to CI; CI has no real mail credentials.

On this Windows machine, use `PLAYWRIGHT_BROWSERS_PATH` and `TEMP`/`TMP` under the ignored project `tmp/` directory on D: to avoid using C: for test downloads. Set environment variables using PowerShell `$env:NAME='value'` or your shell's equivalent; do not paste real secrets into shared terminals or reports.

For a manual local demonstration with no real credentials: start the existing gateway/services and development worker, configure the frontend proxy, submit synthetic data, and inspect `/api/v1/dev/mailbox` through the local gateway. Check both messages and the saved enquiry. Development captures are not inbox delivery.

## Delivery states, retries and troubleshooting

| Database evidence | Meaning |
|---|---|
| `pending`, `attempts=0` | Queued, or currently leased by a worker |
| `pending`, `attempts>0`, `last_error` | Failed attempt; retry scheduled in `next_attempt_at` |
| `sent`, `provider=resend` or `smtp` | Provider accepted the message; use `provider_message_id` for further investigation |
| `sent`, `provider=development` or `memory` | Local/test capture only |
| `dead`, `last_error` | Permanent rejection, exhausted retries or expired payload; requires operator attention |

The historical `sent` column name remains for compatibility. **It never proves inbox placement.** `accepted_at` records handoff/capture time. A Resend delivery event means acceptance by the recipient's mail server, which still does not establish inbox placement or that the person read it. See [Resend event meanings](https://resend.com/docs/webhooks/event-types).

Retries wait at least 1 minute, 5 minutes, 30 minutes, 2 hours and 12 hours, with up to 20% positive jitter; the sixth failed attempt is terminal. HTTP 408/429/5xx and timeouts retry. Permanent rejections stop immediately. Conflicting idempotency payloads stop; requests already in progress retry. Resend HTTP requests use a 10-second timeout. SMTP uses 10-second connection/greeting timeouts and a 20-second socket inactivity timeout. Jobs expire within 23 hours of creation, or sooner for expiring links. Successful and terminal payloads are erased; metadata remains subject to existing 30/90-day retention.

Each job has a two-minute fenced lease, a fixed sender snapshot and stable `outbox/<job-id>` idempotency key. Resend deduplicates retries within its [24-hour window](https://resend.com/docs/dashboard/emails/idempotency-keys). Do not change provider/account while jobs are pending. Generic SMTP has no equivalent exactly-once guarantee after a crash or ambiguous acceptance; its stable Message-ID is only a correlation aid. Prefer Resend HTTP when this matters.

Investigate using metadata, not personal payload dumps:

```sql
SELECT id, lead_id, notification_kind, state, attempts, next_attempt_at,
       last_error, provider, provider_message_id, accepted_at
FROM outbox WHERE topic = 'email' ORDER BY created_at DESC LIMIT 50;
```

The existing staff-only security status endpoint reports backlog aggregates. Alert on any dead email, old pending jobs and worker/timer failures. Investigate `mail_not_configured`, HTTP authentication/domain errors, rate limits, timeouts and worker health. Read provider logs using the stored message IDs, check bounces/suppression/delays and spam/junk folders, and ask mailbox owners for receipt evidence. No webhook is exposed by this change; downstream delivery state is verified in the provider account rather than inferred or automatically marked delivered in MySQL.

Do not reset a dead/sent job or change its idempotency key to force another send. Payloads are intentionally scrubbed. Reconcile the provider history first; any intentional replacement must be reviewed and constructed from the saved enquiry. Notification failure does not delete the enquiry.

## Controlled staging verification (owner action)

1. Approve the isolated staging backend/database and the exact team and visitor test addresses. Use synthetic text with a unique test marker; never customer data. Review unrelated pending jobs before starting a real-provider worker.
2. Configure the verified sender, Resend key (or approved SMTP account), approved `NOTIFY_TO`, Turnstile keys, exact website origins and frontend proxy. Apply migration `003_email_delivery.sql` before running this version. Start the persistent worker.
3. From the staging website submit once, recording only the enquiry ID, marker and time. Verify one saved enquiry and exactly two email jobs. Repeating the same submission with a fresh challenge must reuse that enquiry without adding jobs.
4. Record provider acceptance IDs, outbox states and redacted provider authentication/domain-verification evidence. Check provider delivery events/logs for each message, including failures or bounces.
5. The owners of both approved mailboxes must confirm receipt, correct content and no unintended duplicates; check junk/spam if missing. Record separately: API accepted, provider accepted, recipient server delivered, and mailbox received.
6. Stop the external test if account, deployment or mailbox access is missing. Never use production as a substitute. A queued/sent row or HTTP 200 from Resend is insufficient to declare real delivery working.

Current owner prerequisites: provider account/key or SMTP credentials, verified sending domain and DNS access, approved sender/team/visitor addresses, accessible isolated staging backend and MySQL, matching Turnstile configuration, and access to provider logs and both mailboxes. None is assumed to exist.
