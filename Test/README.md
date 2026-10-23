# Tests

Backend and security tests use Vitest with the real migrations applied to a fresh in-memory libSQL database. Browser tests use Playwright and axe-core against the real frontend and an isolated API.

Phase 3 evidence: **179 backend tests**, privacy workflow and recovery-code replacement browser checks, overlapping-JWKS tests, populated migration upgrade and an isolated local D1 backup/restore script. See `Security/phase-3-readiness.md`; the dependency gate remains intentionally failing for eight unpatched NFE high entries.

For strict challenge-provider CSP fixture coverage, build each frontend with public `NEXT_PUBLIC_TURNSTILE_SITE_KEY=local-csp-fixture` set only for that build process, then run browser tests with `CSP_EXPECT_TURNSTILE=true`. Keep the dev-server process free of that build-only value; functional contact tests use the isolated API without a real provider. CI already scopes these values per step. Requests to the challenge provider are intercepted in the production CSP test; real provider verification remains a staging requirement. `node NBE/scripts/verify-local-recovery.mjs` from the repository root creates only new local fixture databases and retains ignored evidence under `tmp/`; never point it at production.

## Backend and security regression suite

```bash
cd NBE
npm ci
npm run typecheck
npm test
```

161 tests cover authentication, token expiry/reuse and atomic rollback, role changes and credential revocation, tenant isolation, authorization, contact validation/spam/deduplication, injection-like inputs, CSV safety, body/upload limits, quotas under concurrency, CSRF/CORS, private caching, proxy trust, SSO validation, outbox leases/idempotency/expiry, secret-scanner redaction, retention and database query plans. The suite needs no external API or production credentials. Two workers bound native SQLite startup contention.

## Browser integration and accessibility

Install all three projects and a browser once:

```bash
npm ci --prefix NBE
npm ci --prefix NFE
npm ci --prefix Test
cd Test
npx playwright install chromium
cd ../NFE
npm run build
npx next build
cd ../NBE
npm run test:browser
```

On Windows, `CHROMIUM_PATH` can select an existing Chrome executable. The fixture starts a Next.js dev server on a free loopback port, a migrated in-memory API, and a mailbox protected with a random fixture secret. It runs contact, portal, accessibility and staff MFA suites, then stops its servers. Separate local production servers verify CSP in the two prebuilt frontend runtimes. It exercises real API calls, invitation/login flows, projects, requests/approvals, comments, files and staff enquiries; script-like comments must render as escaped text and login credentials must leave the browser URL. No real email is sent, and tokens are never scraped from logs.

The mailbox lives only under `Test/browser/`; it is not a deployed Worker route. Do not point these mutating tests at production. The lower-level `Test/e2e/*.mjs` scripts require fixture-provided `E2E_BASE_URL`, `E2E_API_URL`, `E2E_MAILBOX_URL` and `E2E_MAILBOX_SECRET`; normally use the wrapper above.

## Build and security checks

```bash
cd NFE
npm run lint
npm run typecheck
npm run build
npx next build
cd ..
node Security/scripts/security-check.mjs --history
```

The security scan prints locations and categories only, fails closed when dependency advisory data is unavailable, and gates all NBE/NFE/Test dependencies, including development tooling, on moderate-or-worse findings. `--secrets-only` supports offline source/history checks. The shell wrapper remains supported. CI pins actions, runs both build paths, the browser fixture, type checks, backend tests, migration consistency, dependency/secret checks and CodeQL.

These tests demonstrate specific behaviors in the tested environments. libSQL, a local Next server and Wrangler dry runs do not prove production configuration, load capacity, real antivirus engine efficacy, production MFA enrollment or complete security. See `Security/audit-2026-10-22.md` for actual results and remaining actions.


Phase 2 adds RFC 6238 vectors, encrypted-factor isolation, concurrent TOTP/recovery consumption, account guessing limits, global staff step-up, fail-closed quarantine/scanner protocol, file signature checks and bounded collection/tenant tests. The isolated browser fixture runs contact, portal, accessibility and staff MFA flows. It then verifies CSP independently against both prebuilt production runtimes (`npm run build` and `npx next build` must be run in NFE first): unique nonces, no-store HTML, framework hydration and actual HTML-response script/event-handler injection blocked by the browser. Browser tests use only local owned servers; they never enable a production portal or send real email.

`node Security/scripts/security-check.mjs --history` includes all development/test dependencies and deliberately fails on the currently unpatched NFE `braces` advisory. Use `--history --secrets-only` for an independent offline secret-pattern result. Neither command suppresses dependency findings. See the Phase 2 report for the expected blocker and the production-only audit distinction.
