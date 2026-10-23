# Hardening checklist

> Current release decision: **NO-GO**. Use [Phase 3 go-live checklist](go-live-checklist.md) for mandatory blockers, exact branch rules and owner actions. This original checklist is retained as a broader ongoing maintenance inventory.

Tick items off as they are done. "Code" means it is already built and tested; "Deploy" means you must do it
when you set up the real environment; "Gap" means it is not built yet.

## A. Before the first production deployment (all required)

- [ ] **Deploy** Set `APP_ENV=production` on the API. This turns on `Secure` and `__Host-` session cookies.
- [ ] **Deploy** Set `APP_URL` to the public site address and `ALLOWED_ORIGINS` to exactly that origin. Nothing else.
- [ ] **Deploy** Route `yourdomain/api/*` to the API Worker and everything else to the website, so the session cookie is first-party. On Vercel the website proxies `/api/*` itself (`NFE/lib/api-proxy.ts`): set `API_ORIGIN` and `API_PROXY_SECRET` on Vercel and the same value as `PROXY_SECRET` on the API. Without the secret every visitor shares one rate limit.
- [ ] **Deploy** Set a dedicated random `PRIVACY_HASH_SECRET` (32+ characters, required outside development), plus `BOOTSTRAP_ADMIN_EMAIL`, `RESEND_API_KEY`, `TURNSTILE_SECRET`, `SSO_PRIVATE_JWK`, and `SLACK_WEBHOOK_URL` if used. Never put secrets in `wrangler.jsonc`. Confirm the proxy credential is at least 32 characters; rotation needs separate approval.
- [ ] **Deploy** Follow `operations-runbook.md`: dual-format NFE first, additive migrations next, new NBE last. Verify mail delivery; login links are never logged and missing providers leave jobs pending.
- [ ] **Deploy** Create the SSO signing key with `npm run sso:keygen` in `NBE`, store the private value only as the secret, and give DARKAGENT and COOLACCESS_DXB the JWKS URL.
- [ ] **Deploy** Turn on Cloudflare Turnstile: set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` on the website and `TURNSTILE_SECRET` on the API.
- [ ] **Deploy** Set up the sending email domain: SPF, DKIM and DMARC records. Sign-in links depend on delivery.
- [ ] **Deploy** Add Cloudflare rate-limiting rules in front of the API for `/api/v1/auth/*` and `/api/v1/leads` (these add to the in-app limits).
- [ ] **Deploy** Bind an R2 bucket (`BUCKET`) only when you are ready to accept client files, and keep the bucket private.
- [ ] **Deploy** Enable two-factor authentication on the Cloudflare, GitHub and email-provider accounts. Protect `main` (required reviews and the CI checks).
- [ ] **Deploy** Run `./Security/scripts/security-check.sh` and the `Test/` suites against the staging environment. Confirm the real deployment sends the website security headers (`curl -I https://yourdomain/portal`). They were verified on a local production build in October 2026; static files (images, `security.txt`) do not carry them.
- [ ] **Deploy** Confirm D1 point-in-time recovery (Time Travel) is available for your plan and do one test restore.

## B. Before real clients log in

- [x] **Code** Staff authenticator MFA, encrypted seeds, single-use recovery and server-side step-up enforcement.
- [ ] **Deploy** Provision the independent MFA key and supervise enrollment/recovery; enforcement defaults on outside development. See the Phase 2 runbook.
- [x] **Code** Pending/infected files are quarantined for every role; a private scanner adapter, digest checks and bounded cron retries are implemented.
- [ ] **Deploy** Provision and validate a real antivirus engine through the private binding. Until then downloads remain unavailable.
- [ ] Independent penetration test of the portal and API.
- [ ] Review the privacy notice against what is stored (see the retention windows in `NBE/src/modules/maintenance/service.ts`) with counsel, including UAE and Egypt data-protection rules.

## C. Soon after launch

- [x] **Code** New audit IP/UA and rate-limit identities use domain-separated HMAC with a dedicated key. Older rows remain subject to existing retention; this is pseudonymization, not anonymization.
- [x] **Code** Actual streamed request/upload limits, atomic login and security-event revocation, race-safe enquiries/approvals/file quotas, bounded retention and safe outbox retries have automated regressions (see the audit).
- [x] **Code** Enforced nonce-based script CSP, source restrictions and private/no-store HTML on both frontend runtimes. Verify configured providers in staging before release.
- [x] **Code** Limited recent-auth account copy, reviewed privacy intake/history and separate staff-admin review/audit; portal integration and regressions.
- [ ] **Owner / staging** Approve and exercise complete privacy export/erasure fulfillment, tenant confidentiality, legal holds, deadlines and retention. Intake/status changes do not perform erasure.
- [ ] **Gap (P2)** Alerts: spike in failed sign-ins, outbox jobs marked `dead`, sudden rise in 5xx, first sign-in of a staff account from a new country.
- [ ] **Gap (P2)** Nightly export of the database to a separate bucket, and a restore drill every quarter.
- [ ] **Gap (P3)** Make the audit log tamper-evident at the database level (write-only role, or hash chain).
- [x] **Code** Public-only overlapping JWKS, switch/cached-overlap/expiry/retirement tests and configuration validation.
- [ ] **Owner / staging** Exercise actual consumer SSO key rotation before changing production keys; see `production-configuration.md`.

## D. Every month

- [ ] Run `./Security/scripts/security-check.sh` (it also runs weekly in CI) and act on findings.
- [ ] Merge the weekly Dependabot pull requests after the CI checks pass. Major upgrades (`zod` 4, `typescript` 7) need a deliberate plan.
- [ ] Renew `NFE/public/.well-known/security.txt` (the `Expires` date) at least every six months.
- [ ] Review staff accounts (`GET /api/v1/admin/users?staff=true`) and remove people who left.
- [ ] Review the audit log for unexpected exports, role changes and token issuing.

- [ ] **Merge blocker** Resolve the unpatched NFE development `braces` advisory without an unsafe framework downgrade. The expanded dependency gate reports eight high transitive entries and deliberately fails; see `phase-2-verification.md`.
