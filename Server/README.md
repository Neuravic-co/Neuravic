# Server: Neuravic API on Node.js and MySQL

The same API as [`NBE`](../NBE/README.md) (same routes, roles, rules and responses; see [`../Docs/API.md`](../Docs/API.md)),
running as a normal Node.js process on a **MySQL** database instead of Cloudflare Workers and D1.
The website in [`NFE`](../NFE) talks to it without any change.

| | NBE | Server |
|---|---|---|
| Runtime | Cloudflare Workers | Node.js 22.13+ (Hono on `@hono/node-server`) |
| Database | D1 (SQLite) | MySQL 8+ (`mysql2` + Drizzle) |
| Uploads | R2 | files on disk (`UPLOAD_DIR`, default `uploads/`) |
| Scheduled jobs | cron trigger | timer in the process, every 5 minutes |
| Dev emails | not printed anywhere | in-memory dev mailbox (development only) |

## Run it locally

```bash
cd Server
npm install
npm run mysql:local      # starts a private MySQL on 127.0.0.1:3307, creates the database and user, writes .env
npm run migrate          # creates the tables and the write guards (triggers)
npm start                # API on http://127.0.0.1:8787
```

`npm run mysql:local` never touches another MySQL on your machine. It needs MySQL 8+ installed
(`MYSQL_HOME` can point at it; the default is `C:/Program Files/MySQL/MySQL Server 9.1`). To use your own server instead,
skip it and put its address in `.env`: `DATABASE_URL=mysql://user:password@host:3306/neuravic` (create the empty database first).

Then the website, in a second terminal:

```bash
cd NFE
npm install
```

`NFE/.env.local`:

```
NEXT_PUBLIC_API_BASE_URL=http://localhost:8787/api/v1
API_ORIGIN=http://localhost:8787
NEXT_PUBLIC_PORTAL_OPEN=true
```

```bash
npm run dev              # http://localhost:5173
```

### Signing in locally

Accounts have no password: the site emails a one-time link. In development, with no mail provider configured, the API keeps the
emails in memory and shows them at **http://127.0.0.1:8787/api/v1/dev/mailbox** (newest first, each with its link).
Sign up at `/signup` or log in at `/login`, open the mailbox, and open the link.

The first sign-in with `BOOTSTRAP_ADMIN_EMAIL` (default `admin@neuravic.local`) creates the staff admin. The admin can create
organisations and invite people from the API; clients then see their projects in the portal.

## Check that everything works

With the API running:

```bash
npm run smoke
```

It exercises about 80 things through the real HTTP API: sign-up, sign-in and sign-out, one-time links, the contact form and
its emails, the staff tools, organisations, projects, requests, approvals, comments, file upload and download, members and
roles, privacy requests and the safety rules (last owner, last admin, foreign origins).

## What changed from NBE

- `src/db/schema.ts` is a MySQL schema; `sql/001_init.sql` creates it. Text is compared byte for byte (`utf8mb4_bin`), as SQLite did.
- SQLite's `RAISE(ABORT, ...)` triggers became MySQL `SIGNAL` triggers with the same markers, so the API answers the same way.
- Atomic batches run in one MySQL transaction (`runBatch` in `src/db/index.ts`). `changes() > 0` became `ROW_COUNT() > 0`.
- MySQL has no `RETURNING` and no partial indexes: affected-row counts replace the first, and a generated `open_key` column
  keeps "one open privacy request per kind" unique.
- Cleanup deletes use `DELETE ... LIMIT`; subqueries on the table being changed go through a derived table.
- Schema changes: add `sql/002_something.sql` (statements separated by `-- @@` lines) and run `npm run migrate`.

## Not production-ready yet

Review these before real use: set `APP_ENV=production` with HTTPS origins, a dedicated `PRIVACY_HASH_SECRET`, `MFA_ENCRYPTION_KEY`,
`RESEND_API_KEY` (real email), and `MALWARE_SCANNER_URL` (without a scanner, uploads stay quarantined; the
development scanner marks everything clean and only runs in development). Put the process behind HTTPS, and run it with a
process manager. The existing unit tests in `../Test/backend` still target NBE and SQLite; they were not ported.
