# 04 Security

The security policy, the threat model, the controls in the code, the production settings and the go-live checklist, in one place.
Part of the documentation set: [01 Architecture](01-Architecture.md), [02 Getting started](02-Getting-Started.md), [03 API reference](03-API.md), **04 Security** (this file), [05 Operations](05-Operations.md).

## 1. Reporting a vulnerability

Please report problems privately, not in a public issue.

- Use GitHub's **Report a vulnerability** button on the repository's Security tab, or
- email **neuravic2026@gmail.com** with the subject `security`.

Include what you found, how to reproduce it and the impact you think it has. Do not access other people's data, disrupt the service or run automated attacks against the production site.

| Step | Target |
|---|---|
| We acknowledge your report | within 3 working days |
| We tell you whether it is confirmed | within 10 working days |
| We fix confirmed high and critical issues | within 30 days |

In scope: the website (`nfe`), the portal at `/portal` and the API (`nbe`, behind its gateway) under `/api/v1`. Out of scope: third-party services we use (hosting and email providers), social engineering of staff and denial-of-service testing. Only the current `main` branch and the production deployment are supported. These targets are proposals; confirm them before publishing. A dedicated `security@` mailbox on the company domain should replace the address above.

## 2. What we protect and from whom

| Asset | Why it matters |
|---|---|
| Staff and client accounts | An admin account controls every client's data |
| Client projects, requests, approvals and files | Confidential; must never leak between organisations |
| Website enquiries | Personal data: names, emails, free text |
| The single sign-on signing key (`SSO_PRIVATE_JWK`) | Whoever holds it can impersonate any user to other Neuravic products |
| Email and Slack credentials, `PROXY_SECRET`, `MFA_ENCRYPTION_KEY`, `PRIVACY_HASH_SECRET` | Abuse and impersonation of Neuravic communications, and access to staff factors |

| Actor | Starting point |
|---|---|
| Anonymous visitor or bot | Public pages, the contact form, the sign-in and sign-up forms |
| Client user | A valid account in one organisation, trying to reach another |
| Someone with a stolen mailbox or password | Sign-in links arrive by email; passwords can be guessed or reused |
| A malicious website | Tricking a signed-in person's browser |
| A vulnerable dependency | Supply chain |

Trust boundaries: the browser talks only to the website (`nfe`). The website's server-side proxy talks to the backend gateway. The gateway reaches the services, and only the services talk to MySQL, the file server's volume and the email provider; they hold all secrets. The website holds no database access and no user secrets. In Kubernetes the network policies enforce these paths (see below).

## 3. Controls

