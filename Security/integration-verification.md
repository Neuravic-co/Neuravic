# Combined security and backend integration verification

23 October 2026. Supplement to the historical [Phase 3 report](phase-3-readiness.md). This work uses the existing owner-approved `security/phase-3-production-readiness` branch and updates [PR #57](https://github.com/Neuravic-co/Neuravic/pull/57). No new branch, merge, production deployment, credential or repository-administration change is authorized or performed.

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
