# Neuravic

```
NFE/        Frontend: marketing site and client portal (Next.js)
Server/     Backend: TypeScript API (Node.js, Hono, MySQL)
Security/   Security policy, threat model, go-live checklist and the automated security check
Docs/       Company profile (Word), backend architecture design (PDF) and the API reference
README.md   This file
```

| Folder | Start here |
|---|---|
| [`NFE/`](NFE) | [`NFE/README.md`](NFE/README.md): brand, structure, how the site connects to the API |
| [`Server/`](Server) | [`Server/README.md`](Server/README.md): running, configuring and how the backend is built |
| [`Security/`](Security) | [`Security/README.md`](Security/README.md): what is protected, how, and what is still missing |
| [`Docs/`](Docs) | [`Docs/README.md`](Docs/README.md): documents and the API reference |

## Run everything locally

Node.js 22.13 or newer and MySQL 8+ installed.

```bash
# 1. Backend on http://127.0.0.1:8787
cd Server
npm install
npm run mysql:local      # private MySQL on port 3307, creates the database and writes .env
npm run migrate
npm start

# 2. Frontend on http://localhost:5173 (new terminal)
cd NFE
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:5173. Sign up with an email and a password at `/signup`, or log in at `/login`.
Emailed sign-in links (optional) show up in the development mailbox at http://127.0.0.1:8787/api/v1/dev/mailbox.

## Checks

```bash
cd Server && npm start        # then, in another terminal: npm run smoke   (89 checks through the real API)
cd NFE && npm run lint && npm run typecheck && npm run build
./Security/scripts/security-check.sh                     # secrets and vulnerable dependencies
```

The frontend checks run in CI (`.github/workflows`), alongside the weekly security check and CodeQL.
