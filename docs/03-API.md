# 03 API reference

Every endpoint of the backend, who may call it and what it returns.
Part of the documentation set: [01 Architecture](01-Architecture.md), [02 Getting started](02-Getting-Started.md), **03 API reference** (this file), [04 Security](04-Security.md), [05 Operations](05-Operations.md).

## 1. Where requests go

The website (and any client) talks to one address, the gateway. It forwards each path to the service that owns it:

| Path under `/api/v1` | Service |
|---|---|
| `/auth/*`, `/me`, `/me/privacy/*`, `/token/*`, `/admin/privacy-requests/*`, `/.well-known/jwks.json` | auth |
| `/orgs/*`, `/projects/*`, `/requests/*` | portal |
| `/requests/:id/files`, `/files/*` | file server |
| `/leads/*`, `/content/*` | leads |
| `/admin/*` | admin |
| `/health`, `/version` | gateway (health also reports every service) |
| `/dev/*` | worker (development only) |

Callers never need to know this; every endpoint below is reached through the same base path.

## 2. Conventions

Base path `/api/v1`. JSON in and out. Errors are `application/problem+json`:

```json
{ "type": "about:blank", "title": "Validation failed", "status": 400, "code": "validation_failed",
  "requestId": "01J...", "errors": [{ "path": "email", "message": "Invalid email" }] }
```

| Topic | Rule |
|---|---|
| Pagination | `?limit=25&cursor=<nextCursor>`; lists return `{ "items": [...], "nextCursor": "..." \| null }` |
| Request ids | Every response has an `x-request-id` header. You may send your own (8 to 64 characters from `A-Z a-z 0-9 . _ -`); anything else is replaced. Quote it when reporting a problem |
| Content type | Requests with a JSON body must send `Content-Type: application/json`, otherwise `415` |
| Size limits | JSON bodies 256 KB (`413` beyond that). File uploads 10 MB |
| Caching | Responses are `Cache-Control: no-store`, except the public content endpoints (up to 5 minutes) |
| Sessions | Sign-in sets an HttpOnly cookie (`__Host-nv_session` in production, `nv_session` in development). Browser calls use `credentials: "include"` |
| Origins | State-changing requests with a cookie must come from an origin in `ALLOWED_ORIGINS`, otherwise `403`. The `/auth/*` endpoints apply the same rule to any request that names an origin |
| Maintenance | With `MAINTENANCE_MODE=true` everything except `/health` and `/version` answers `503` with `Retry-After` |
| Staff MFA | A staff session that has not completed authenticator verification gets `403 mfa_required` everywhere except the sign-in and MFA endpoints |

Roles: **client** organisation roles `viewer < member < admin < owner`; **staff** roles `admin`, `delivery`, `sales`.

Common errors: `400` validation, `401` not signed in or wrong credentials, `403` not allowed, `404` not found (also used for objects in other organisations), `409` conflict, `422` unprocessable, `429` rate limited, `503` unavailable.

## 3. Public

| Method and path | Purpose |
|---|---|
| `GET /health`, `GET /version` | Health and build version. The gateway's health lists each service: `{"status":"ok","services":{"auth":"ok",...}}`, with `degraded` or `maintenance` when something is wrong |
| `POST /leads` | Submit an enquiry. Returns `202 { id, status }`. Limit 5 per hour per client |
| `GET /content` | All site content: `services`, `projects`, `process`, `team`, `company` |
| `GET /content/{services,projects,process,team,company}` | One section |
| `GET /.well-known/jwks.json` | Public keys for verifying SSO tokens (not under `/api/v1`) |

```json
POST /leads
{ "name": "Sara Ali", "email": "sara@example.com", "company": "Acme",
  "message": "We need to automate access approvals.",
  "serviceInterest": ["ai", "software", "product", "ops"],
  "budgetBand": "optional", "consent": true,
  "website": "" }
```

`website` is a honeypot and must stay empty. Repeating the same email and message within 24 hours returns the original id.

## 4. Accounts and sessions

| Method and path | Auth | Purpose |
|---|---|---|
| `POST /auth/register` `{ name, email, password, consent: true }` | none | Create a client account with a password and sign in. `200 { user }` plus the session cookie. `409` if the email is taken. Limit 20 per hour per IP, 5 per hour per email |
| `POST /auth/login` `{ email, password }` | none | Sign in with a password. `200 { user }` plus the cookie. A wrong password and an unknown email both return `401` "Email or password is incorrect". Limit 30 per 15 minutes per IP, 10 per 15 minutes per email |
| `POST /auth/magic-link` `{ email }` | none | Email a one-time sign-in link. Always `202`, whether or not the account exists |
| `POST /auth/signup` `{ name, email, consent: true }` | none | Create an account and email a one-time link (no password). Always `202` |
| `POST /auth/verify` `{ token }` | none | Exchange a link token for a session cookie. Tokens work once and expire after 15 minutes |
| `POST /auth/logout` | session | End the session (`204`) |
| `GET /me` | session | User and organisation memberships |
| `PATCH /me` `{ name }` | session | Update the profile |
| `GET /me/privacy/export` | session | Limited copy of your own account data |
| `GET /me/privacy/requests`, `POST /me/privacy/requests` | session | List or file a data export or erasure request. One open request per kind |
| `POST /token/exchange` `{ audience, orgId? }` | session | Short-lived (5 minutes) EdDSA token for another Neuravic product |

