# Neuravic API reference

Base path `/api/v1`. JSON in and out. Errors are `application/problem+json`:

```json
{ "type": "about:blank", "title": "Validation failed", "status": 400, "code": "validation_failed",
  "requestId": "01J...", "errors": [{ "path": "email", "message": "Invalid email" }] }
```

Lists use cursor pagination: `?limit=25&cursor=<nextCursor>` and return `{ "items": [...], "nextCursor": "..." | null }`.

**Request ids.** Every response has an `x-request-id` header. You may send your own (8 to 64 characters from `A-Z a-z 0-9 . _ -`); anything else is replaced. Quote it when reporting a problem.

**Limits.** JSON bodies are limited to 256 KB (`413` beyond that). File uploads have their own 10 MB limit.

**Caching.** API responses are sent with `Cache-Control: no-store`, except the public content endpoints, which are cacheable for up to 5 minutes.

**Sessions.** `POST /auth/verify` sets an HttpOnly cookie. Browser calls must use `credentials: "include"`,
and state-changing requests must come from an origin listed in `ALLOWED_ORIGINS`, otherwise `403`.

Roles: **client** org roles `viewer < member < admin < owner`; **staff** roles `admin`, `delivery`, `sales`.

## Public

| Method and path | Purpose |
|---|---|
| `GET /health`, `GET /version` | Liveness and build version |
| `POST /leads` | Submit an enquiry. Body below. Returns `202 { id, status }`. Limit 5 per hour per client |
| `GET /content` | All site content: `services`, `projects`, `process`, `team`, `company` |
| `GET /content/{services,projects,process,team,company}` | One section |
| `GET /.well-known/jwks.json` | Public keys for verifying SSO tokens |

```json
POST /leads
{ "name": "Sara Ali", "email": "sara@example.com", "company": "Acme",
  "message": "We need to automate access approvals.",
  "serviceInterest": ["ai", "software", "product", "ops"],
  "budgetBand": "optional", "consent": true,
  "turnstileToken": "required when TURNSTILE_SECRET is set",
  "website": "" }
```

`website` is a honeypot and must stay empty. Repeating the same email and message within 24 hours returns the original id.

## Authentication

| Method and path | Auth | Purpose |
|---|---|---|
| `POST /auth/magic-link` `{ email }` | none | Email a sign-in link. Always `202`, whether or not the account exists |
| `POST /auth/verify` `{ token }` | none | Exchange the link token for a session cookie |
| `POST /auth/logout` | session | End the session (`204`) |
| `GET /me` | session | User and organisation memberships |
| `PATCH /me` `{ name }` | session | Update profile |
| `POST /token/exchange` `{ audience, orgId? }` | session | Short-lived (5 min) EdDSA JWT for DARKAGENT or COOLACCESS_DXB |

Product tokens carry `iss`, `aud`, `sub`, `email`, `name`, `iat`, `exp`, `jti`, plus `org` and `role` when `orgId` is sent and `staff` for Neuravic staff.
Products must verify the signature with the JWKS and check `iss`, `aud` and `exp`.

## Organisations and members

| Method and path | Who |
|---|---|
| `POST /orgs` `{ name, slug?, ownerEmail? }` | staff admin |
| `GET /orgs` | staff admin, delivery |
| `GET /orgs/:orgId` | any member |
| `GET /orgs/:orgId/members` | any member |
| `POST /orgs/:orgId/members` `{ email, role, name? }` | org admin+ (cannot grant above own role) |
| `PATCH /orgs/:orgId/members/:userId` `{ role }` | org admin+ |
| `DELETE /orgs/:orgId/members/:userId` | org admin+, or the member leaving. An org always keeps one owner |

## Portal

| Method and path | Who |
|---|---|
| `GET /orgs/:orgId/projects` | viewer+ |
| `POST /orgs/:orgId/projects` `{ name, description? }` | admin+ |
| `GET /projects/:id`, `PATCH /projects/:id` `{ name?, description?, status? }` | viewer+, admin+ |
| `GET /projects/:id/requests?state=` | viewer+ |
| `POST /projects/:id/requests` `{ type, title, body, requiredApprovals? }` | member+ |
| `GET /orgs/:orgId/requests?state=` | viewer+ (approver queue) |
| `GET /requests/:id` | viewer+ (with approvals, comments, files) |
| `PATCH /requests/:id` `{ state: "cancelled" \| "completed" }` | requester or admin cancels open ones; admin completes approved ones |
| `POST /requests/:id/approvals` `{ decision, comment? }` | admin+, not the requester |
| `GET/POST /requests/:id/comments` | viewer+ read, member+ write |
| `GET /orgs/:orgId/activity` | viewer+ |

Lists and details include people details so a UI never needs a second lookup: requests carry `requesterName` and
`requesterEmail`, approvals `approverName` and `approverEmail`, comments `authorName` and `authorEmail`, and activity
items `actorName` and `actorEmail`.

Request types: `access`, `change`, `support`, `other`. States: `open`, `approved`, `rejected`, `cancelled`, `completed`.
A rejection closes the request at once; it is approved when `requiredApprovals` (1 to 3) approvals are in.

## Files

| Method and path | Who |
|---|---|
| `PUT /requests/:id/files?name=report.pdf` (raw body, `Content-Type` of the file) | member+ |
| `GET /requests/:id/files` | viewer+ |
| `GET /files/:id/content` | viewer+ (always downloads as an attachment) |
| `DELETE /files/:id` | uploader or admin+ |

Maximum 10 MB and 20 files per request. Allowed: PDF, PNG, JPEG, WebP, plain text, CSV, DOCX, XLSX.
Returns `503` until an R2 bucket is bound.

## Staff

| Method and path | Who |
|---|---|
| `GET /leads?status=` , `GET /leads/:id` | staff admin, sales |
| `PATCH /leads/:id` `{ status }`, `POST /leads/:id/notes` `{ body }` | staff admin, sales |
| `GET /leads/export.csv?from=&to=` | staff admin, sales |
| `GET /admin/overview` | staff admin |
| `GET /admin/users?staff=`, `PATCH /admin/users/:id` | staff admin |
| `POST /admin/staff` `{ email, name?, staffRole }` | staff admin |
| `GET /admin/audit?action=&orgId=` | staff admin |
| `GET /admin/content/:section`, `PUT /admin/content/:section/:slug`, `DELETE ...` | staff admin |

Lead statuses: `new`, `qualified`, `won`, `lost`, `spam`.
