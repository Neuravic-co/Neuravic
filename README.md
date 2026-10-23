# Neuravic

```
NFE/        Frontend: marketing site and client portal (Next.js on Cloudflare Workers)
NBE/        Backend: TypeScript API (Hono, Cloudflare D1) that serves both
Test/       All tests: 143 backend tests and browser end-to-end and accessibility tests
Security/   Security policy, threat model, go-live checklist and the automated security check
Docs/       Company profile (Word), backend architecture design (PDF) and the API reference
README.md   This file
```

| Folder | Start here |
|---|---|
| [`NFE/`](NFE) | [`NFE/README.md`](NFE/README.md): brand, structure, how the site connects to the API |
| [`NBE/`](NBE) | [`NBE/README.md`](NBE/README.md): running, deploying and how the backend is built |
| [`Test/`](Test) | [`Test/README.md`](Test/README.md): how to run each kind of test and what they cover |
| [`Security/`](Security) | [`Security/README.md`](Security/README.md): what is protected, how, and what is still missing |
| [`Docs/`](Docs) | [`Docs/README.md`](Docs/README.md): documents and the API reference |

## Run everything locally

Node.js 22.13 or newer.

```bash
# 1. Backend on http://localhost:8787
cd NBE
npm install
cp .dev.vars.example .dev.vars        # put your email in BOOTSTRAP_ADMIN_EMAIL
npm run db:migrate:local
npm run dev

# 2. Frontend on http://localhost:5173 (new terminal)
cd NFE
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:5173. Normal local sign-in requires a configured email provider; login links are never printed.
For a complete isolated contact/portal test with an in-memory mailbox, install NFE and Test dependencies, install
Playwright Chromium in Test, then run `npm run test:browser` in NBE. See `Test/README.md`.

## Checks

```bash
cd NBE && npm run typecheck && npm test                  # backend: types and 143 tests
cd NFE && npm run lint && npm run typecheck && npm run build
./Security/scripts/security-check.sh                     # secrets and vulnerable dependencies
cd NBE && npm run test:browser                            # isolated browser and accessibility suites
```

These checks run in CI (`.github/workflows`), alongside both frontend builds and CodeQL. The security check also runs weekly.

hello world 1-1
