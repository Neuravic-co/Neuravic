# Phase 2 security verification — 23 October 2026

> Historical Phase 2 record. Current combined verification, implemented follow-ups, evidence and outstanding launch blockers are in [Phase 3 readiness](phase-3-readiness.md). Earlier gaps below describe the Phase 2 head, not the later implementation.

## Scope and review basis

Reviewed the actual PR #55 changes from `8c23a6dbb306d66514909c533c0d3039a78ecb0b` to `cebb4ea7949f2e3b9c9948440608ac40ace5fcc9`, including authentication, D1 migrations/guards, request limits, proxy trust, identifiers, notifications, retention, JWT validation, frontend credential handling and CI scripts. The local source matched the GitHub PR head. PR #55 was open/unmerged when reviewed. This branch and PR depend on `security/backend-hardening`; their base is that branch, not `main`.

No production sign-ins, attack traffic, database changes, secret changes, merges or production deployments were performed. Tests use isolated local databases, memory mail, private loopback fixtures and local production builds.

## Remaining findings and disposition

| Finding | Safe code work completed | Production configuration / approval still required |
|---|---|---|
| P2-01 Privacy key rollout | Retained required deployed HMAC key, domain separation and redaction. Reject the public development key, whitespace-only/short keys and reuse of configured integration keys. Admin status exposes presence/control booleans only. | Owner must provision independent random staging/production keys privately, confirm `APP_ENV`, origins and proxy configuration, and approve rollout. Existing identifiers are not rewritten. Rotation resets rate/correlation identities and requires a coordinated window. |
| P2-02 Staff MFA | Authenticator TOTP, AES-256-GCM encrypted seeds bound to user ID, 10-minute setup/first-factor sessions, pending seeds bound to their initiating session, one-use time steps, account-wide guessing limits, eight one-use 128-bit recovery codes stored as hashes, atomic consumption/session upgrade/audit, and a staff verification UI. Every application/SSO route is denied until verification. Old unverified staff sessions must sign in again. Existing factors remain enforced even if optional rollout is selected. | Provision a separate `MFA_ENCRYPTION_KEY` and stage enrollment/recovery with verified staff identities. Enforcement defaults on outside development. Approving any temporary `STAFF_MFA_REQUIRED=false` rollout is an owner risk decision. No factor-reset endpoint or email-only recovery bypass was added. TOTP remains phishable; first enrollment relies on a trusted email sign-in and must be controlled. |
| P2-03 Upload malware protection | All pending/infected files are quarantined for every role. Basic file signatures/UTF-8 checks, private scanner service adapter, bounded digest-bound verdicts, stored-byte hash check, retry leases/backoff, five-file cron batches, indexed pending work, audit events and attachment CSP sandbox. UI offers downloads only for clean files. | Select/approve and provision a real scanner behind `MALWARE_SCANNER`; approve data location/processing and resource limits. Keep R2 private. Without the binding, files remain pending and unavailable. Adapter tests do not prove antivirus engine detection. No public callback or human “mark clean” bypass exists. |
| P2-04 Content Security Policy | Enforced per-response random nonces, framework/root nonce propagation, strict script policy without production eval/inline exceptions, limited font/Turnstile/API origins, and no shared caching of nonce HTML. | Inspect actual staging/production headers, fonts, configured Turnstile and any approved separate API origin. Dynamic rendering replaces static HTML caching. Inline styles remain allowed for existing UI components. New third-party scripts require review. |
| P2-05 Operational controls | Staff-admin-only `/api/v1/admin/security-status` provides DB reachability, control presence, active/enrolled staff counts, quarantine age/counts and outbox age/counts. Source/history scan remains redacted. Dependency checks now cover development/test tooling and reject moderate-or-worse findings. | Configure account MFA, repository rules, WAF/Turnstile, private alert delivery, cron monitoring, backups and restore exercises. The endpoint is evidence for an authorized monitor, not a configured alert service. No secrets/settings or external notification destinations were changed. |
| P2-06 Four moderate dependency entries | Scoped Drizzle loader replacement with pinned `tsx@4.23.15` in both NBE and NFE removes the obsolete loader/core-utils/vulnerable esbuild chain without a Drizzle downgrade. Also patched NFE's newly identified `fflate` chain to 0.7.5. Both migration generators remain compatible. | Eight high NFE development dependency entries still trace to the single unpatched `braces` advisory below. Strict dependency checking intentionally fails and blocks merge. Owner review of an alternative toolchain or an upstream patch is required; this PR does not accept the risk or suppress the advisory. |
| P2-07 Growing collections | Cursor pages for members and comments; request details contain at most 100 recent comments with an older-page cursor. Frontend load-more controls preserve access to older records. Added indexes and tied-timestamp/tenant regressions. File lists remain bounded by the atomic 20-file quota; approval counts are bounded by the request approval policy. | Validate expected large staging datasets and measure load/SLOs before launch. Local correctness tests are not capacity evidence. |

## Verification of PR #55 controls

