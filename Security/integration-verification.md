# Combined security and backend integration verification

23 October 2026. Supplement to the historical [Phase 3 report](phase-3-readiness.md). This work uses the existing owner-approved `security/phase-3-production-readiness` branch and updates [PR #57](https://github.com/Neuravic-co/Neuravic/pull/57). No new branch, merge, production deployment, credential or repository-administration change has been performed.

The final completion follow-up below records newer code, test and deployment observations. Earlier snapshots, including the required-check name mismatch, are historical; the owner has since corrected those contexts/sources. Release authorization is now conditional on all mandatory gates, which remain unmet.

## Review basis

Re-read the actual GitHub patches and combined implementation for #55 (`cebb4ea7949f2e3b9c9948440608ac40ace5fcc9`, 74 files), #56 (`0f0c3dd234bb51fbd4cdfccd71e28e504bbfc9d7`, 61 files) and #57's starting head (`367674ac574f3d6ee5ad9f845e6e29c3085ccd41`, 53 files). All three were open/unmerged. Git ancestry confirms Phase 1 is included in Phase 2 and Phase 2 in Phase 3; no cherry-picks, duplicate phase implementation or main merge was needed. PR #57 continues to target `security/phase-2-verification-hardening` and transitively depends on #55.

Reviewed authentication/MFA/session flows, tenant/member policies, admin role revocation, body/origin/rate boundaries, D1 write guards and batches, privacy intake, files/scanner, portal paging, notification retries, frontend proxy/contracts and CI. The existing 179-test baseline passed before implementation. Confirmed problems below were reproduced locally before their fixes; no production attack traffic or authenticated live-site tests were used.

## Confirmed implementation fixes

| ID | Confirmed behavior before fix | Final implementation / regression evidence |
|---|---|---|
| I01 Membership write races | A tenant admin could demote/delete a member promoted to owner after the route's initial check. A caller demoted to viewer or logged out during the request could still commit the membership change. | PATCH/DELETE now compare the target role and recheck the live active user, initiating unexpired session and effective tenant/staff role within the mutation statement. Last-owner checks and conditional audit remain atomic. Conflicts return 409 and no misleading success audit. Six negative interleaving cases plus implicit staff-admin success; existing two-owner/self-leave cases retained. |
| I02 Storage outage blocks security processing | Scanner deadlines began only after storage lookup/body reading. Stalled R2-like reads left scans/downloads pending, prevented stream cancellation and could block subsequent scheduled work. | One shared reader bounds lookup and complete bytes to ten seconds before scan or download. Timeouts keep files pending, preserve backoff and never release bytes. Four lookup/stream × scan/download regressions plus late-returned stream cancellation. The deadline bounds application waiting; it cannot force an underlying provider that ignores cancellation to terminate. |
| I03 Phantom privacy receipt | If a concurrent request won insertion and finished review before the losing request's final lookup, intake returned 202 with the loser's never-inserted ID. | Use the insert's returned row to confirm creation; dedup replies use an actual pending row. If the conflict winner has already completed, return a reload/retry conflict instead of inventing a receipt. Conditional single audit and concurrent dedup retained. |
| I04 Duplicate comments handler | Phase 2 added a bounded GET handler while the older unpaginated GET registration remained later in the same router. The old handler was unreachable under current Hono dispatch but was misleading and could reintroduce unbounded behavior during maintenance. | Removed the duplicate. The existing paginated handler, endpoint shape, tenant checks and frontend load-more contract remain. Existing portal/collection tests pass. |

No schema migration or frontend UI change is required. Success response contracts stay compatible; newly detected stale membership/privacy conflicts use the existing problem-response envelope. All SQL values remain parameterized; added authority lookups use existing user/session/membership keys. No secrets or customer data enter the regression fixtures.

## Completed local checks

- Backend/security: **192 tests in 29 files pass**, 13 more than the starting head; backend TypeScript passes. After duplicate-handler cleanup, the focused portal/collection suites also pass (17 cases); final GitHub checks are recorded in the PR against its published head.
- Schema generation: no drift. Local D1 recovery applies/restores all ten migrations and passes restored data/migration counts, read-only SQLite integrity/FKs, credential/outbox containment and factor-reset revocation. No remote migration ran.
- Worker dry-run bundle passes; no deployment. Frontend lint/types, Vinext and Next production builds pass. All functional/accessibility/MFA/privacy suites and both production CSP browser paths pass (3 browser runner tests / 2 files). Completed remote CI/CodeQL evidence is recorded in PR #57 against the published head.
- Existing authentication/MFA/replay/recovery, privilege-change revocation, tenant isolation, approvals, validation, byte caps, HMAC/rate limiting, no-store/proxy behavior, delivery/outbox, SSO rotation, retention and query-plan cases remain in the full suite. Browser fixtures use a private loopback mailbox and no production services.
- Full source/history/dependency gate remains **failing**, with NBE 0 / Test 0 / NFE 8 high, 0 moderate/critical, and no source/history pattern finding. The failure is preserved, not treated as a passing security result.

## Dependency status

Rechecked the [official braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) and public npm metadata. No patched release is listed; braces latest is still 3.0.3. Vinext latest 1.3.0 retains commonjs `^0.10.4`; stable Next ESLint 16.4.2 still pins fast-glob 3.3.1. Both introducing paths and bounded reproduction evidence are in the Phase 3 report and the focused dependency investigation. No supported compatible fix was found, and no dependency version, audit level, suppression, fork, downgrade or risk exception was introduced. This remains a merge/release blocker.

## GitHub ruleset integration — owner action required

Read-only GitHub API inspection confirms **Protect Main Branch** (25709754) is active for the default branch, with deletion/force-push protection and an empty bypass list. Earlier reports saying main was unprotected describe the earlier snapshot. The ruleset currently requires names/source applications that do not all match emitted check runs:

| Current required context | Correct emitted context | Source application observed |
|---|---|---|
| `backend` | `NBE checks` | GitHub Actions, app 15368 |
| `frontend` | `NFE and browser checks` | GitHub Actions, app 15368 |
| `CodeQL analysis` | `CodeQL analysis` | GitHub Actions, app 15368 |
| `codeql` | `CodeQL` | GitHub Advanced Security, app 57789; distinct findings check |
| `Security checks` | `Security checks` | GitHub Actions, app 15368 |

All current required entries select app 15368, so the separate CodeQL findings entry also needs the correct source. The actual gate must be selected; adding always-green aliases or renaming checks to hide a mismatch is not a fix. The owner should replace these contexts/sources in the active ruleset and retain the failing Security gate. No settings were changed by this work.

Additional observed settings: zero required approving reviews, stale-review dismissal off, last-push approval off, strict/up-to-date checks off; conversation resolution on. The existing go-live proposal requires at least one independent reviewer, stale-review dismissal, last-push approval, and strict checks (or a separately validated merge queue). These are explicit owner configuration steps, not completed controls. No branch-protection bypass or merge is attempted.

## Remaining release limits

Production status remains **NO-GO** while the dependency gate is red and mandatory deployment evidence is missing. Cloudflare account/resources, private keys and enrollment, a real antivirus engine, provider/SSO/CSP integration, privacy fulfillment, alerts/backups and provider restore still require the separately approved configuration described in [production configuration](production-configuration.md). Existing raw development config is not a production target. No production credentials were read or changed, and no claim is made that local tests verify live controls.

The exact owner ruleset edit above, dependency resolution and approved staging/production work remain open. Safe code changes are committed/published to the existing branch for review; current check links and outcomes are maintained in the PR so a historical successful run cannot be mistaken for the latest head. Accepted residual risks: none.

## Final completion follow-up — 23 October 2026

The three PR heads and their ancestry were reverified without restarting the completed security phases. #55 and #56 remain unchanged and are both ancestors of the Phase 3 code. No new branch, rebase or merge was required.

**Confirmed contact-intake defects:** staging/production accepted enquiries without `TURNSTILE_SECRET`; a configured verifier accepted `success:true` without checking the provider's hostname. Seven new negative regression cases failed before the fix, returning 202. Missing deployed configuration now returns 503 `bot_check_unavailable`; missing, foreign, suffix-spoofed and malformed hostnames return 422 before any lead or notification is stored. Successful verdicts must name an explicit trusted `ALLOWED_ORIGINS` hostname. Development can still run without Turnstile. Additional positive-host and provider-outage/malformed-response cases retain existing functionality. No UI, dependency or schema change was needed.

The combined backend/security suite now passes **203 tests in 29 files** and backend type checking. Frontend lint/types, Next 16.4.2 and Vinext 1.2.1 production builds pass. All ten isolated D1 migrations, restored data/migration counts, integrity/FKs, credential/outbox containment and factor revocation pass; backend Worker dry-run and schema-drift verification pass. All functional, accessibility, MFA and dual-runtime CSP browser suites pass (3 runner tests / 2 files). Final remote CI results are bound to the published head in PR #57; older successful runs are not substituted for that head.

The frontend Worker dry-run also passes. A fresh inspection of the actual Vinext 1.2.1 / Next 16.4.2 outputs found no affected-package path references or external imports in 498 generated files, including 181 source maps and ten runtime trace manifests. This is supplemental artifact evidence, not proof against all embedded/minified code or a reason to clear the dependency gate. Existing bounded-query/index-plan regressions pass; no production load/performance claim is made.

One brief official advisory/registry check found no change: braces 3.0.3, Vinext 1.3.0 and Next ESLint 16.4.2 remain current; the GHSA lists no patched version. The full unchanged Security gate still fails: NFE eight high entries, NBE/Test zero, no source/history pattern finding. The rejected migration experiments were not repeated. No risk exception or policy bypass was applied.

### Release architecture and actual deployment evidence

| Item | Verified observation / limitation |
|---|---|
| GitHub integration | Protect Main Branch is active, with no bypass actors and all five correct check contexts/applications. Required approvals remain zero, stale/last-push approvals off and strict checks off. No human approval is recorded on #55/#56/#57. The stronger independent-review go-live requirement remains unmet. |
| Main / Vercel association | Main remains `8c23a6dbb306d66514909c533c0d3039a78ecb0b`. GitHub records a successful [Vercel deployment](https://vercel.com/neuravic/neuravic/BH9dwLKAJ2grnsd32dJJYxHXubZz) for that commit, and another [development-commit deployment](https://vercel.com/neuravic/neuravic/3wjN5kAmkLPeYdfdhzRLhRch2TRW) for `8dbb395`. Those records identify the Vercel project slug `neuravic/neuravic`; they do not establish current production-branch settings, alias assignment or the live commit. |
| Repository frontend build | `NFE/vercel.json` specifies Next.js, `npm ci`, `next build`. The Vercel project must use root `NFE`; actual dashboard root/build/production-branch/preview environment settings are not accessible and therefore unverified. No GitHub Actions deployment job exists. Vercel's separate Git integration is evidenced by commit statuses. |
| Frontend/API connection | Browser defaults to same-origin `/api/v1`; the server proxy requires an HTTPS `API_ORIGIN` pointing at NBE and matching proxy secrets on both ends. Page content can fall back without a backend. An externally configured public browser API base has not been ruled out by dashboard access. |
| Public production observations | Passive GET `/` on `https://neuravic.vercel.app/` returned 200, Neuravic title, Vercel server, baseline CSP only (no nonce/script policy in the observed header) and `public, must-revalidate, max-age=0`. GET `/api/v1/health` and `/api/v1/version` each returned 503 `api_unavailable`, title `The API is not configured`. This verifies failure on the intended same-origin path, not a working deployed backend. No form submission, login, customer access or production attack test was performed. |
| Cloudflare backend | `NBE/wrangler.jsonc` describes Worker `neuravic-api`, DB binding `DB` / `neuravic-db`, five-minute cron, development variables and a placeholder database ID. Private `BUCKET` and `MALWARE_SCANNER` bindings require separately verified resources. No account ID, concrete production D1 target or separate staging environment is configured there. Dashboard/Workers Builds integration, actual deployed code/bindings and any independently provisioned backend remain unverified. |
| Database and operations | Only isolated local migrations/recovery ran. Actual D1 migration ledger/data compatibility, real keys/MFA enrollment/scanner/provider integrations, private storage, alert delivery, backups/RPO/RTO and production rollback access were not verified. Local fixtures do not replace that evidence. |

**Release decision: NO-GO.** No PR was merged, no main update or production release was performed, and no Cloudflare resource, production credential or remote database was changed. Preserve the PR stack. Minimum next steps are supported dependency remediation with a green Security gate; exact-head CI and independent review; authorized verification of Vercel project/root/production branch and release behavior; and approved staging evidence for the real Worker, D1, bindings, keys, providers and recovery. Conditional merge/release authority does not permit skipping any of these gates.