| Area | How it is handled | Where |
|---|---|---|
| Passwords | scrypt (N=16384, r=8, p=1), random 16-byte salt per password, compared in constant time. Stored in a separate `user_passwords` table that no endpoint reads except login. Login does the same work for unknown emails, so timing does not reveal accounts | `nbe/core/src/lib/password.ts`, `modules/auth/password.ts` |
| Account enumeration | Login returns the same 401 for a wrong password and an unknown email. Link and sign-up requests always answer `202`. Per-email rate limits are silent | `modules/auth/*` |
| One-time links | 32 random bytes, only the hash is stored, 15 minutes, single use, claimed with the session in one atomic transaction. Links carry the token in the URL fragment so it never reaches a server log or Referer header | `modules/auth/service.ts` |
| Sessions | Random 256-bit token, only its SHA-256 is stored. Cookie is `HttpOnly`, `SameSite=Lax`, and `Secure` with the `__Host-` prefix outside development. Clients: 30 days idle, 90 days absolute. Staff: 12 hours. Signing in by link replaces the browser's old session. Disabling a user or changing a role revokes sessions | `modules/auth/service.ts`, `middleware.ts` |
| Staff MFA | Authenticator (TOTP) with one-time recovery codes. Seeds are AES-GCM encrypted with `MFA_ENCRYPTION_KEY`, bound to the user id. Required outside development. A session without proof is limited to the sign-in and MFA endpoints and expires | `modules/auth/mfa.ts` |
| Cross-site requests | Writes carrying a cookie must come from an allowed `Origin`; `/auth/*` refuses a foreign `Origin` or `Referer` even without a cookie (blocks login CSRF); JSON bodies must be `application/json`; `SameSite=Lax`; CORS lists only `ALLOWED_ORIGINS` | `modules/auth/middleware.ts`, `app.ts` |
| Authorisation | Every route checks the staff role or the caller's role in the organisation that owns the object. Non-members get `404`, so ids cannot be probed. Nobody can grant above their own role; the last owner and the last staff admin cannot be removed (also enforced by database triggers) | `modules/orgs/policy.ts`, `sql/001_init.sql` |
| Input | Every body is validated with Zod; queries are parameterised (Drizzle); React escapes output; email subjects strip line breaks; CSV exports neutralise spreadsheet formulas | `modules/*/schemas.ts` |
| Request size | Streamed byte counting, independent of `Content-Length`: JSON 256 KB, uploads 10 MB, at most 20 files per request (also a database guard) | `lib/body.ts` |
| Rate limiting | Database-backed fixed windows per IP and per account (see the table in [03 API reference](03-API.md)). Behind the website proxy the visitor address is trusted only when signed with `PROXY_SECRET` | `lib/rate-limit.ts` |
| Contact spam | Honeypot field, spam scoring that quarantines instead of emailing, 5 per hour per client, duplicate detection inside the transaction. There is no third-party captcha | `modules/leads/*` |
| Browser protection | Content-Security-Policy with a fresh nonce on every page (`strict-dynamic`, no `unsafe-eval` in production), `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, strict referrer and permissions policies, HSTS, `no-store` on portal pages and on every HTML response | `nfe/proxy.ts`, `nfe/lib/csp.ts`, `nfe/next.config.ts` |
| Uploads | Allow-listed types, sanitised names, storage keys include the organisation, always served as an attachment with `nosniff`. Files stay quarantined until the scanner returns a verdict bound to the file's SHA-256; any error, timeout or mismatch keeps them quarantined | `modules/files/*` |
| Single sign-on | Ed25519 signatures, 5 minute lifetime, audience allow-list, `jti`, public key only at `/.well-known/jwks.json` | `modules/sso/*` |
| Audit | Sign-ins, logins, registrations, role changes, approvals, CSV exports, content edits and token issuing are recorded with pseudonymous (HMAC) IP and user-agent identifiers | `modules/audit/audit.ts` |
| Privacy | Account data copy, export and erasure requests reviewed by a second admin, retention windows enforced by the maintenance job (see [05 Operations](05-Operations.md)) | `modules/privacy/*`, `modules/maintenance/*` |
| Email delivery | Outbox with retries and 10 second provider timeouts; auth emails expire with their link; delivered and dead messages are scrubbed | `modules/notifications/*` |
| Errors and logs | One error shape; unknown errors become a generic 500; logs carry request ids, route templates and no tokens, bodies or email addresses | `app.ts`, `lib/logger.ts` |
| Database accounts | Two MySQL accounts: `neuravic_app` (SELECT, INSERT, UPDATE, DELETE on the `neuravic` database only) runs every service; `neuravic_migrator` (adds CREATE, ALTER, DROP, INDEX, REFERENCES, TRIGGER) runs only the migration job. Neither can grant rights or touch another database. The services cannot change the schema | `database/scripts/create-access.mjs` |
| Service isolation | Each service runs as its own process. In Kubernetes: a default-deny network policy, then only ingress to website, website to gateway, services to each other and to MySQL, and HTTPS out; non-root user, read-only filesystem, no capabilities, seccomp, no service-account token, "restricted" pod standard on the namespace | `deployment/helm/neuravic/templates/networkpolicy.yaml`, `deployment/k8s/namespace.yaml` |
| Images | Built from a small base, run as the `node` user, secrets never copied in (`.dockerignore`), `.env` files and local data excluded | `deployment/docker/*`, `.dockerignore` |
| Secrets and dependencies | Secrets only in git-ignored environment files or Kubernetes Secrets (the repository `.gitignore` blocks `.env`, keys, certificates, uploads, database data and real Helm values); a scan of source and history for secrets, plus `npm audit` on both projects, runs weekly and on every change; Dependabot proposes weekly updates; CodeQL analyses the code | `security/scripts/security-check.*`, `.github/workflows` |

## 4. Threats and what is left

| Threat | Stopped by | Remaining risk |
|---|---|---|
| Guessing or stealing a sign-in link | Random hashed tokens, 15 minutes, single use, fragment links | A queued email contains the raw link until it is sent or expires; limit database access. A hijacked mailbox can use a link once |
| Guessing or reusing passwords | scrypt, per-IP and per-email limits, equal-work login | No breached-password check, no lockout notification and no password reset by email yet |
| Session theft or fixation | Hashed server-side sessions, HttpOnly, `__Host-` cookie, rotation on login, short staff sessions | A stolen live cookie works until it expires or is revoked |
| Cross-site request forgery, including login CSRF | Origin checks, JSON-only bodies, SameSite | None known |
| A client reading another organisation's data | Per-object role checks, `404` for non-members | Every new route must call the policy; review each addition |
| Privilege escalation and races | Role ceilings and database triggers for last owner, last admin, approver rules, file limits | Already completed operations cannot be undone by revoking access |
| Injection | Parameterised queries, Zod, escaped output, CSV neutralising | None known |
| Spam and bots | Honeypot, scoring, rate limits | A determined bot can submit up to the limit; add a captcha if abuse appears |
| Malicious uploads | Type allow-list, quarantine, scanner verdict bound to the SHA-256, attachment-only downloads | The application does not detect malware itself; production needs a real scanner service. Without one, uploads stay quarantined |
| Forged or replayed product tokens | Ed25519, 5 minutes, audience, `jti` | Tokens cannot be revoked within their 5 minutes |
| Clickjacking, sniffing, caching of private pages | CSP, frame and sniffing headers, `no-store` | Inline styles are still allowed |
| Personal data in logs or the database | HMAC identifiers, no emails or IPs in logs, retention jobs | Pseudonymous is not anonymous; queued emails hold personal data until sent |
| Denying an action | Audit log | Rows are mutable by a database administrator; export them to a separate tamper-resistant store |
| Leaked credentials | Ignored env files, secret scan of source and history | Pattern scanning is incomplete; enable push protection at the Git host |
| Vulnerable dependencies | Lockfiles, weekly audit, Dependabot | New advisories appear between scans |

Not covered: physical and device security of staff, the security of the hosting, email and Git providers themselves, and other Neuravic products (they need their own models; this one covers only how they trust the portal's sign-in).

## 5. Production configuration

Use separate secrets for staging and production. Never paste secrets, tokens, exports or customer data into tickets, chats or logs. Record who owns each secret, when it was created and rotated, and where the recovery copy lives. Use individual, MFA-protected accounts; no shared credentials. Rotate after any exposure and on an owner-approved schedule, and remove the old value only after the new one is verified.

| Setting | Required value |
|---|---|
| `APP_ENV` | `production`. Turns on `Secure` cookies, staff MFA and the checks below |
| `APP_URL`, `ALLOWED_ORIGINS` | Exact HTTPS website origins (no paths, no credentials). The server refuses to start otherwise |
| `PRIVACY_HASH_SECRET` | Independent random value, 32+ characters, different from every other secret. Required outside development. Rotating it changes the pseudonymous identifiers, so old audit identifiers no longer correlate with new ones |
| `MFA_ENCRYPTION_KEY` | 32 random bytes as 64 hex characters, independent of other secrets, backed up separately from the database. Do not simply replace it: existing seeds become unreadable. Losing it forces supervised re-enrolment of all staff |
| `STAFF_MFA_REQUIRED` | Leave unset (defaults to `true` outside development) |
| `PROXY_SECRET` / `API_PROXY_SECRET` | The same independent 32+ character value on every backend service, the gateway and the website; the visitor address is trusted only when it arrives with this secret |
| `RESEND_API_KEY` | A sending domain with SPF, DKIM and DMARC. Without it invitations and link sign-in cannot reach people |
| `MALWARE_SCANNER_URL` | A private scanner service (see below). Without it uploads stay quarantined |
| `SSO_PRIVATE_JWK`, `SSO_KEY_ID`, `SSO_AUDIENCES` | An Ed25519 key and the allowed product audiences, when other products use single sign-on |
| `MAINTENANCE_MODE` | `false`. Set to `true` only to contain an incident or during a recovery |

Generate values with `node security/scripts/generate-secrets.mjs`. Put the API and the website behind HTTPS, run MySQL on a private network with a least-privilege user, keep the uploads folder on a private volume that is never served directly, and turn on two-factor authentication on the Git host, the hosting account and the email provider.

### Staff accounts and MFA

1. Create staff through `POST /admin/staff`; verify identity and email ownership out of band before first sign-in.
2. At first sign-in the staff member enrols an authenticator, confirms a code and stores the recovery codes privately. A recovery code works once and does not disable MFA.
3. Losing both the authenticator and the codes needs a supervised recovery by two accountable people with independent identity evidence. There is no email-only factor reset. Removing an enrolled factor revokes that person's sessions and links.
4. TOTP can be phished; passkeys or an identity provider are a future option.

### File scanner contract

The API sends the file's bytes with `POST` to `MALWARE_SCANNER_URL`, as `application/octet-stream`, with an `X-Content-SHA256` header, and sends no filename, organisation or email. The scanner must hash the complete bytes itself and answer bounded JSON of the form `{ "sha256": "<same digest>", "status": "clean" }` (or `"infected"`). Anything else (unknown, partial, encrypted, over limits, timeout, digest mismatch) leaves the file quarantined. The scanner needs a maintained engine with current signatures and limits for archives, nesting, CPU, memory and time. A scanner outage shows up as growing pending age and never as a clean verdict. Never mark files clean in the database by hand.

### Privacy requests

The portal gives a recent-sign-in limited account copy and lets people file export or erasure requests. A staff admin who is not the subject triages them: set the review reference and attest `identityVerified` and `retentionReviewed` before moving a request from `pending` to `in_review` to `fulfilled` or `declined`. The endpoint records the decision; it does not build a full legal export or delete data. Do that in an approved private system, review other tenants' data, legal holds and backup expiry first, and update the privacy notice and the retention windows (section 5 of [05 Operations](05-Operations.md)) before accepting real requests.

## 6. Go-live checklist

Nothing below is approved or done until the owner records it.

**Platform**
- [ ] HTTPS in front of the website and the API; HSTS verified on the real host
- [ ] `APP_ENV=production`; all required secrets set and independent; no development secrets
- [ ] Response headers checked on the home page, `/portal`, `/portal/verify` and an error page: CSP nonce differs per request, HTML is `no-store`, no CDN serves a shared nonce
- [ ] Only the website is exposed by the ingress; the gateway and services are reachable only inside the cluster (network policies on); forged forwarding headers do not change the visitor identity
- [ ] MySQL private; the app runs as `neuravic_app` and migrations as `neuravic_migrator`; automated encrypted backups; one tested restore

**Accounts**
- [ ] Bootstrap admin created, MFA enrolled, recovery codes stored; every staff member enrolled
- [ ] Real email works: sign-up link, invitation, contact acknowledgement; SPF, DKIM, DMARC pass
- [ ] Registration, login, logout and session expiry tested with a test account in production-like settings

**Data and files**
- [ ] A real scanner is connected; clean, infected, oversized and unreachable cases tested; pending files cannot be downloaded
- [ ] Privacy notice matches what is stored and the retention windows; the privacy-request process has an owner and a response deadline

**Monitoring and process**
- [ ] Alerts for sustained 5xx, abnormal 401 and 429, dead or old outbox messages, scanner failures, no successful maintenance run for 15 minutes, backup older than 24 hours
- [ ] Audit log exported to a separate store; incident owner and escalation path named
- [ ] `./security/scripts/security-check.sh` passes; CodeQL clean; Dependabot assigned to the owner
- [ ] Branch protection on `main`: pull request required, status checks (frontend checks, security checks, CodeQL) required, approvals required

## 7. Known gaps

- No password reset by email and no breached-password check yet.
- No captcha on the public forms; protection is rate limits, a honeypot and scoring.
- The malware scanner is an external service you must provide; the development scanner marks everything clean and runs only in development.
- Audit rows can be changed by a database administrator.
- Inline styles are still allowed by the CSP.
- The integration tests need running services and a development database; they refuse to clear data outside development, but run them only against a local stack.