| Phase 1 findings | Actual implementation reviewed / regression evidence |
|---|---|
| S01 streamed limits | `readBoundedBody`, JSON middleware and uploads count actual bytes and reject forged/absent lengths. `api-security.test.ts`, upload tests. |
| S02 credentials | Nonce-bound atomic token/session/audit batch; guarded activation, single-use claims, role/disable revocation, session expiry/renewal. `credential-security.test.ts`, `auth.test.ts`; Phase 2 preserves these guards and adds MFA proof. |
| S03–S04 concurrent writes | Migration 0004 lead deduplication, open/authorized approvals, file quota/request guards and last active admin; conditional notifications/audits. Existing concurrent API, portal, org and credential tests pass. |
| S05–S06 delivery | Missing provider fails, bounded calls, stable Resend idempotency, lease fencing, bounded retry timing, link expiry and payload scrubbing. Delivery/outbox tests pass. Slack crash duplication remains a provider limitation. |
| S07–S08 privacy/configuration | HMAC rate/audit identifiers, explicit environment/HTTPS origins, trusted edge/proxy IP and rejection of caller forwarding claims. API/proxy/rate tests pass. New key independence tests cover rollout errors. |
| S09–S10 caches/credentials | No-store for private/cookie/error responses; fragment login links and browser history cleanup with legacy support; safe source/history scanner. API/proxy/browser/secret-scanner tests pass. |
| S11 parsing | Own-key content lookup, strict pagination cursors, bounded JWT shape/identity/lifetime/algorithm/issuer/audience validation. Existing malformed-token/content/cursor tests pass. |
| S12 CI | Action SHAs and least permissions retained; all PR/push checks and browser/CodeQL workflows retained. Separate CodeQL findings check must still be required by repository administration. |
| S13 retention | Bounded cleanup, atomic eligibility recheck preserving recovered lead notes, transactional state/audit. Existing maintenance and query-plan tests pass. |

## Dependency evidence and merge blocker

The original four NBE moderate entries were one advisory propagated through four packages, not four independent exploits: [GHSA-67mh-4wv8-2f99](https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99). The obsolete loader is replaced with the maintained tool already used by Drizzle. See [upstream tracking](https://github.com/drizzle-team/drizzle-orm/issues/5304). Keep the override until a compatible stable Drizzle release removes the dependency, then retest generation and migrations before removing it.

NFE full auditing additionally found [fflate ZIP64 parsing DoS](https://github.com/advisories/GHSA-px8p-9vwx-vf98), fixed with its patched 0.7.5 release, and [braces stack exhaustion](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), for which the advisory and registry have no patched release. The remaining eight high entries are `braces`, `micromatch`, `fast-glob`, `@next/eslint-plugin-next`, `eslint-config-next`, `vite-plugin-dynamic-import`, `vite-plugin-commonjs`, and `vinext`. These are development/build-tool dependency paths. No request-controlled glob pattern was found in application code; that narrows observed exposure but does not establish that the packages are safe. Avoid building unreviewed repositories or feeding untrusted patterns into these tools. npm proposes incompatible framework downgrades, not a safe patch. No automatic downgrade or advisory exception was applied.

Completed full lockfile audits: NBE **0**, Test **0**, NFE **8 high / 0 moderate / 0 critical**. Production-only NBE and NFE audits report **0**. `security-check.mjs --history` deliberately exits nonzero for the unresolved NFE findings. An offline `--history --secrets-only` run separately verifies source/history patterns. A passing runtime audit is not an all-dependency clean bill of health.

## Other retained risks

- Privacy export/deletion workflows and retention/legal policy need owner decisions about identity verification, tenant records, legal holds and approved deletion. No destructive data-subject operation was invented or run.
- Backups, restore access, alert destinations/thresholds and tamper-resistant external audit storage require approved infrastructure and retention/access policy. Application audit rows are not protected against a database administrator.
- SSO still publishes one key. Overlapping JWKS rotation and real consumer compatibility must be exercised in an approved staging environment before any signing-key rotation. Existing short-lived tokens remain usable until expiry after an incident.
- Pending notification bodies are sensitive until delivery/expiry; regex scanning is not exhaustive secret discovery. Historical privacy identifiers follow existing retention. Slack can duplicate after a crash.
- Independent penetration testing, real scanner efficacy, clock synchronization, production provider behavior, load capacity and recovery-time objectives remain unverified.

## Local validation

Completed results and operational steps are also recorded in `operations-runbook.md`. No production state is inferred from local tests. Completed local results:

- All **161 backend/security tests** pass across 26 files; backend type check passes. This retains Phase 1 regression coverage and adds 18 cases.
- All four functional browser suites pass: contact, portal, accessibility and staff MFA enrollment/recovery. No unexpected browser JavaScript/CSP errors. Stored markup remains escaped; login credentials leave the URL.
- Both **Next and Vinext production browser CSP tests** pass: unique/overwritten nonces, no-store HTML, nonce propagation, hydration/form validation, and parser-injected script/event handlers blocked. A DevTools-created script was replaced with actual HTML-response injection because inspector evaluation bypasses document CSP. A font connect-source issue discovered by accessibility checks was corrected and the full functional suites then passed.
- Frontend lint/type checks and both production builds pass. Existing upstream ESLint peer-range and Vinext build warnings remain; they are not security-test passes or dependency exceptions.
- All eight migrations apply to fresh local D1; schema generation reports no drift. Backend Worker dry-run succeeds (approximately 1,140 KiB / 200 KiB gzip); no remote operation ran.
- Source/history secret-pattern scan passes with redacted output. Complete dependency audit remains intentionally blocked as described above.
- An initial browser startup run timed out during concurrent local build activity; the fixture now has a bounded 60-second startup deadline and retains useful diagnostics. Final functional and production browser runs completed successfully.

Remote CI status is recorded in the pull request. The Security checks job must remain failing while its unresolved dependency blocker exists; no merge or deployment is authorized by these local results.
