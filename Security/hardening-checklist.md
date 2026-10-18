# Hardening checklist

Tick items off as they are done. "Code" means it is already built and tested; "Deploy" means you must do it
when you set up the real environment; "Gap" means it is not built yet.

## A. Before the first production deployment (all required)

- [ ] **Deploy** Set `APP_ENV=production` on the API. This turns on `Secure` and `__Host-` session cookies.
- [ ] **Deploy** Set `APP_URL` to the public site address and `ALLOWED_ORIGINS` to exactly that origin. Nothing else.
- [ ] **Deploy** Route `yourdomain/api/*` to the API Worker and everything else to the website, so the session cookie is first-party.
- [ ] **Deploy** Bind a **KV namespace** (`KV`) to the API. Without it the sign-in and contact rate limits only count per server instance and are easy to bypass.
- [ ] **Deploy** Set the secrets with `wrangler secret put`: `BOOTSTRAP_ADMIN_EMAIL`, `RESEND_API_KEY`, `TURNSTILE_SECRET`, `SSO_PRIVATE_JWK`, and `SLACK_WEBHOOK_URL` if used. Never put them in `wrangler.jsonc`.
- [ ] **Deploy** Create the SSO signing key with `npm run sso:keygen` in `NBE`, store the private value only as the secret, and give DARKAGENT and COOLACCESS_DXB the JWKS URL.
- [ ] **Deploy** Turn on Cloudflare Turnstile: set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` on the website and `TURNSTILE_SECRET` on the API.
- [ ] **Deploy** Set up the sending email domain: SPF, DKIM and DMARC records. Sign-in links depend on delivery.
- [ ] **Deploy** Add Cloudflare rate-limiting rules in front of the API for `/api/v1/auth/*` and `/api/v1/leads` (these add to the in-app limits).
- [ ] **Deploy** Bind an R2 bucket (`BUCKET`) only when you are ready to accept client files, and keep the bucket private.
- [ ] **Deploy** Enable two-factor authentication on the Cloudflare, GitHub and email-provider accounts. Protect `main` (required reviews and the CI checks).
- [ ] **Deploy** Run `./Security/scripts/security-check.sh` and the `Test/` suites against the staging environment. Confirm the real deployment sends the website security headers (`curl -I https://yourdomain/portal`). They were verified on a local production build in October 2026; static files (images, `security.txt`) do not carry them.
- [ ] **Deploy** Confirm D1 point-in-time recovery (Time Travel) is available for your plan and do one test restore.

## B. Before real clients log in

- [ ] **Gap (P1)** Second factor for staff: passkeys or an authenticator app. Today a stolen mailbox is enough to become a staff admin.
- [ ] **Gap (P1)** Virus scanning for uploaded files (the `scan_state` column and the download block for `infected` files already exist; connect a scanner and set the state).
- [ ] Independent penetration test of the portal and API.
- [ ] Review the privacy notice against what is stored (see the retention windows in `NBE/src/modules/maintenance/service.ts`) with counsel, including UAE and Egypt data-protection rules.

## C. Soon after launch

- [ ] **Gap (P2)** Hash IP addresses and user agents with a secret key (HMAC) instead of plain SHA-256, so the values cannot be brute-forced back to addresses.
- [ ] **Gap (P2)** A full Content-Security-Policy with `script-src` on the website (needs nonces for the framework's inline scripts and an allow-list for the font provider and Turnstile).
- [ ] **Gap (P2)** Endpoints and a runbook for data-subject requests (export and delete a person's data).
- [ ] **Gap (P2)** Alerts: spike in failed sign-ins, outbox jobs marked `dead`, sudden rise in 5xx, first sign-in of a staff account from a new country.
- [ ] **Gap (P2)** Nightly export of the database to a separate bucket, and a restore drill every quarter.
- [ ] **Gap (P3)** Make the audit log tamper-evident at the database level (write-only role, or hash chain).
- [ ] **Gap (P3)** Exercise the SSO key rotation: publish two keys in the JWKS, switch `SSO_KEY_ID`, retire the old key.

## D. Every month

- [ ] Run `./Security/scripts/security-check.sh` (it also runs weekly in CI) and act on findings.
- [ ] Merge the weekly Dependabot pull requests after the CI checks pass. Major upgrades (`zod` 4, `typescript` 7) need a deliberate plan.
- [ ] Renew `NFE/public/.well-known/security.txt` (the `Expires` date) at least every six months.
- [ ] Review staff accounts (`GET /api/v1/admin/users?staff=true`) and remove people who left.
- [ ] Review the audit log for unexpected exports, role changes and token issuing.
