# Threat model

How to read this: each row says what could go wrong, what stops it today, where that is in the code,
how it is tested, and what risk remains. "Evidence" paths are relative to the repository root.
Backend tests are in `Test/backend`, browser tests in `Test/e2e`.

## What we protect

| Asset | Why it matters |
|---|---|
| Staff and client accounts | An admin account controls every client's data |
| Client project data, requests, approvals, files | Confidential; must never leak between organisations |
| Enquiries from the website | Personal data (names, emails, free text) |
| The single sign-on signing key (`SSO_PRIVATE_JWK`) | Whoever holds it can impersonate any user to DARKAGENT and COOLACCESS_DXB |
| Email and chat credentials, Turnstile secret | Abuse and impersonation of Neuravic communications |

## Who might attack, and from where

| Actor | Starting point |
|---|---|
| Anonymous visitor or bot | Public pages, the contact form, sign-in form |
| Client user | A valid account in one organisation, trying to reach another |
| Someone who got a client's or staff member's mailbox | Sign-in links arrive by email |
| A malicious website | Tricking a signed-in person's browser |
| A vulnerable dependency | Supply chain |

## Trust boundaries

```
Browser  --HTTPS-->  Cloudflare edge  -->  NFE (website)         [no secrets, no direct database access]
Browser  --HTTPS-->  Cloudflare edge  -->  NBE (API)  --> D1 (data), R2 (files); rate limits are counted in D1
NBE  -->  email provider, Slack, Turnstile          (outbound, credentials held as Worker secrets)
DARKAGENT / COOLACCESS_DXB  -->  NBE /.well-known/jwks.json   (they verify our tokens, never the reverse)
```

## Threats and controls