Passwords are 8 to 128 characters. Staff accounts are created by an admin, not by sign-up.

Product tokens carry `iss`, `aud`, `sub`, `email`, `name`, `iat`, `exp`, `jti`, plus `org` and `role` when `orgId` is sent and `staff` for Neuravic staff.
Products must verify the signature against the JWKS and check `iss`, `aud` and `exp`.

### Staff authenticator (MFA)

| Method and path | Purpose |
|---|---|
| `GET /auth/mfa` | `{ enrolled, required }` for the signed-in staff member |
| `POST /auth/mfa/setup` | Start enrolment; returns the secret and an `otpauth://` link |
| `POST /auth/mfa/confirm` `{ code }` | Confirm enrolment; returns one-time recovery codes |
| `POST /auth/mfa/verify` `{ code }` | Prove a code (or a recovery code) for this session |
| `POST /auth/mfa/recovery-codes` `{ code }` | Replace the recovery codes using a fresh authenticator code |

Each MFA endpoint is limited to 10 attempts per 10 minutes per account.

## 5. Organisations and members

| Method and path | Who |
|---|---|
| `POST /orgs` `{ name, slug?, ownerEmail? }` | staff admin |
| `GET /orgs` | staff admin, delivery |
| `GET /orgs/:orgId` | any member |
| `GET /orgs/:orgId/members` | any member |
| `POST /orgs/:orgId/members` `{ email, role, name? }` | org admin or owner (cannot grant above own role) |
| `PATCH /orgs/:orgId/members/:userId` `{ role }` | org admin or owner |
| `DELETE /orgs/:orgId/members/:userId` | org admin or owner, or the member leaving. An organisation always keeps one owner |

## 6. Portal

| Method and path | Who |
|---|---|
| `GET /orgs/:orgId/projects` | viewer+ |
| `POST /orgs/:orgId/projects` `{ name, description? }` | admin+ |
| `GET /projects/:id`, `PATCH /projects/:id` `{ name?, description?, status? }` | viewer+, admin+ |
| `GET /projects/:id/requests?state=` | viewer+ |
| `POST /projects/:id/requests` `{ type, title, body, requiredApprovals? }` | member+ |
| `GET /orgs/:orgId/requests?state=` | viewer+ (approver queue) |
| `GET /requests/:id` | viewer+ (with approvals, comments, files) |
| `PATCH /requests/:id` `{ state: "cancelled" \| "completed" }` | the requester or an admin cancels open ones; an admin completes approved ones |
| `POST /requests/:id/approvals` `{ decision, comment? }` | admin+, not the requester |
| `GET /requests/:id/comments`, `POST /requests/:id/comments` | viewer+ read, member+ write |
| `GET /orgs/:orgId/activity` | viewer+ |

Lists and details include people details so a UI never needs a second lookup: requests carry `requesterName` and `requesterEmail`, approvals `approverName` and `approverEmail`, comments `authorName` and `authorEmail`, and activity items `actorName` and `actorEmail`.

Project statuses: `active`, `paused`, `completed`. Request types: `access`, `change`, `support`, `other`. Request states: `open`, `approved`, `rejected`, `cancelled`, `completed`.
A rejection closes the request at once; a request is approved when `requiredApprovals` (1 to 3) approvals are in.

## 7. Files

| Method and path | Who |
|---|---|
| `PUT /requests/:id/files?name=report.pdf` (raw body, with the file's `Content-Type`) | member+ |
| `GET /requests/:id/files` | viewer+ |
| `GET /files/:id/content` | viewer+ (always an attachment download) |
| `DELETE /files/:id` | the uploader or admin+ |

At most 10 MB per file and 20 files per request. Allowed types: PDF, PNG, JPEG, WebP, plain text, CSV, DOCX, XLSX.
New files are quarantined (`scanState` pending) and cannot be downloaded until the malware scanner marks them clean. Without a configured scanner, files stay quarantined.

## 8. Staff

| Method and path | Who |
|---|---|
| `GET /leads?status=`, `GET /leads/:id` | staff admin, sales |
| `PATCH /leads/:id` `{ status }`, `POST /leads/:id/notes` `{ body }` | staff admin, sales |
| `GET /leads/export.csv?from=&to=` | staff admin, sales (formulas are neutralised) |
| `GET /admin/overview` | staff admin |
| `GET /admin/security-status` | staff admin (health of MFA enrolment, quarantine, outbox and key presence) |
| `GET /admin/users?staff=`, `PATCH /admin/users/:id` `{ status?, staffRole? }` | staff admin |
| `POST /admin/staff` `{ email, name?, staffRole }` | staff admin (adds or promotes a person and emails a sign-in link) |
| `GET /admin/audit?action=&orgId=` | staff admin |
| `GET /admin/content/:section`, `PUT /admin/content/:section/:slug`, `DELETE /admin/content/:section/:slug` | staff admin |
| `GET /admin/privacy-requests`, `PATCH /admin/privacy-requests/:id` | staff admin (another admin than the subject; needs identity and retention attestations) |

Lead statuses: `new`, `qualified`, `won`, `lost`, `spam`.
The last active staff admin cannot be disabled or demoted (`409`).

## 9. Development only

| Method and path | Purpose |
|---|---|
| `GET /dev/mailbox`, `DELETE /dev/mailbox` | Read or clear the in-memory mailbox that holds emails and sign-in links. Served by the worker, and only when `APP_ENV=development` and no email provider is configured |
