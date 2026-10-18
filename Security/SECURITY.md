# Security policy

## Reporting a vulnerability

Please report security problems privately, not in a public issue.

- Use GitHub's **Report a vulnerability** button on the repository's Security tab (private reporting), or
- email **neuravic2026@gmail.com** with the subject `Security`.

> Neuravic does not have a dedicated security mailbox yet. Create `security@` on the company domain, then
> update this file and the `contact` line in the site's `/.well-known/security.txt` when you do.

Please include what you found, how to reproduce it, and the impact you think it has. Do not access other
people's data, disrupt the service, or run automated attacks against the production site.

## What to expect (proposed targets, confirm before publishing)

| Step | Target |
|---|---|
| We acknowledge your report | within 3 working days |
| We tell you whether it is confirmed | within 10 working days |
| We fix confirmed high and critical issues | within 30 days |

We will credit reporters who want to be credited once the fix is released.

## Scope

In scope: the website (NFE), the portal at `/portal`, and the API (NBE) under `/api/v1`.
Out of scope: third-party services we use (Cloudflare, the email provider), social engineering of staff,
and denial-of-service testing.

## Supported versions

Only the current `main` branch and the production deployment are supported.
