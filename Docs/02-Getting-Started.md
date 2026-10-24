# 02 Getting started

How to run Neuravic on your own computer, what every setting does and how to check that it works.
Part of the documentation set: [01 Architecture](01-Architecture.md), **02 Getting started** (this file), [03 API reference](03-API.md), [04 Security](04-Security.md), [05 Operations](05-Operations.md).

## 1. What you need

| Tool | Version |
|---|---|
| Node.js | 22.13 or newer |
| MySQL | 8 or newer, installed on the machine (only needed for the private local database) |
| Git | any recent version |

## 2. Repository map

```
nfe/        Frontend: marketing site and client portal (Next.js)
nbe/        Backend: the shared core and six services (gateway, auth, portal, leads, admin, worker)
server/     File server: stores, scans and serves uploaded files
database/   MySQL: access setup, migrations, a private local server
security/   Security tooling: secret generator, secret and dependency scan
deployment/     Docker images, Compose, Kubernetes extras, Helm chart
images/         Brand and documentation images
test/           Unit tests and integration tests
docs/       These five documents, the company profile (Word) and the original backend design (PDF)
.env        Your local settings (created for you, never committed)
```

## 3. Run it locally

Everything starts from the repository root.

```bash
npm install              # installs the backend, file server and database tools (one lockfile)
npm run db:local         # starts a private MySQL on 127.0.0.1:3307, creates the database and two accounts, writes .env
npm run db:migrate       # creates the tables and the write guards (triggers)
npm start                # starts the gateway (8787), auth, portal, leads, admin, worker and the file server
```

In a second terminal, the website:

```bash
cd NFE
npm install
cp .env.example .env.local
npm run dev              # http://localhost:5173
```

`npm run db:local` never touches another MySQL on your machine. It expects MySQL under `C:/Program Files/MySQL/MySQL Server 9.1`; set `MYSQL_HOME` if yours is elsewhere.
To use your own MySQL instead, create the accounts on it with `database/scripts/create-access.mjs` (see section 5) and put its addresses in `.env`.

Check the backend any time: http://127.0.0.1:8787/api/v1/health lists every service and its state.

## 4. Signing in locally

- **Sign up** at `/signup` with your name, an email, a password (8 to 128 characters) and the terms checkbox. You are signed in at once and land on `/portal`.
- **Log in** at `/login` with your email and password.
- **Email link instead:** on the login page choose "Email me a sign-in link instead". Nothing is really emailed in development: open
  http://127.0.0.1:8787/api/v1/dev/mailbox to read the message and its link. Invitations from an organisation also arrive as links.
- **Staff admin:** signing up with the address in `BOOTSTRAP_ADMIN_EMAIL` (default `admin@neuravic.local`) creates the staff admin, in development only.
  A new client has no organisation yet; an admin creates organisations and invites people through the API, and then the client sees projects in the portal.

## 5. Settings

### Backend: `.env` at the repository root

`npm run db:local` writes a working development file. Every service and the migration tool read it. Never commit it.

| Name | Meaning | Required |
|---|---|---|
| `APP_ENV` | `development`, `staging` or `production` | default `development` |
| `GATEWAY_PORT` | Port of the public gateway | default `8787` |
| `AUTH_PORT`, `PORTAL_PORT`, `LEADS_PORT`, `ADMIN_PORT`, `FILES_PORT`, `WORKER_PORT` | Ports of the services | defaults 8801 to 8806 |
| `AUTH_URL`, `PORTAL_URL`, `LEADS_URL`, `ADMIN_URL`, `FILES_URL`, `WORKER_URL` | Where the gateway finds each service | default `http://127.0.0.1:<port>` |
| `HOST` | Address the services listen on (`0.0.0.0` in containers) | default `127.0.0.1` |
| `DATABASE_URL` | Services connect as `neuravic_app`: `mysql://neuravic_app:<password>@host:3306/neuravic` | yes |
| `MIGRATE_DATABASE_URL` | Migrations connect as `neuravic_migrator` | for `db:migrate` |
| `DB_POOL_SIZE` | Connections per service | default 10 |
| `APP_URL` | The website address (HTTPS outside development) | yes |
| `ALLOWED_ORIGINS` | Comma list of website origins allowed to call the API; must include `APP_URL` | yes |
| `EMAIL_FROM`, `NOTIFY_TO` | Sender of system emails and the inbox that receives new enquiries | yes |
| `BOOTSTRAP_ADMIN_EMAIL` | Address that becomes the first staff admin | recommended |
| `RESEND_API_KEY` | Real email delivery. Without it, development keeps messages in the dev mailbox | production |
| `PRIVACY_HASH_SECRET` | Random 32+ character key for pseudonymous identifiers | outside development |
| `MFA_ENCRYPTION_KEY` | 64 hex characters (32 bytes) that encrypt staff authenticator seeds | when staff MFA is on |
| `STAFF_MFA_REQUIRED` | `true` or `false`; defaults to `true` outside development | optional |
| `PROXY_SECRET` | 32+ characters shared by the gateway, every service and the website's `API_PROXY_SECRET` | yes (written for you locally) |
| `WORKER_POLL_MS` | How often the worker sends queued email | default 2000 |
| `SSO_PRIVATE_JWK`, `SSO_KEY_ID`, `SSO_AUDIENCES`, `SSO_PUBLIC_JWKS` | Single sign-on for other Neuravic products | optional |
| `MALWARE_SCANNER_URL` | Private file-scanner service; without it uploads stay quarantined (development uses a scanner that marks everything clean) | production |
| `UPLOAD_DIR` | Where the file server stores uploads | `.data/files` locally (set in `.env`, created on first upload, never committed), `/data/uploads` in containers |
| `SLACK_WEBHOOK_URL` | Optional Slack notification for new enquiries | optional |
| `MAINTENANCE_MODE` | `true` makes every service answer 503 except health and version | optional |

