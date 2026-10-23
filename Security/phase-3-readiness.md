# Phase 3 security readiness — 23 October 2026

**Recommendation: NO-GO.** Safe code improvements and local verification are complete, but the dependency gate remains red and mandatory production controls lack staging/operational evidence. No residual risk has been accepted by the owner. This report is not a production-readiness certification.

No production credentials, production data, repository administration settings, merges or production deployments were changed. Tests use local fixture databases, generated ephemeral keys, a private loopback mailbox, simulated scanner responses and local browser builds. The malware engine and external SSO consumers were not exercised live.

## Review basis and dependencies

Reviewed the actual GitHub patches and matching source for both unmerged PRs, not just their summaries:

| PR | Reviewed head | Actual changed files | Base / evidence |
|---|---|---|---|
| [#55](https://github.com/Neuravic-co/Neuravic/pull/55) | `cebb4ea7949f2e3b9c9948440608ac40ace5fcc9` | 74 | `main` at `8c23a6dbb306d66514909c533c0d3039a78ecb0b`; backend, frontend/browser, Security, CodeQL analysis and separate CodeQL findings checks succeeded at that head. Its older dependency gate covered less tooling. |
| [#56](https://github.com/Neuravic-co/Neuravic/pull/56) | `0f0c3dd234bb51fbd4cdfccd71e28e504bbfc9d7` | 61 | `security/backend-hardening`; backend, frontend/browser and both CodeQL checks succeeded. Expanded Security checks failed for eight high NFE dependency entries. |

Phase 3 starts from the exact #56 head on owner-approved `security/phase-3-production-readiness`, targeting `security/phase-2-verification-hardening`. It depends on #56 and transitively #55. Review and approve in dependency order; retarget/retest against the eventual main integration before release. No merge is authorized by this report. Current Phase 3 remote checks and links are recorded in its PR; local success does not establish remote success.

## Findings and disposition

| ID / finding | Safe code resolution and evidence | Outstanding requirement / decision |
|---|---|---|
| P3-01 Eight `braces` entries | Traced exact installed paths, inspected callers, checked registry/upstream fixes and added a bounded reproduction. No unsafe downgrade, hidden override or advisory suppression. | **Unresolved merge/release blocker.** Upstream patch or a reviewed compatible toolchain change, followed by full checks. No owner exception exists. |
| P3-02 MFA recovery and stale proof | Session proof now requires a currently enabled factor and a verification time at/after enrollment. Migration 0009 revokes all sessions and outstanding email links on supervised factor removal/reset. Fresh TOTP plus an already verified session can replace recovery codes; email or a recovery code alone cannot authorize replacement. | Private independent MFA key, controlled first enrollment, staff roster coverage, clock monitoring, identity-verified dual-control recovery and real key-backup drill. No email-only reset endpoint. |
| P3-03 Scanner failures and object replacement | Entire binding call/verdict stream has a deadline, even if a binding ignores abort. Cancel stalled reads; reject coerced verdicts. Downloads rehash bounded stored bytes and use database MIME; changed bytes return to quarantine before any content is served. | Provision a maintained antivirus engine and validate detection, signature updates, archive/resource limits and outage alerts. Private R2 and scanner access/data location need owner approval. |
| P3-04 CSP functionality | Both local production runtimes enforce unique nonces, strict-dynamic, no production eval/inline-script exceptions and no-store HTML. Extended browser tests exercise the real dynamic challenge loader/callback/frame using an intercepted provider fixture and block parser-injected script/event handlers. | Actual hosting/CDN headers, provider behavior, separate API origins and CSP monitoring need staging verification. The provider fixture does not prove real Turnstile verification. Inline styles remain allowed for current components. |
| P3-05 Operational containment | `MAINTENANCE_MODE=true` rejects API application requests with 503/no-store/Retry-After; health/version remain available. Scheduled delivery, scanning and retention pause too. Caller headers cannot change the mode. | Owner-controlled cutover, drain in-flight work, provider/edge containment and external SSO-token expiry. This flag does not cancel work already executing or revoke issued JWTs. |
| P3-06 Privacy workflow | Recent-auth limited account download; bounded own request history; idempotent concurrent export/erasure intake; separate fresh staff-admin review, opaque case reference, identity/retention attestations, compare-and-set state and atomic audit. Portal integration and indexes added. | **Full legal export and erasure are supervised operations, not automatically completed by intake/status changes.** Owner must approve identity checks, legal holds, tenant confidentiality, fulfillment, deadlines and retention; no business/audit data silently deleted. |
| P3-07 SSO rotation | Validated public-only overlapping JWKS via `SSO_PUBLIC_JWKS`, bounded key set, unique IDs, conflict/private-key rejection and whitelist output. Generated-key tests cover prepublication, switch, cached overlap, expiry, retirement and ambiguous IDs. | Actual DARKAGENT/COOLACCESS_DXB cache, issuer, audience and key-rotation behavior must be tested in approved staging before changing a real private key. |
| P3-08 CI and branch rules | Checkout no longer persists credentials. Pinned Actions, read-only defaults and job-scoped CodeQL write retained. All workflows handle merge groups. Added isolated D1 recovery to NBE CI and challenge-enabled CSP fixtures to NFE CI. | `main` returned `protected:false`, protection disabled, no required contexts on 23 October. Owner must apply the exact settings below. No settings were changed. |
| P3-09 Migrations and recovery | All ten migrations applied on local D1; populated pre-hardening upgrade and constraint tests; no Drizzle schema drift. Schema-first backup/restore preserves migration ledger/data, checks local SQLite integrity/FKs and rehearses credential/outbox containment and factor revocation after restore. | Real provider Time Travel/encrypted backup restore, MFA-key custody, RPO/RTO, R2 consistency and staging recovery remain mandatory. No destructive down migration is proposed. |

## Dependency investigation

The eight high entries are one root advisory propagated through tooling: [GHSA-vfj7-8cjw-p6xm / CVE-2026-93687](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). Advisory-affected `braces` versions are `<=3.0.3`; **no patched version was listed or published when checked on 23 October**. Latest registry `braces` was 3.0.3. The [upstream issue](https://github.com/micromatch/braces/issues/70) includes a maintainer dispute about usage, which is not a fix or an accepted exception.

Exact installed paths:

```text
eslint-config-next@16.4.2
└─ @next/eslint-plugin-next@16.4.2
   └─ fast-glob@3.3.1
      └─ micromatch@4.0.8
         └─ braces@3.0.3

vinext@1.2.1
└─ vite-plugin-commonjs@0.10.4
   └─ vite-plugin-dynamic-import@1.6.0
      └─ fast-glob@3.3.3
         └─ micromatch@4.0.8 (deduplicated)
            └─ braces@3.0.3 (deduplicated)
```

The eight affected audit nodes are `braces`, `micromatch`, `fast-glob`, `@next/eslint-plugin-next`, `eslint-config-next`, `vite-plugin-dynamic-import`, `vite-plugin-commonjs` and `vinext`. Registry latest micromatch 4.0.8 / fast-glob 3.3.3 / eslint-config-next 16.4.2 / commonjs 0.10.4 do not remove the root. Available vinext 1.3.0 still depends on commonjs `^0.10.4`; upgrading it alone is not remediation. npm's suggested eslint-config-next 14.2.35 and vinext 0.0.15 are breaking downgrades and were rejected.

Actual callers: the Next ESLint helper passes configured `settings.next.rootDir` to fast-glob (this repo has no custom glob rootDir); the dynamic-import plugin derives glob patterns from source import expressions/extensions/importer paths during compilation. No request-controlled glob was found in application code. Observed exposure is synchronous build/lint tooling denial of service from crafted configuration/source/patterns, including untrusted contributions. That narrows observed runtime exposure; it does not prove the tools or built artifacts universally safe. Continue isolated time-limited CI, do not expose production credentials to PR builds and do not process unreviewed external glob patterns.

`node Security/scripts/verify-braces-exposure.mjs` runs a child with a 64 MiB heap, default Node stack, five-second deadline and a 9,999-character nested-brace pattern below the package's 10,000-character cap. On Node 22.14.0 / braces 3.0.3, benign expansion passed and **compile, stringify and expand each threw stack-exhaustion RangeError**. This is bounded local evidence, not production exploit testing. It deliberately exits 1; it is not an advisory bypass.

Fresh full lockfile audits: **NBE 0, Test 0, NFE 8 high / 0 moderate / 0 critical**. Production-only NBE and NFE: **0**. Source/history pattern scan passes separately. The full Security gate deliberately exits 1. The Phase 2 Drizzle loader/tsx override still removes the original four moderate esbuild-chain entries, and patched fflate remains locked. No dependency was downgraded in Phase 3.

## Security verification and realistic attacks

| Area | Tested behavior / evidence |
|---|---|
| MFA enrollment/authentication | Independent RFC 6238 vectors; all staff surfaces blocked before MFA; pending seed encrypted and bound to initiating session; wrong session cannot obtain/confirm it; ten-minute first-factor expiry; invalid, out-of-window, cross-origin and nonstaff requests rejected; account-wide guessing limit; active factors cannot be overwritten. `mfa.test.ts`, browser MFA suite. |
| MFA replay/recovery | Concurrent TOTP and recovery use yield one success; recovery hashes never reveal codes; failed session upgrade rolls consumption back; factor ciphertext cannot transfer users; enabled factor remains enforced in optional rollout; reset/removal revokes sessions/links; unverified session/recovery proof/reused TOTP cannot replace recovery codes; replacement invalidates old codes. No unauthenticated account-reset bypass. |
| Uploads/scanner | Missing or forged lengths, over-limit bodies, MIME/signature/UTF-8 mismatch, quota races, cross-tenant access, all-role pending/infected denial, scanner exceptions/unavailable/malformed/oversized/wrong-digest/non-enum/stalled verdicts, lease/backoff, changed stored bytes before scan and after clean verdict. `files.test.ts`, `scanner.test.ts`, API security tests. ZIP signature acceptance is only container validation; engine inspection remains essential. |
| CSP/UI | Next and Vinext production browser tests: caller nonce override, fresh nonce per request, framework/root nonce propagation, no-store, hydration/validation, intercepted challenge loader/frame/callback, zero unexpected CSP/runtime violations and blocked HTML-response injected scripts/handlers. Functional contact, tenant portal, privacy request/download, accessibility and staff MFA suites preserve existing behavior. |
| Privacy/SSO | No other users, credentials or internal records in limited download; recent auth/origin/subject allow-list; concurrent request dedup/single audit; distinct admin/attestation/state conflict checks; own history hides review references. SSO tests exercise overlap/expiry/retirement and reject private/conflicting/duplicate keys. `privacy.test.ts`, `sso-rotation.test.ts`, existing SSO/JWT regressions. |

Phase 1 controls remain covered by the complete regression run:

| Findings | Actual code and retained tests |
|---|---|
| S01 streamed limits | `lib/body.ts`, JSON/upload boundaries; `api-security.test.ts`, files tests. New abort cancellation preserves byte limits. |
| S02 credentials | Atomic magic-link claim/session/audit, guarded activation, role/disable revocation, expiry/renewal; `auth.test.ts`, `credential-security.test.ts`. MFA adds independent proof without removing these controls. |
| S03–S04 races | Migration 0004 and conditional batches for lead dedup, open/authorized approvals, file quotas, last staff admin; API/portal/org/credential and populated migration tests. |
| S05–S06 notifications | Provider failure/deadlines, idempotency, fenced leases, bounded retry/link expiry and scrubbed terminal payloads; delivery/outbox tests. Slack crash duplicates remain a provider limit. |
| S07–S08 privacy/config | Domain-separated HMAC, independent key, explicit environments/HTTPS/origins, trusted proxy/edge IP only; API/proxy/rate/config tests. |
| S09–S10 cache/credentials | Early no-store/private/cookie errors, proxy failures, fragment/legacy login and URL cleanup, redacted scanner; API/proxy/browser/secret-scanner tests. |
| S11 parsing | Own-property content selection, bounded cursors and strict JWT shape/claims; existing malformed-input/SSO regressions. |
| S12 CI | Actual workflow diffs retain pinned dependencies/permissions, security-extended CodeQL and all checks; Phase 3 adds credential cleanup and merge-group events. |
| S13 retention | Bounded atomic eligibility recheck preserves recovered lead/notes; maintenance/query-plan tests. Recovery mode now also pauses scheduled mutations. |

## Completed local evidence

Run from the locked Phase 2 dependency installation with Phase 3 source, 23 October 2026, Windows / Node 22.14.0:

- Backend: **179 tests / 29 files**; TypeScript check; Worker dry-run bundle. No remote deploy.
- Frontend: lint, TypeScript, Vinext build and Next 16.4.2 production build. Upstream sourcemap/dynamic-import/config-loader warnings remain, without build failure.
- Browser: functional contact, portal/tenant/privacy, accessibility and staff MFA; production CSP in Next and Vinext. Vitest browser runner contains **3 passing tests / 2 files** spanning those suites. Public challenge key used only for local/CI builds, with provider requests intercepted in CSP checks.
- Migration generation: no schema drift. Populated upgrade applies migrations 0003–0009 after the pre-hardening schema; checks existing data and new defaults/guards. Fresh local D1 applies 0000–0009.
- `node NBE/scripts/verify-local-recovery.mjs`: isolated export/restore with **1 user / 1 membership / 1 privacy request / 10 migration records**, local read-only SQLite integrity/FKs, restored credential/outbox containment and reset revocation. Completed rehearsal took **52,178 ms**; this is fixture timing, not a production RTO. The seeded MFA ciphertext is deliberately non-secret placeholder data, so this does **not** verify decryption of backed-up production factors.
- Redacted source plus history scan: pass. Full dependency check: **fails intentionally** for eight NFE high entries. Runtime audits do not clear that blocker. Bounded braces reproduction exits 1 as expected.

The recovery test first exposed two Wrangler limitations: export lacks `--persist-to`, and an interleaved alphabetic table/data dump can fail on foreign-key references to tables not created yet. The final script uses a config-relative isolated path and schema-first/data-second exports while the fixture is quiescent. D1 rejects `PRAGMA integrity_check`; that check therefore opens the closed local SQLite file read-only. These adaptations are explicit and are not proof of remote Time Travel behavior.

## Remaining blockers, owner actions and residual risk

Use [production configuration](production-configuration.md) and the [go-live checklist](go-live-checklist.md). Mandatory unresolved items:

1. Resolve the unpatched dependency gate with an upstream patch or reviewed compatible toolchain. No downgrade/suppression or owner risk exception is in place.
2. Configure independent privacy/MFA/proxy/SSO/provider secrets privately; verify approved cutover, staff enrollment, recovery custody and key rotation in staging. Initial email-based enrollment needs identity supervision. TOTP is phishable; no AAL2/phishing-resistance claim is made.
3. Validate a real private malware engine, private storage, existing-file quarantine/rescan and scanner outage/age alerts. Protocol fixtures do not establish malware detection.
4. Verify actual hosting CSP/nonces/cache behavior and real Turnstile/mail/SSO integrations with designated staging accounts.
5. Protect `main`, secure provider/GitHub accounts, configure private monitors, audit retention, encrypted backups and a provider-level restore drill with approved RPO/RTO.
6. Approve and exercise full privacy fulfillment/retention/legal-hold policy and external SSO-consumer rotation. Tracking a request as fulfilled is an attestation, not an automated export/erase operation.
7. Review intended traffic/load, conduct independent penetration testing, and retest the final combined main release with all required checks green.

Additional retained limitations: app audit rows are mutable by a database administrator; external tamper-resistant audit storage is not configured; pending outbox content is sensitive; Slack can duplicate after a crash; regex secret detection is not exhaustive; restored snapshots may resurrect credentials/deliveries unless contained; unexpired SSO JWTs outlive local session revocation; external consumers may cache keys differently; signature-only upload type checks cannot establish safety. No capacity, compliance, availability or complete absence-of-vulnerabilities assertion is made.

**Accepted residual risks: none recorded.** The owner must explicitly decide any exception with scope, compensating controls, expiry and accountable reviewer. Until mandatory evidence exists and the dependency gate is resolved, the recommendation remains **NO-GO**.
