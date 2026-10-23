# Security operations and rollout

This is a reviewed change plan, not a record of a production deployment. Production deployment, credential rotation, repository protection changes and production recovery require the owner's separate approval.

**Phase 3 update:** use [production configuration and recovery](production-configuration.md), [go-live checklist](go-live-checklist.md) and [current evidence/NO-GO assessment](phase-3-readiness.md) alongside this earlier rollout procedure. The later procedure covers all ten migrations, factor recovery guards, overlapping SSO keys, supervised privacy fulfillment, schema-first local restore and API/scheduled-work containment. Do not interpret the earlier additive-schema rollback discussion as approval to restore weaker MFA/quarantine code.

## Prepare and stage

1. Provision staging with its own Worker, D1 and optional private R2 bucket. Never point test fixtures at production. Set `APP_ENV=staging`, an HTTPS `APP_URL`, and exact `ALLOWED_ORIGINS` including that website origin. Unknown environment names, wildcard/path-bearing origins and non-HTTPS deployed origins fail configuration validation.
2. Set a new, dedicated `PRIVACY_HASH_SECRET` as a Worker secret: at least 32 cryptographically random characters. Use independent values for staging and production. Do not reuse the SSO, mail or proxy credentials. New deployed code requires this key. Adding the production value is a separately approved operational step; it was not performed by this PR.
3. Confirm existing `PROXY_SECRET`/`API_PROXY_SECRET` values match and are at least 32 characters. If an existing value is shorter, obtain approval for a coordinated rotation before rollout. The Vercel proxy trusts only the platform's overwritten `x-vercel-forwarded-for` header when `VERCEL=1`; portable hosts must route the API directly or implement a separately reviewed trusted-IP adapter. Do not set `VERCEL=1` on an arbitrary public Node server.
4. Configure Resend and the sending domain in staging. Missing provider configuration now leaves jobs pending/failed; it never pretends to deliver mail. Email bodies, recipients and magic links are no longer printed, even in development. Local browser testing uses a separate in-memory test mailbox, not a production endpoint.
5. Keep R2 private. Phase 2 quarantines every pending/infected file, including old pending records. Provision and approve a real scanner as the private `MALWARE_SCANNER` service binding before offering downloads. With no binding, uploads remain pending and unavailable; no actor can bypass quarantine. See the scanner contract below.

## Validate before release

```bash
cd NBE
npm ci
npm run typecheck
npm test
node scripts/verify-local-recovery.mjs # new isolated local databases only; never --remote
npm run test:browser   # also needs NFE and Test dependencies plus Playwright Chromium
npx drizzle-kit generate --name ci_check   # must produce no schema diff
npx wrangler d1 migrations apply neuravic-db --local
npx wrangler deploy --dry-run
cd ../NFE
npm run lint
npm run typecheck
npm run build         # Vinext / Cloudflare path
npx next build        # Vercel path
cd ..
node Security/scripts/security-check.mjs --history
```

`test:browser` creates a migrated, in-memory API, an authenticated loopback mailbox and a Next.js dev server, runs all three existing browser suites, then shuts down its servers. It never sends real email, reads production credentials or changes production data. Install `Test/` dependencies and run `npx playwright install chromium` there first; `CHROMIUM_PATH` can select an existing test browser. The fixture mailbox is implemented under `Test/browser/`, is bound to loopback with a random access secret, and is absent from the Worker build.

Run staging smoke checks with dedicated test accounts: contact acknowledgement, valid/expired/replayed login, logout, session renewal, staff promotion/demotion, two separate tenants, approvals racing cancellation/rejection, file quota/size enforcement and dependency outages. Inspect actual headers on `/`, `/portal`, `/portal/verify`, `/api/v1/me` and failures. Private API responses and any response setting cookies must be no-store. Verify font, inline framework scripts and optional Turnstile before tightening CSP; Phase 2 enforces a nonce-based script policy. Test both actual hosting paths, font connections, Turnstile and any separate API origin. Every HTML response is dynamic and private/no-store so visitors cannot share a nonce.

## Approved deployment order

1. Record release commits, current Worker/Vercel versions, D1 migration state and a recoverable backup reference. Verify backup access is private and encrypted; never attach an export to a public issue or PR.
2. Configure the new privacy key and verify environment/proxy/mail prerequisites privately. Do not print secret values or copy them to logs.
3. **Deploy NFE first.** It accepts both legacy query-string links and new fragment links. Old frontend code cannot consume fragment links.
4. Apply `0003_atomic_login_claims.sql` and `0004_write_guards.sql` to staging, then the approved production target. They add a nullable claim column and seven insert/update guards, without rewriting tables or deleting existing records. Review any pre-existing inconsistent rows separately; the guards apply to future writes.
5. Deploy NBE after migrations. It uses atomic token/session claims and emits fragment links. Existing accounts, sessions and unexpired query-string links remain compatible unless a security event revokes them. Promotion, disabling or staff-role changes revoke prior sessions and magic links in the database transaction.
6. Run read-only health/header checks and explicit, approved smoke tests with test accounts. Observe request error rates, outbox pending/dead counts and login success before opening the portal to clients. Do not expose `NEXT_PUBLIC_PORTAL_OPEN=true` as a substitute for backend authorization.

