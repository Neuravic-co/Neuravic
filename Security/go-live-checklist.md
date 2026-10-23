# Final go-live checklist — Phase 3

**NO-GO as of 23 October 2026.** Checked items below are completed code/local verification only. Unchecked mandatory items block launch. No owner residual-risk acceptance, production change or release approval is recorded. See [evidence](phase-3-readiness.md) and [configuration procedures](production-configuration.md).

## Completed code and local checks

- [x] Actual PR #55 and #56 patches reviewed together; phase dependency/base documented.
- [x] Phase 1 authentication, authorization, atomic writes, byte limits, HMAC privacy, cache, notifications, retention and parsing regressions retained.
- [x] MFA enrollment, session binding, guessing limits, TOTP/recovery replay/races, transactional rollback, reset/removal revocation and code replacement tested.
- [x] Quarantine, content checks, scanner protocol/errors/deadline and changed-object download denial tested.
- [x] CSP enforced and browser-verified on both local production runtimes, including intercepted challenge loader/frame and injection denial.
- [x] Privacy limited copy/intake/review audit and SSO public-key overlap/retirement code tested; full supervised fulfillment still requires approval/evidence.
- [x] All ten migrations, populated upgrade, local backup/restore/credential containment, integrity/FKs and schema drift verified.
- [x] Backend, lint/types, both frontend builds, functional/security/accessibility browsers and redacted source/history checks completed. Current Phase 3 remote CI evidence is linked in its PR; it must be green apart from no exceptions, and separate CodeQL findings must be checked.
- [x] Exact dependency paths/exposure investigated; bounded reproduction confirms locked-version exhaustion. No downgrade/suppression applied.
- [x] CI pinned permissions retained; checkout credentials disabled; merge-group events and isolated recovery CI added.

## Mandatory unresolved blockers / owner actions

- [ ] **Dependency blocker:** compatible patched tooling / reviewed upstream fix eliminates eight NFE high entries; full Security gate passes. No exception accepted.
- [ ] **Repository owner:** protect `main` with the settings below and verify by read-only inspection. Review/approve stacked PRs; no merge with failed checks.
- [ ] **Secret owner:** independent privacy/MFA/proxy/SSO/provider keys, per-environment custody, backup and approved rotation/cutover proven privately.
- [ ] **Identity owner:** complete staff enrollment roster, clock monitoring and dual-control account recovery/key restore rehearsal; no email-only factor reset.
- [ ] **Storage/security owner:** private R2 and real maintained scanner; positive detection, archive limits, scanner outage and no-unscanned-access staging evidence.
- [ ] **Frontend/provider owner:** actual deployed CSP/nonces/cache, real Turnstile/mail and designated staging user flows pass on intended hosts.
- [ ] **SSO owners:** both DARKAGENT and COOLACCESS_DXB pass real cached-JWKS prepublish/switch/retire/expiry exercise.
- [ ] **Privacy owner:** identity/tenant/retention/legal-hold decisions, complete export and erasure fulfillment, notice and response-deadline rehearsal approved.
- [ ] **Operations owner:** private working alerts/responder escalation, cron/scanner/feed/queue/backup-age monitoring and external protected audit evidence.
- [ ] **Recovery owner:** provider-level encrypted D1/R2/key backup/restore, snapshot-delta reconciliation, credential/delivery containment, measured RPO/RTO and independent access proven.
- [ ] **Security/release owner:** independent penetration test, realistic load/provider failures, final integrated-release tests and separate CodeQL results green.
- [ ] **Release owner:** explicit production deployment approval after evidence review; final smoke tests, rollback/forward-repair artifacts and reopening approval recorded.

## Exact proposed settings for `main` (owner must apply)

Read-only GitHub branch response on 23 October: `protected:false`, protection disabled, required-check contexts empty. No administrative setting was changed.

Create one active protection rule matching **`main`** (or an equivalent enforced ruleset with no bypass actors):

| Setting | Required value |
|---|---|
| Require a pull request before merging | On |
| Required approving reviews | At least 1 independent human with write access; request security/backend owner review for these PRs |
| Dismiss stale approvals after new commits | On |
| Require approval of most recent reviewable push | On; approver other than the person who pushed |
| Require conversation resolution | On |
| Require status checks | On: exact contexts **`NBE checks`**, **`NFE and browser checks`**, **`Security checks`**, **`CodeQL analysis`**, **`CodeQL`**. The last is the separate findings result; successful upload/analysis alone is insufficient. Select the corresponding GitHub Actions/code-scanning app as source where offered. Confirm the exact contexts on an integrated-main PR. |
| Require branch up to date | On (strict checks); owner may adopt a tested merge queue instead. Workflows support `merge_group`, but queue/admin configuration was not performed. |
| Do not allow bypassing settings / enforce for admins | On; no bypass list and no “allow specified actors to bypass PR” exception |
| Allow force pushes / deletions | Both off |
| Push restrictions | Only approved maintainers/release app, if supported by repository plan; everyone still requires PR/checks. No direct production credential-bearing deployment from untrusted PRs. |
| Code-scanning result policy | Require the separate CodeQL result and block new applicable security alerts; no dismissal merely to unblock this work. |

Keep no workflow path filters that skip required contexts. Do not make Vercel preview deployment a substitute for security tests or configure an automatic production deployment as part of this approval. Code-owner/signed-commit/linear-history policies may be strengthened by the owner after validating repository workflow; no claim they are configured. GitHub's [protection guidance](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches) describes strict checks and admin bypass enforcement.

Require MFA on GitHub, Cloudflare, frontend host, mail provider and secret/backup accounts; least-privilege individual access; restricted Actions permissions and fork approvals. Review the repository's actual Actions policy separately. Source YAML grants contents read by default; only CodeQL grants security-events write. No workflow receives production secrets in this change.

## Residual risks and release decision

**Accepted residual risks: none.** Proposed retained limitations requiring explicit review include phishable TOTP/bootstrap email enrollment, inline style CSP allowance, provider-bounded idempotency/Slack duplicates, mutable database-admin audit access, imperfect regex secret discovery and short-lived already-issued SSO tokens. These do not excuse unresolved mandatory controls or a failing dependency gate.

The final release reviewer must record the exact combined commit, evidence links, every owner sign-off, any justified time-limited exception and the GO/NO-GO decision. An unchecked mandatory item, missing production evidence or unresolved high advisory keeps the result **NO-GO**. Do not describe the app as production-ready before that review.
