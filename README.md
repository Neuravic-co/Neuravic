# Neuravic

| Folder | What it is |
|---|---|
| [`NFE/`](NFE) | Frontend: marketing site and client portal (Next.js on Cloudflare Workers) |
| [`NBE/`](NBE) | Backend: TypeScript API (Hono, Cloudflare D1) that serves both |
| [`docs/`](docs) | Company profile (Word) and backend architecture design (PDF) |

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
cd NBE && npm run typecheck && npm test      # 69 tests
cd NFE && npm run lint && npx tsc --noEmit && npm run build
```

Both run in CI (`.github/workflows`).