## Rollback

- Keep the previous application artifacts and the dual-format frontend available. Roll back the Worker to the previous approved version if needed; the new nullable column and guards are additive. Do not drop columns/triggers or reverse migrations on a live database to roll application code back.
- Keep the dual-format NFE release until all fragment links from the newer backend have expired (15 minutes after the last issue). Rolling the frontend back earlier can break valid sign-ins.
- Do not roll secrets back blindly or reuse revoked credentials. A privacy-key change resets correlation/rate-limit identities and needs a planned rotation window. This PR performs no key rotations.
- Treat database restoration as a separate, approved recovery procedure, not an ordinary code rollback. Preserve evidence and identify the target database explicitly before any restore.

## Monitoring and incident handling

The Worker logs structured `request` events with request ID, method, route pattern, status and duration. Paths use templates so arbitrary path segments cannot become personal data in access logs. Error logs contain classifications, not raw exception messages. Outbox failures include job ID/topic/attempt count; successful and terminal jobs have their payload scrubbed. Pending email payloads remain sensitive until sent/expired and require restricted D1 access.

Suggested initial alerts (maintainers must configure and tune them): sustained 5xx above 1% over five minutes with a minimum traffic count; spikes in 401 on `/auth/verify` or 429 on auth/leads; any outbox `dead` jobs or oldest pending job older than 15 minutes; missed maintenance completion; repeated `blob_cleanup_failed`/`blob_delete_failed`. These thresholds are proposals, not measured SLOs. `GET /admin/overview` provides staff-admin-only outbox counts. Avoid high-cardinality email/IP labels.

For an incident:

1. Record timestamps, deployment version and request IDs in a private incident record. Preserve access-controlled provider logs; do not copy request bodies, cookies, email text, signing keys or D1 exports into tickets.
2. Identify impact using route/status aggregates and authorized audit records. Audit data identifies actors/objects; use private application access to resolve identities only when necessary.
3. Disable a compromised account through the authorized staff endpoint to revoke its sessions and outstanding links. Revoke/rotate exposed provider or signing credentials only with explicit approval. Short-lived SSO tokens can remain usable until their five-minute expiration.
4. Suspend affected integrations or roll back approved application artifacts. Check rejected approvals, recovered leads and orphaned storage objects using IDs rather than exporting client content.
5. Confirm recovery with controlled staging/test accounts and review the timeline, cause and regression test. Record follow-up owners and due dates privately.

## Backups and retention

Verify D1 Time Travel availability and retention in the actual account/plan; source code cannot prove it. Exercise restoration using a separate staging/test database and sanitized fixtures, including schema versions, foreign keys, record counts, roles, tenant isolation and attachment metadata. Record measured recovery time and recoverable point. Schedule private encrypted exports only after storage/access/retention are approved. No backup job or restore was configured by this PR.

Maintenance runs every five minutes and processes at most 500 records per cleanup category, in smaller atomic batches for lead notes/parents. It rechecks a lead's retention eligibility inside the deletion transaction so a concurrent recovery to `won` preserves both lead and notes. Large backlogs require successive runs and monitoring; retention deadlines are not instantaneous guarantees. Pending notification payloads are dropped on delivery expiry; sent/dead metadata retains the existing 30/90-day windows. Old unsalted audit hashes and pre-upgrade raw rate keys remain until their normal retention windows; the change cannot retroactively anonymize them.

## Repository controls requiring human administration

In GitHub **Settings → Rules → Rulesets**, create/review a rule targeting `main`: require a pull request and at least one approving review, dismiss stale approvals, require resolved conversations, block force pushes/deletion, and require **NBE checks**, **NFE and browser checks**, **Security checks**, **CodeQL analysis**, and the separate **CodeQL** findings check exactly as displayed after the first run. The analysis job can succeed while the findings check fails on a new security alert; require both. Job names are unique across workflows to avoid ambiguous required contexts. Review any existing rules that still refer to the older shared `check` name. Keep checks running on every PR to avoid skipped required contexts. In **Settings → Code security**, review private vulnerability reporting, secret scanning/push protection availability and CodeQL results. Repository settings were not changed by this PR. Dependabot PRs remain assigned to `MrZoZ`.


## Phase 2 release prerequisites (owner approval required)

The Phase 2 PR is stacked on PR #55. Do not release either PR as proof of production readiness. The expanded dependency gate currently blocks merge on the unpatched NFE `braces` advisory; see `phase-2-verification.md`. Do not suppress it or downgrade frameworks automatically. Production credentials/settings were not read or changed.