| # | Threat | Control | Evidence | Remaining risk |
|---|---|---|---|---|
| 1 | Guessing or stealing a sign-in link | 32 random bytes; hash in auth_tokens; 15-minute expiry; claim, session and audit in one atomic batch; new links use a fragment and leave browser history before exchange | `NBE/src/modules/auth/service.ts`; `Test/backend/credential-security.test.ts`; browser portal flow | The pending mail outbox necessarily contains the raw emailed link until delivery/expiry; restrict DB access. A compromised mailbox can use the link once. |
| 2 | Finding out which emails have accounts | Always answers `202`, sends mail only for real accounts, silent per-email limit of 5 per hour | `auth.test.ts` ("does not reveal…"); `NBE/src/modules/auth/routes.ts` | Timing differences are small but not measured |
| 3 | Stealing or fixing a session | Hashed random session; HttpOnly/SameSite and production Secure/__Host- cookies; staff 12-hour maximum; clients 30-day idle/90-day absolute with cookie renewal; replacement login revokes the browser's old session; DB security-event trigger revokes sessions and links on disable/role change | `NBE/src/modules/auth/*`; migrations 0003/0004; `credential-security.test.ts` | Staff still have only email authentication; privileged MFA remains required before real clients. |
| 4 | Cross-site request forgery, including signing a visitor into an attacker's account ("login CSRF") | State-changing requests carrying a session cookie must come from an allowed `Origin`; the sign-in endpoints refuse a foreign `Origin` or `Referer` even without a cookie; JSON bodies must be sent as `application/json` (a cross-site HTML form cannot); `SameSite=Lax`; CORS only for allowed origins | `NBE/src/modules/auth/middleware.ts`, `NBE/src/lib/validate.ts`; `auth.test.ts` ("blocks… untrusted origins"), `request-hardening.test.ts` (login CSRF, JSON-only bodies); e2e portal flow | None known |
| 5 | A client reading or changing another organisation's data | Every route checks the caller's role in the organisation that owns the object; non-members get `404` so ids cannot be probed; staff roles are separate | `NBE/src/modules/orgs/policy.ts`; `orgs.test.ts`, `portal.test.ts` ("isolates tenants"), `files.test.ts` | Relies on every new route calling the policy: review each addition |
| 6 | Privilege escalation and concurrent decisions | Cannot grant above own role or remove last owner; DB protects last active staff admin, requester exclusion and authorized approvals on open requests; terminal notification joins the decision transaction | `orgs/routes.ts`, `portal/routes.ts`; migration 0004; `credential-security.test.ts`, `portal.test.ts` | Revocation cannot undo an already completed authorized operation; review new write paths. |
| 7 | Injection (SQL, script, header, spreadsheet formulas) | Parameterised queries only (Drizzle); every input validated with zod; React escapes output; email subjects strip line breaks; CSV exports neutralise formulas | `NBE/src/modules/*/schemas.ts`; `leads-admin.test.ts` (CSV) | None known |
| 8 | Spam and bots on the contact form | Honeypot field, heuristic spam score (quarantines instead of emailing), limit of 5 per hour per client, optional Cloudflare Turnstile (fails closed when configured) | `NBE/src/modules/leads/*`; `leads-intake.test.ts`; `Test/e2e/contact.e2e.mjs` | Without `TURNSTILE_SECRET` a determined bot can still submit up to the rate limit. |
| 9 | Malicious uploads | Only PDF, PNG, JPEG, WebP, text, CSV, DOCX, XLSX; 10 MB and 20 files per request; names sanitised; always served as a download with `nosniff` and `no-store`; storage keys include the organisation | `NBE/src/modules/files/routes.ts`; `files.test.ts` | **No virus scanning.** Office files can carry macros; the scan state exists (`pending`) but no scanner is connected |
| 10 | Oversized or malformed requests | Count actual streamed bytes, independently of Content-Length: JSON 256 KB, uploads 10 MB; cancel oversized sources; DB caps files at 20 despite concurrency | `NBE/src/lib/body.ts`; `api-security.test.ts`; migration 0004 | Edge flood controls and Vercel's smaller body cap still apply. |
| 11 | Forged or replayed product tokens | Ed25519 signatures; 5-minute lifetime; `aud` allow-list; `jti`; public key only at `/.well-known/jwks.json` | `NBE/src/modules/sso/*`; `sso.test.ts` | Tokens cannot be revoked inside their 5 minutes. No key rotation procedure has been exercised yet |
| 12 | Clickjacking and content sniffing on the website | `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, strict referrer policy, permissions policy, HSTS | `NFE/next.config.ts` (verified on the dev server and on the production build for `/`, `/portal`, unknown paths) | No `script-src` policy yet. Static files (images, `security.txt`) are served without these headers. Re-check on the real deployment |
| 13 | Browser caching of private data | API responses default to `Cache-Control: no-store`; only public content opts in to caching | `NBE/src/app.ts`; `health.test.ts` | None known |
| 14 | Leaking personal data through logs or the database | Domain-separated HMAC for new audit/rate identifiers; no email/IP in rate keys; no raw exceptions, message bodies or tokens in logs; route templates hide caller path segments; bounded retention rechecks eligibility atomically | `audit/audit.ts`, `lib/rate-limit.ts`, `app.ts`, `maintenance/service.ts`; security and maintenance regressions | Pending mail payloads contain personal data; old identifiers persist until retention. Hashes remain pseudonymous, not anonymous. |
| 15 | Someone denying they did something | Audit log of sign-ins, role changes, approvals, lead CSV exports (with row count), content edits and token issuing | `NBE/src/modules/audit/audit.ts`; `GET /admin/audit` | Append-only by convention in code, not enforced by the database |
| 16 | Committed credentials and leaking scanner output | Worker secrets, ignored local secret files; cross-platform source/history scan reports metadata only; pinned CI actions and CodeQL | `Security/scripts/security-check.mjs`; `.github/workflows/security.yml`; `secret-scanner.test.ts` | Pattern scanning is incomplete and does not cover issues/commit messages. Enable provider push protection where available. |
| 17 | Vulnerable dependencies | Lockfiles, `npm audit` in CI weekly and on changes (backend and frontend both gate on high or critical); weekly Dependabot updates | `Security/scripts/security-check.sh`, `.github/dependabot.yml` | A development-only advisory in `drizzle-kit`'s build tool (see `README.md`) |
| 18 | Lost/duplicate delivery and expired auth emails | Ten-second provider timeouts, stable Resend idempotency key, bounded jittered retries, fenced leases, 15-minute auth-mail expiry, scrubbed sent/dead payloads; no-provider never acknowledges delivery | `notifications/*`; `delivery-security.test.ts` | Resend deduplication has a 24-hour window; new default delivery expiry is 23 hours. Slack has no idempotency guarantee after a crash. |
| 19 | Duplicate enquiries under concurrency | DB guard enforces existing email/message 24-hour dedupe rule inside the lead/audit/outbox transaction; the loser returns the existing ID | `leads/service.ts`; migration 0004; `api-security.test.ts` | Intentional new content is a new enquiry; fixed-window abuse limits still require edge controls. |

## Not covered by this model

Physical and device security of staff, the security of Cloudflare, the email provider and GitHub themselves,
and the DARKAGENT and COOLACCESS_DXB products (they need their own models; this one only covers how they
trust the portal's sign-in).
