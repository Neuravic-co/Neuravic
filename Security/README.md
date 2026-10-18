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

It fails if a secret-looking file or value is committed, or if the backend has a high or critical
vulnerability in a production dependency. Frontend findings are printed but do not fail the check (see below).

## Status at a glance

**In place:** passwordless sign-in with single-use hashed links, server-side revocable sessions, CSRF defence,
deny-by-default access control with tenant isolation, input validation everywhere, rate limiting, spam and bot
checks, safe file uploads, hashed IP addresses, an audit log, short-lived signed tokens for product sign-on,
and security headers on both the API and the website.

**Not in place yet:** second factor for staff (passkeys or authenticator app), virus scanning of uploads,
database-level backups and exports beyond the platform's own, a full script-source Content-Security-Policy on the
website, and endpoints for data-subject access and deletion requests. Details and priorities are in
[`hardening-checklist.md`](hardening-checklist.md).

## Known dependency advisories (frontend)

`npm audit` reports advisories for `next`, `postcss` and `sharp` in NFE. The website runs on `vinext`
(a Vite-based runtime on Cloudflare Workers), not on the Next.js server, which is where most of the `next`
advisories apply. The automatic fix would downgrade `eslint-config-next` and move `vinext` off its pinned
beta, so it needs a planned upgrade with a full test run (`Test/`), not an automatic one. The backend (NBE)
has no production advisories.