1. Approve key custody and recovery access. Provision independent random values privately: `PRIVACY_HASH_SECRET` (32+ characters) and `MFA_ENCRYPTION_KEY` (32 cryptographically random bytes encoded as 64 hex characters). Use separate values for each environment and purpose. The public development identifier key and reuse of configured integration keys are rejected. Never print values to CI, shell history, logs or a PR. No key generator was run against production.
2. Set `APP_ENV=staging`/`production` explicitly and keep `STAFF_MFA_REQUIRED=true` (the deployed default). Missing MFA encryption configuration fails startup when enforcement is on. A temporary false value is an owner-approved rollout exception, not normal operation. Factors already enrolled remain required even with that exception.
3. Stage the frontend that understands MFA, quarantine and paged comments/members. Preserve the Phase 1 dual-format login-link behavior. Provision a staging scanner, test the contract below, and approve its file-processing location and retention. Never bind production storage to a fixture.
4. Apply additive migrations `0005_staff_mfa`, `0006_upload_quarantine` and `0007_bounded_portal_collections` after Phase 1's migrations. No production rows are deleted or rewritten. The new retry columns default safely; existing pending files become unavailable on the new backend until scanned.
5. Deploy the approved backend with required keys. First-factor staff sessions have at most ten minutes to complete verification and cannot access application routes, tenant data or SSO. Existing staff sessions without proof must sign in again. Client sessions retain their previous behavior.
6. With independently verified staff identities, supervise initial enrollment in a trusted window; verify the intended owner has the authenticated session before they receive a setup seed. Staff add the manual key to their authenticator (Neuravic, SHA-1, six digits, 30 seconds), confirm a code and save eight recovery codes in an approved private password manager. Seeds and recovery codes must not be shared with support or copied into tickets. Test a separate sign-in and recovery code with staging accounts. Enrollment based only on a compromised mailbox can bind an attacker's factor; restrict initial access during this window.
7. Verify admin-only `/api/v1/admin/security-status`: correct deployed environment, dedicated privacy key, MFA required/key present, expected active/enrolled staff counts, real mail/scanner/storage readiness, pending file ages and pending/dead outbox ages. Do not expose this response through a public monitoring endpoint. Booleans indicate configuration presence, not provider health or secret quality. Configure private alerts and cron heartbeat monitoring separately.
8. Exercise real antivirus test samples in approved staging, dependency timeouts and clean/infected/pending download paths. Confirm existing file bytes, quotas and tenant checks. Verify actual browser CSP enforcement and provider integrations. Keep the client portal closed until owner acceptance.

### Staff recovery and key loss

A saved recovery code completes MFA only after email sign-in, works once and is consumed atomically. It does not disable or replace the authenticator. There is no email-only factor reset or routine admin reset endpoint. For loss of all factors, independently verify identity using the approved human recovery policy before any privileged database repair; obtain explicit approval, revoke that user's sessions and outstanding sign-in tokens, record an audit trail and supervise fresh enrollment. Do not run a blanket MFA reset. Define and rehearse this procedure with staging users before production.

Losing the encryption key prevents factor decryption. Back up its custody through the approved secrets platform; database backups alone are insufficient. Rotation/re-encryption needs its own reviewed migration and approval. Never replace the key in place as a troubleshooting shortcut. TOTP is not phishing-resistant; consider passkeys/SSO with a verified MFA policy as a later identity decision.

### Private scanner contract

`MALWARE_SCANNER` is a Cloudflare HTTP service binding to an independently provisioned scanner. The application sends `POST https://scanner.internal/scan`, raw bytes, `Content-Type: application/octet-stream` and `X-Content-SHA256` (lowercase SHA-256 hex). The synthetic hostname is internal to the binding; it is never a caller-controlled outbound URL. No filename, organization, email or access credential is sent.

The service must independently compute the digest of the complete bytes and return an HTTPS-style successful response with `Content-Type: application/json` and at most 1 KiB:

```json
{ "sha256": "digest-of-complete-input", "status": "clean" }
```

`status` may be `clean` or `infected` only. A digest mismatch, missing verdict, unavailable engine, timeout, encrypted/unsupported archive or incomplete scan must never return clean. Use an error response for uncertain results. Configure a real maintained antivirus engine, current signatures, archive/decompression/CPU/memory/time limits and private access; scanning is not implemented by checking extensions or looking for a test string. The adapter limits fetch time to ten seconds; configure the scanner's own execution deadline too. Existing uploads are at most 10 MiB. Uploaded content is signature/UTF-8 checked but is still untrusted until the engine succeeds.

The cron retries at most five eligible pending files per run, with a one-minute lease and exponential backoff capped at one hour; an index bounds due-file lookup. The stored object's size/hash must still match metadata before scanning. Download always rechecks membership and requires `clean`, including for staff. Infected files remain quarantined until an authorized deletion; no automatic evidence destruction was added. There is no public callback or client writable scan-state endpoint.

### Rollback limits for Phase 2

Keep the additive schema and keys. Rolling the backend back to PR #55 would restore pending-file downloads and remove MFA enforcement, so it is a security-impacting rollback requiring explicit owner approval and containment (for example keep the portal/storage unavailable). Do not describe it as a routine safe rollback. Retain the compatible frontend, and never drop factors or scan state to restore access. Database restore and MFA key changes remain separately approved recovery operations.
