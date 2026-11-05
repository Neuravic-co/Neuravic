# Neuravic

Neuravic is a technology company's website. Visitors read about the company and send an enquiry; the team receives it by email (and optionally Slack). There are no accounts or logins.

| Folder | What it is |
|---|---|
| `nfe/` | Frontend: the Next.js website and its same-origin API proxy |
| `nbe/` | Backend: one Hono API process (enquiries, durable email outbox, health) |
| `database/` | PostgreSQL migrations, migration runner and a private local database |
| `security/` | Secret generator and the secret/dependency scan |
| `deployment/` | Docker, Docker Compose, Kubernetes and Helm |
| `test/` | Unit, Postgres, live-server and browser tests |
| `docs/` | Documentation. Start with [Architecture](docs/Architecture.md) |

## Run it

Needs Node.js 22.13+. The local database runs from an npm package, so there is nothing else to install.

```bash
npm install
npm run db:local        # private local Postgres (leave it running); writes .env with fresh secrets
npm run db:migrate
npm start               # API on http://127.0.0.1:8787
```

```bash
cd nfe
npm install
cp .env.example .env.local
npm run dev             # website on http://localhost:5173
```

Configuration is environment-only. Settings live in `.env` (created by `db:local`; never committed). Copy [`.env.example`](.env.example) for the full list; secrets are never committed.

## Check it

```bash
npm run typecheck
npm run test:unit
npm run smoke           # with the API running
```

## Documentation

[Architecture](docs/Architecture.md) · [Getting started](docs/Getting-Started.md) · [API](docs/API.md) · [Security](docs/Security.md) · [Operations](docs/Operations.md) · [Contact email](docs/Contact-Email.md) · [Staging email check](docs/Staging-Email-Verification.md)
