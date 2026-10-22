# Neuravic

```
NFE/        Frontend: marketing site and client portal (Next.js on Cloudflare Workers)
NBE/        Backend: TypeScript API (Hono, Cloudflare D1) that serves both
Test/       All tests: 108 backend tests and browser end-to-end and accessibility tests
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

Open http://localhost:5173. Submit the contact form, then open `/portal` and sign in with your
bootstrap email. In development the sign-in link is printed in the backend terminal.

## Checks

```bash
cd NBE && npm run typecheck && npm test                  # backend: types and 108 tests
cd NFE && npm run lint && npm run typecheck && npm run build
./Security/scripts/security-check.sh                     # secrets and vulnerable dependencies
cd Test && npm install && npm run e2e                    # browser tests (both apps running; see Test/README.md)
```

The first three run in CI (`.github/workflows`), and the security check also runs every week.

hello world 1-1
