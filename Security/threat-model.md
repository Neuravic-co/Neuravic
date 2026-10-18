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
| 1 | Guessing or stealing a sign-in link | 32 random bytes; only a SHA-256 hash is stored; expires in 15 minutes; single use via one atomic update | `NBE/src/modules/auth/service.ts`; `Test/backend/auth.test.ts` (single use, expiry, hash only) | A link read from the mailbox works once. Email scanners that open links can consume it (user just requests another) |
| 2 | Finding out which emails have accounts | Always answers `202`, sends mail only for real accounts, silent per-email limit of 5 per hour | `auth.test.ts` ("does not reveal…"); `NBE/src/modules/auth/routes.ts` | Timing differences are small but not measured |
| 3 | Stealing or fixing a session | Random token, only its hash stored; `HttpOnly`, `SameSite=Lax`, `Secure` and `__Host-` prefix in production; staff sessions last 12 hours; clients 30 days idle, 90 days maximum; sessions deleted on logout, on disabling a user and on changing staff access | `NBE/src/modules/auth/*`; `auth.test.ts` (logout, lifetime, production cookie); `admin.test.ts` | One factor (email) protects staff accounts (see checklist) |
| 4 | Cross-site request forgery | State-changing requests carrying a session cookie must come from an allowed `Origin`; `SameSite=Lax`; CORS only for allowed origins | `NBE/src/modules/auth/middleware.ts`; `auth.test.ts` ("blocks… untrusted origins"); e2e portal flow | None known |
| 5 | A client reading or changing another organisation's data | Every route checks the caller's role in the organisation that owns the object; non-members get `404` so ids cannot be probed; staff roles are separate | `NBE/src/modules/orgs/policy.ts`; `orgs.test.ts`, `portal.test.ts` ("isolates tenants"), `files.test.ts` | Relies on every new route calling the policy: review each addition |
| 6 | Privilege escalation inside an organisation | Cannot grant a role above your own; last owner cannot be removed or demoted; requesters cannot approve their own requests | `orgs/routes.ts`, `portal/routes.ts`; `orgs.test.ts`, `portal.test.ts` | None known |
| 7 | Injection (SQL, script, header, spreadsheet formulas) | Parameterised queries only (Drizzle); every input validated with zod; React escapes output; email subjects strip line breaks; CSV exports neutralise formulas | `NBE/src/modules/*/schemas.ts`; `leads-admin.test.ts` (CSV) | None known |
| 8 | Spam and bots on the contact form | Honeypot field, heuristic spam score (quarantines instead of emailing), limit of 5 per hour per client, optional Cloudflare Turnstile (fails closed when configured) | `NBE/src/modules/leads/*`; `leads-intake.test.ts`; `Test/e2e/contact.e2e.mjs` | Without `TURNSTILE_SECRET` a determined bot can still submit up to the rate limit. |
| 9 | Malicious uploads | Only PDF, PNG, JPEG, WebP, text, CSV, DOCX, XLSX; 10 MB and 20 files per request; names sanitised; always served as a download with `nosniff` and `no-store`; storage keys include the organisation | `NBE/src/modules/files/routes.ts`; `files.test.ts` | **No virus scanning.** Office files can carry macros; the scan state exists (`pending`) but no scanner is connected |
| 10 | Oversized or malformed requests | JSON bodies limited to 256 KB; uploads to 10 MB; request ids from callers must be well-formed | `NBE/src/app.ts`; `health.test.ts` | Platform limits still apply to floods; use Cloudflare rate-limiting rules |
| 11 | Forged or replayed product tokens | Ed25519 signatures; 5-minute lifetime; `aud` allow-list; `jti`; public key only at `/.well-known/jwks.json` | `NBE/src/modules/sso/*`; `sso.test.ts` | Tokens cannot be revoked inside their 5 minutes. No key rotation procedure has been exercised yet |
| 12 | Clickjacking and content sniffing on the website | `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, strict referrer policy, permissions policy, HSTS | `NFE/next.config.ts` (verified on the dev server and on the production build for `/`, `/portal`, unknown paths) | No `script-src` policy yet. Static files (images, `security.txt`) are served without these headers. Re-check on the real deployment |
| 13 | Browser caching of private data | API responses default to `Cache-Control: no-store`; only public content opts in to caching | `NBE/src/app.ts`; `health.test.ts` | None known |
| 14 | Leaking personal data through logs or the database | No request bodies in logs; IP addresses and user agents stored only as hashes; retention job removes spam leads after 90 days, lost leads after 365 days, expired sessions and tokens daily | `NBE/src/modules/maintenance/service.ts`; `maintenance.test.ts` | The IP hash is unsalted, so it is pseudonymous, not anonymous (checklist item) |
| 15 | Someone denying they did something | Audit log of sign-ins, role changes, approvals, exports, content edits and token issuing | `NBE/src/modules/audit/audit.ts`; `GET /admin/audit` | Append-only by convention in code, not enforced by the database |
| 16 | Secrets committed to the repository | Secrets are Worker secrets; `.dev.vars` and `.env*` are ignored; automated scan on every change | `Security/scripts/security-check.sh`; `.github/workflows/security.yml` | A secret pasted into a commit message or issue is not scanned |
| 17 | Vulnerable dependencies | Lockfiles, `npm audit` in CI weekly and on changes (backend and frontend both gate on high or critical); weekly Dependabot updates | `Security/scripts/security-check.sh`, `.github/dependabot.yml` | A development-only advisory in `drizzle-kit`'s build tool (see `README.md`) |

## Not covered by this model

Physical and device security of staff, the security of Cloudflare, the email provider and GitHub themselves,
and the DARKAGENT and COOLACCESS_DXB products (they need their own models; this one only covers how they
trust the portal's sign-in).
