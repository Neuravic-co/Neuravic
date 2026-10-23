# Security

Everything about the security of the Neuravic website, portal and API lives here.

| File | What it is |
|---|---|
| [`SECURITY.md`](SECURITY.md) | How to report a vulnerability, and what to expect |
| [`threat-model.md`](threat-model.md) | What we protect, who might attack it, and which control stops each attack (with the code and test that prove it) |
| [`hardening-checklist.md`](hardening-checklist.md) | What must be done before and after going live, and what is still missing |
| [`scripts/security-check.sh`](scripts/security-check.sh) | Automated check: secrets in the repo and known-vulnerable dependencies. Runs in CI every week and on every change |
| [`audit-2026-10-22.md`](audit-2026-10-22.md) | Confirmed findings, remediation evidence, validation results and remaining risks |
| [`phase-2-verification.md`](phase-2-verification.md) | PR #55 diff verification, MFA/quarantine/CSP fixes, dependency blocker and production prerequisites |
| [`api-inventory.md`](api-inventory.md) | Endpoint, authorization, data-operation and frontend integration map |
| [`operations-runbook.md`](operations-runbook.md) | Staging, rollout order, monitoring, incident response, backup validation and rollback |

The code that enforces security stays next to the feature it protects (for example `NBE/src/modules/auth`).
This folder explains it and checks it.

## Run the automated check

```bash
./Security/scripts/security-check.sh
# Cross-platform, with a redacted history scan:
node Security/scripts/security-check.mjs --history
```

It fails if a secret-looking file or value is found, or if NBE, NFE or Test has a moderate-or-worse advisory, including development dependencies. The current unpatched NFE build-tool advisory deliberately keeps this gate red; see the Phase 2 report. `--secrets-only` runs the offline source/history checks separately; it does not establish dependency safety.

## Status at a glance

**In place:** passwordless sign-in with single-use hashed links, server-side revocable sessions, CSRF defence,
deny-by-default access control with tenant isolation, input validation everywhere, rate limiting, spam and bot
checks, safe file uploads, hashed IP addresses, an audit log, short-lived signed tokens for product sign-on,
and security headers on both the API and the website.

**Phase 2 code:** staff authenticator MFA, fail-closed upload quarantine with a private scanner adapter, enforced nonce CSP, bounded member/comment collections and private operational status.

**Still requires production work:** MFA key/enrollment, an actual malware engine, private alerts/backups and data-subject access/deletion workflows. Details and priorities are in
[`hardening-checklist.md`](hardening-checklist.md).

## Dependency status (22 October 2026)

The production lockfile checks for NBE and NFE each reported zero advisories at the time of this audit.
This result is time-bound and does not establish that the application has no vulnerabilities. Development-only findings
and remaining production gaps are recorded in the audit. Advisory service failures fail the check rather than being reported as a clean scan.

The scanner returns categories/locations without printing matching credentials, including when inspecting history.
Its patterns cover common key formats; they do not replace provider secret scanning or a private incident investigation.

Dependencies are updated automatically: Dependabot opens a weekly pull request per folder
(`.github/dependabot.yml`), and the security check runs every Monday.
