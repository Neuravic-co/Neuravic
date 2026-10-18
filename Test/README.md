# Test

All tests for Neuravic live here.

```
Test/
  backend/   91 automated tests for the API (Vitest, in-memory database, no network)
  e2e/       Browser tests: contact form, client portal, accessibility (Playwright + axe-core)
```

## Run the backend tests

```bash
cd NBE && npm install      # once
npm test                   # runs ../Test/backend
npm run typecheck          # type-checks the source and these tests
```

(`cd Test && npm run backend` does the same.) They need no network, no Cloudflare account and no setup:
each test gets a fresh in-memory SQLite database with the real migrations applied.

## Run the browser tests

They drive the real website and API in a real browser, so both must be running.

```bash
# terminal 1: backend. Write its output to a file: in development it prints the sign-in links there
cd NBE && cp .dev.vars.example .dev.vars        # set BOOTSTRAP_ADMIN_EMAIL=founder@test.dev
npm run db:migrate:local
npm run dev 2>&1 | tee /tmp/nbe.log

# terminal 2: frontend
cd NFE && cp .env.example .env.local && npm run dev

# terminal 3: the tests
cd Test && npm install
npm run e2e                 # all three suites
npm run e2e:contact         # or one at a time: e2e:portal, e2e:a11y
```

| Setting | Default | Meaning |
|---|---|---|
| `E2E_BASE_URL` | `http://localhost:5173` | Website address |
| `E2E_API_URL` | `http://localhost:8787/api/v1` | API address |
| `E2E_ADMIN_EMAIL` | `founder@test.dev` | Must equal `BOOTSTRAP_ADMIN_EMAIL` of the backend |
| `NBE_LOG` | `/tmp/nbe.log` | File holding the backend output |
| `CHROMIUM_PATH` | (Playwright's own) | Browser executable, if Playwright's download is not available |

Screenshots of each flow are written to `e2e/screenshots/` (not committed). Run the browser tests against a
disposable local database: they create organisations, projects and enquiries. If the contact test reports a
`429`, the local rate limit (5 enquiries per hour) was reached: restart the backend.

## What is covered

| Area | Where | What is checked |
|---|---|---|
| Health, headers, CORS, caching, request hardening | `backend/health.test.ts` | Security headers, allowed origins only, `no-store`, request ids, oversized bodies |
| Database | `backend/database.test.ts` | Migrations, unique emails, atomic batches, hashed audit entries |
| Lead intake | `backend/leads-intake.test.ts` | Validation, consent, honeypot, duplicates, spam quarantine, rate limit, bot check |
| Lead inbox (staff) | `backend/leads-admin.test.ts` | Roles, pagination, status and notes, CSV export and formula safety |
| Notifications | `backend/outbox.test.ts` | Delivery once, retries with backoff then dead, no double sending |
| Authentication | `backend/auth.test.ts` | Single-use links, expiry, hashed tokens, no account probing, bootstrap admin, logout, CSRF, lifetimes, production cookie |
| Organisations and roles | `backend/orgs.test.ts` | Invites, tenant hiding, role limits, last owner |
| Portal | `backend/portal.test.ts` | Projects, requests, approvals, self-approval block, comments, activity, people details |
| Files | `backend/files.test.ts` | Type and size limits, access control, safe names, storage failure |
| Site content | `backend/content.test.ts` | Defaults match the website, editing, validation, publishing, and that the home page content costs one database query |
| Database efficiency | `backend/query-plans.test.ts` | Every list and cleanup query uses an index and returns rows already in order (guards Cloudflare D1 read costs) |
| Admin | `backend/admin.test.ts` | Overview, staff invites, disabling users ends sessions, last admin protected, audit filters |
| Product single sign-on | `backend/sso.test.ts` | Signature verification, audience, expiry, tampering, membership checks |
| Maintenance | `backend/maintenance.test.ts` | Retries, expired sessions and tokens, retention rules |
| Contact form (browser) | `e2e/contact.e2e.mjs` | Content from the API, validation, errors clear on edit, real submit, mobile layout |
| Portal (browser) | `e2e/portal.e2e.mjs` | Full journey with two people: organisation, invite, project, request, approval, comments, files, activity, inbox, sign-out |
| Accessibility (browser) | `e2e/accessibility.e2e.mjs` | axe-core WCAG 2.1 A and AA on the home page, form errors, mobile menu and portal screens |

## What is not covered

- Real third-party services: the email provider, Cloudflare R2, Turnstile and Slack (they are replaced by in-memory fakes; file upload shows its "storage not configured" path in the browser test).
- The production runtime. Browser tests run against the development servers. Re-run them against staging before launch, and check the production security headers.
- Load and performance tests, visual regression tests, and tests on real mobile devices and other browsers (Chromium only).
- Frontend unit tests. The frontend is checked by lint, type checking, the production build and the browser tests.
- A penetration test (see `../Security/hardening-checklist.md`).
