# Security

Everything about the security of the Neuravic website, portal and API lives here.

| File | What it is |
|---|---|
| [`SECURITY.md`](SECURITY.md) | How to report a vulnerability, and what to expect |
| [`threat-model.md`](threat-model.md) | What we protect, who might attack it, and which control stops each attack (with the code and test that prove it) |
| [`hardening-checklist.md`](hardening-checklist.md) | What must be done before and after going live, and what is still missing |
| [`scripts/security-check.sh`](scripts/security-check.sh) | Automated check: secrets in the repo and known-vulnerable dependencies. Runs in CI every week and on every change |

The code that enforces security stays next to the feature it protects (for example `NBE/src/modules/auth`).
This folder explains it and checks it.

## Run the automated check

```bash
./Security/scripts/security-check.sh
```

It fails if a secret-looking file or value is committed, or if the backend or the frontend has a high or critical
vulnerability in a production dependency.

## Status at a glance

**In place:** passwordless sign-in with single-use hashed links, server-side revocable sessions, CSRF defence,
deny-by-default access control with tenant isolation, input validation everywhere, rate limiting, spam and bot
checks, safe file uploads, hashed IP addresses, an audit log, short-lived signed tokens for product sign-on,
and security headers on both the API and the website.

**Not in place yet:** second factor for staff (passkeys or authenticator app), virus scanning of uploads,
database-level backups and exports beyond the platform's own, a full script-source Content-Security-Policy on the
website, and endpoints for data-subject access and deletion requests. Details and priorities are in
[`hardening-checklist.md`](hardening-checklist.md).

## Dependency status (18 October 2026)

Both projects have **no known vulnerabilities in production dependencies**. The frontend's earlier advisories
(`next`, `postcss`, `sharp`) were cleared by updating `next` to 16.4.2.

One finding remains in a development-only tool: `npm audit` in `NBE` reports 4 moderate advisories inside
`drizzle-kit`'s own bundled build tool (`esbuild`, used only when generating migrations on a developer machine,
never deployed). `drizzle-kit` is already at its latest release, so there is nothing to update yet.

Dependencies are updated automatically: Dependabot opens a weekly pull request per folder
(`.github/dependabot.yml`), and the security check runs every Monday.