Generate strong values with `node security/scripts/generate-secrets.mjs`.

### The database accounts

| Account | Used by | Rights |
|---|---|---|
| `neuravic_app` | Every service | SELECT, INSERT, UPDATE, DELETE on the `neuravic` database only |
| `neuravic_migrator` | `npm run db:migrate` and the migration job | The above plus CREATE, ALTER, DROP, INDEX, REFERENCES, TRIGGER |

On any MySQL 8+ server, create the database and both accounts (safe to repeat; it resets the two passwords):

```bash
MYSQL_ADMIN_URL=mysql://root:secret@db.example.com:3306 \
APP_DB_PASSWORD=<16+ characters> MIGRATE_DB_PASSWORD=<16+ characters> \
node database/scripts/create-access.mjs
```

Optional: `DB_NAME` (default `neuravic`) and `DB_USER_HOSTS` (default `%`, a comma list such as `10.0.%,localhost`).

### Frontend: `nfe/.env.local`

| Name | Meaning |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | Where the browser calls the API. Locally `http://localhost:8787/api/v1` (the gateway). In production leave it unset to use the same-origin proxy |
| `API_ORIGIN` | Gateway address used by the server-side proxy (`http://localhost:8787` locally) |
| `API_PROXY_SECRET` | Must equal the backend's `PROXY_SECRET` |
| `ALLOW_INSECURE_API_ORIGIN` | `true` lets a production build call an `http://` gateway on a private network (used in Docker and Kubernetes) |
| `TRUST_PROXY_HEADERS` | `true` behind an ingress that sets `X-Real-IP` itself (ingress-nginx does), so rate limits see each visitor |
| `NEXT_PUBLIC_PORTAL_OPEN` | `true` opens the portal; otherwise visitors see an "under construction" page |

## 6. Everyday commands

| Where | Command | What it does |
|---|---|---|
| repo root | `npm start` | Run the gateway, the services and the file server together (Ctrl+C stops all) |
| repo root | `npm run db:local` | Start the private MySQL and create the database and accounts |
| repo root | `npm run db:migrate` | Apply new database migrations |
| repo root | `npm test` | Unit tests, then integration tests (start the backend first, for the integration part) |
| repo root | `npm run test:unit` | 101 unit tests; need no database or network |
| repo root | `npm run test:integration` | 52 tests through the real gateway, services and database |
| repo root | `npm run smoke` | 89 quick checks through the real gateway (start the backend first) |
| repo root | `npm run typecheck` | Type check every backend package |
| repo root | `npm run security` | Secret scan and dependency advisories |
| one service | `npm run dev -w @neuravic/auth-service` | Run a single service with restart on changes (also `portal`, `leads`, `admin`, `worker`, `gateway`) |
| `nfe` | `npm run dev` | Website with live reload on port 5173 |
| `nfe` | `npm run lint`, `npm run typecheck`, `npm run build` | Quality checks and a production build |
| `deployment` | `docker compose -f docker-compose.yml --env-file .env up --build` | The whole system in containers (copy `.env.example` to `.env` first) |
| `deployment/helm` | `helm lint neuravic` and `helm template t neuravic` | Check the Kubernetes chart |

To change the database, add a new numbered file in `database/migrations/` (statements separated by lines containing only `-- @@`) and run `npm run db:migrate`. Never edit a migration that has already been applied.

To add an API route, put it in the right module under `nbe/core/src/modules`, mount it in the service that owns it (`nbe/services/<name>/src/index.ts`), and add a gateway rule if it is a new top-level path (`nbe/services/gateway/src/index.ts`).

## 7. If something goes wrong

| Symptom | Fix |
|---|---|
| The site shows an error page such as "process is not defined" | The dev server cache is stale. Stop `npm run dev`, delete `nfe/.next`, start it again and hard-refresh the browser (Ctrl+Shift+R) |
| "Sign-in is being set up and is not available" on the login page | The gateway is not running or not reachable. Run `npm start` at the repo root and check http://127.0.0.1:8787/api/v1/health |
| `DATABASE_URL is not set` | Run `npm run db:local` at the repo root, or put your own `DATABASE_URL` in `.env` |
| Cannot connect to MySQL | `npm run db:local` starts the private MySQL again; it keeps running until you stop it |
| Sign-up says the account already exists | That email is registered. Log in, or use the emailed link option |
| "Too many attempts" | Rate limit reached; wait a few minutes. The smoke test clears its own limits in development |
| Port already in use | Stop the old process on that port, or change `GATEWAY_PORT` and the service ports in `.env` |
| A page says a service is not available (503) | Read the health response (`/api/v1/health`) to see which service is down, then look at its log line in the `npm start` output |
| Emails never arrive | In development nothing is sent; read them at `/api/v1/dev/mailbox` (served by the worker, so it must be running). In production set `RESEND_API_KEY` |

## 8. Brand and content

- The website uses only the approved palette: Ink `#070A12`, Slate `#121824`, Paper `#F5F7FA`, Muted `#667085` and Electric blue `#365BFF`. Type is Termina (weights 300, 400, 500) from the Adobe Fonts web project `okn5dwf`.
- Brand images are in `nfe/public/assets/` (`neuravic-logo.png`, `neuravic-mark.png`, `neuravic-pattern.svg`). The hero artwork is vector shapes drawn by `components/hero-art.tsx`.
- Marketing text comes from the API (`GET /content`) with built-in copy as the fallback, so the home page still renders when the API is down. Staff can edit the text through the API without redeploying.
- Project image frames stay empty until original project photography is supplied.
