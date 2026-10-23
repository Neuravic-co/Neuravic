# API and integration inventory

> Updated by the Phase 3 additions below, 23 October 2026. The later inventory supersedes earlier single-key JWKS/download descriptions. Owner-controlled maintenance mode contains API application traffic and newly scheduled work; health/version remain available.

Reviewed 22 October 2026. Paths below are relative to `/api/v1` except JWKS. Hono also serves HEAD for GET routes. Undeclared methods/paths have no handler. All writes parse an explicit field allow-list; supplying `orgId`, `staffRole` or ownership fields in an unrelated body does not override server values. Every protected route calls `requireActor`, `requireStaff` or `requireOrgRole` on the server. UI role checks only hide controls.

Global boundary: bounded request body → origin check on cookie-authenticated writes and sign-in → session lookup → route policy → parameterized Drizzle/D1 operation. Private responses/errors are no-store; successful public content and JWKS opt into caching. Staff admin has owner access across tenants; delivery has admin access; sales needs a membership for portal data.

| Method / route | Caller and frontend consumer | Data operation and response |
|---|---|---|
| GET `/health` | Public; local readiness checks | Liveness only, `{status}`; no database readiness claim |
| GET `/version` | Public; operators | Configured application version |
| POST `/leads` | Public; `contact-form.tsx` | Validate consent/email/lengths, honeypot, spam score, optional Turnstile, per-IP limit; atomic lead + audit + notification jobs; 202 `{id,status}`. Same normalized email/message within 24 hours returns the original ID. |
| GET `/content` | Public; server `site-content.ts` → home page | Published site copy in one query, grouped sections; one-time default seeding; public cache |
| GET `/content/:segment` | Public; optional section clients | Published records for services/projects/process/team/company, `{items}` |
| POST `/auth/magic-link` | Public; portal sign-in | Per-IP and per-email limits; known enabled accounts only; token + email outbox + audit; constant 202 response shape |
| POST `/auth/verify` | Public; `verify-login.tsx` | Single-use, unexpired link → active user and fresh hashed session; HttpOnly first-party cookie and minimal user response |
| POST `/auth/logout` | Session if present; `session.tsx` | Delete current server session and cookie; idempotent 204 |
| GET `/me` | Session; portal boot | Minimal user identity plus joined organisation memberships |
| PATCH `/me` | Session; profile name | Update only name; `{id,name}` |
| POST `/token/exchange` | Session; product integration | Allow-listed audience and optional tenant membership; short-lived EdDSA JWT; audit; `{token,expiresIn}` |
| GET `/.well-known/jwks.json` | Public; product verifiers | Public Ed25519 key only; no private JWK; public cache |
| GET `/orgs` | Staff admin/delivery; staff organisation picker | Cursor-paginated organisation directory |
| POST `/orgs` | Staff admin; staff organisation creation | Atomic org + optional owner invitation + audit; 201 identity |
| GET `/orgs/:orgId` | Viewer+ in target org | Organisation and effective role; non-members receive 404 |
| GET `/orgs/:orgId/members` | Viewer+; members view | Cursor-paginated membership/user display fields; `{items,nextCursor}` |
| POST `/orgs/:orgId/members` | Admin+; members view | Cannot grant above caller; create invited user if absent, membership, login email and audit in batch |
| PATCH `/orgs/:orgId/members/:userId` | Admin+; members view | Cannot change a higher role or demote last owner; role update and audit |
| DELETE `/orgs/:orgId/members/:userId` | Admin+, or self leaving | Cannot remove a higher role or last owner; delete membership and audit; 204 |
| GET `/orgs/:orgId/projects` | Viewer+; projects view | Cursor-paginated projects scoped to org |
| POST `/orgs/:orgId/projects` | Admin+; project creation | Server derives org/creator; project + audit; 201 |
| GET `/projects/:id` | Viewer+ in owning org | Load object then tenant policy; project record |
| PATCH `/projects/:id` | Admin+ in owning org | Only name/description/status; update + audit |
| GET `/projects/:id/requests` | Viewer+; project requests | Cursor/state-filtered list plus requester display identity |
| POST `/projects/:id/requests` | Member+; request forms | Active projects only; type/title/body/approval count; derive org/requester; request + bounded approver emails + audit; 201 |
| GET `/orgs/:orgId/requests` | Viewer+; requests/approver queue | Cursor/state-filtered requests within one org |
| GET `/requests/:id` | Viewer+ in owning org; request detail | Requester, approvals, at most 100 recent comments plus `commentsNextCursor`, and bounded attachment metadata/scan state; storage keys excluded |
| PATCH `/requests/:id` | Requester or admin cancels; admin completes | Allowed state transitions only; compare-and-set prevents overwriting concurrent decision |
| POST `/requests/:id/approvals` | Admin+ excluding requester | One decision per approver; decision + SQL-calculated outcome + audit; terminal-outcome notification |
| GET `/requests/:id/comments` | Viewer+; request detail | Joined author identity and comments, `{items}` |
| POST `/requests/:id/comments` | Member+; request detail | Bounded plain-text comment + audit; 201 |
| GET `/orgs/:orgId/activity` | Viewer+; activity view | Cursor-paginated tenant audit projection with actor display identity, excluding private audit metadata/IP hashes |
| PUT `/requests/:id/files?name=` | Member+; request attachment form | MIME allow-list, actual byte cap, per-request quota; org-scoped private R2 key + metadata/audit; 201; cleanup if DB write fails |
| GET `/requests/:id/files` | Viewer+; request detail | Safe metadata only; no storage key |
| GET `/files/:id/content` | Viewer+ in owning org | Block infected files; private attachment download with nosniff; 404 for other tenants |
| DELETE `/files/:id` | Uploader or admin+ in owning org | Metadata + audit, then best-effort object deletion; 204 |
| GET `/leads` | Staff admin/sales; enquiries inbox | Cursor/status-filtered leads; IP/message hashes removed |
| GET `/leads/:id` | Staff admin/sales; enquiry detail | Lead plus internal notes; private hashes removed |
| PATCH `/leads/:id` | Staff admin/sales; enquiries inbox | Validated status only; update + audit |
| POST `/leads/:id/notes` | Staff admin/sales; enquiry detail | Bounded internal note; 201 |
| GET `/leads/export.csv` | Staff admin/sales; export | Bounded 5,000-row export/date range, quoted cells/formula neutralization, export audit; private attachment |
| GET `/admin/overview` | Staff admin | Aggregate counts; no raw enquiry data |
| GET `/admin/users` | Staff admin | Cursor-paginated users with staff filter |
| POST `/admin/staff` | Staff admin | Invite/promote user, fresh login email, audit; existing credentials revoked on privilege change |
| PATCH `/admin/users/:id` | Staff admin | Explicit name/status/staff-role fields; protect self/last active admin; security changes revoke credentials |
| GET `/admin/audit` | Staff admin | Cursor/action/org-filtered audit projection; no IP hash |
| GET `/admin/content/:segment` | Staff admin | Include unpublished content |
| PUT `/admin/content/:segment/:slug` | Staff admin | Strict content-kind schema; atomic upsert + audit |
| DELETE `/admin/content/:segment/:slug` | Staff admin | Delete the matching content record and audit; 204 |

## Frontend and trust boundaries

`NFE/lib/api.ts` sends credentials to same-origin `/api/v1` by default and decodes problem JSON. The Vercel catch-all streams requests to a configured `API_ORIGIN`, strips connection/proxy headers, passes the original browser Origin, uses a timeout and refuses redirects. A shared proxy secret allows NBE to trust the forwarded visitor address; unauthenticated forwarded headers are never identity evidence. Cloudflare same-domain routing can instead bypass the Vercel function. Vercel's body-size limit remains smaller than the API's upload limit.

The marketing page uses a bounded server-side content fetch with built-in fallbacks. Portal UI types mirror server projections. PIMS, leave/calendar, tools catalogue and support are explicitly sample data or mailto links in `lib/workspace.ts`/`lib/portal.ts`; no new HR/ticketing backend is implied by those screens. No password authentication is present or required.

## Test evidence and limits

Existing suites cover authentication, role/tenant access, portal decisions, files, enquiry validation/spam/duplicates, CSV safety, SSO, shared rate counters, outbox leases, migrations/atomic batches, retention and query plans. New security regressions exercise confirmed weaknesses; see `audit-2026-10-22.md` for actual run results. libSQL is useful but does not prove Cloudflare runtime compatibility; local Wrangler migrations/build and CI add that evidence. Production credentials/settings are intentionally not read or modified.


## Phase 2 additions

All application/SSO routes deny staff sessions awaiting MFA (`403 mfa_required`). Only the exact MFA setup/verification, magic-link exchange and logout routes remain available; incomplete verification expires after ten minutes. Clients retain existing authorization.

| Endpoint | Authorization | Behavior |
|---|---|---|
| GET `/auth/mfa` | Signed-in staff, including restricted first-factor session | Enrollment/required booleans only, no seeds/codes |
| POST `/auth/mfa/setup` | Fresh staff session; trusted origin; account limit | Returns the same pending authenticator seed on retry; active factors cannot be overwritten |
| POST `/auth/mfa/confirm` | Staff; trusted origin; account limit | Proves pending TOTP, stores encrypted factor/hashed recovery codes, upgrades session and audits atomically; shows recovery codes once |
| POST `/auth/mfa/verify` | Staff; trusted origin; account limit | Consumes a TOTP step or recovery code once and upgrades only the live session |
| GET `/requests/:id/comments` | Viewer+ in the owning org | Cursor-paginated comments/display identities, limit 1–100; tenant checks precede queries |
| GET `/admin/security-status` | Staff admin with completed MFA when required | DB/control presence, enrolled staff and quarantine/outbox aggregate evidence; no secrets or client content |

Downloads require an exact `clean` scan state for every role. Scan verdicts enter only through the private service adapter/cron, not a public API or client-writable field. Uploads stay bounded to 10 MiB/20 attachments and add basic byte-signature/UTF-8 checks. See the operations runbook for scanner provisioning.

## Phase 3 additions

| Endpoint | Authorization | Behavior |
|---|---|---|
| POST `/auth/mfa/recovery-codes` | Already MFA-verified staff session, trusted origin, shared account guessing limit, fresh unused TOTP | Atomically replace all recovery hashes, consume step, upgrade session and audit; show eight replacement codes once. Unverified sessions and recovery-code proof cannot authorize replacement. |
| GET `/me/privacy/export` | Authenticated caller, session age at most 15 minutes, account limit | Limited profile/current memberships only, bounded to 100; attachment/no-store and audit. No other people, security credentials or tenant/internal records; full response needs supervised review. |
| GET `/me/privacy/requests` | Authenticated caller | Paginated own requests; omit private reviewer/reference. Portal Privacy screen. |
| POST `/me/privacy/requests` | Recent caller, trusted origin, account limit | Strict export/erasure kind, server-derived subject, one open request per kind, race-safe dedup and audit. Never deletes records. |
| GET `/admin/privacy-requests` | Staff admin, MFA when required | Paginated private review queue. |
| PATCH `/admin/privacy-requests/:id` | Recent staff admin other than subject; trusted origin | Compare-and-set pending/in_review transition, opaque reference and identity/retention attestations; atomic audit. Records supervised fulfillment, not automated erasure/full export. |
| GET `/.well-known/jwks.json` | Public | Validated current/overlap public-only keys with 300-second cache. `SSO_PUBLIC_JWKS` accepts bounded public key set; private/conflicting/duplicate IDs rejected. |

Clean downloads now verify bounded complete stored bytes against database size/SHA-256 before release and use database MIME. Changed/read-failed content returns to pending and remains inaccessible; the scanner protocol also bounds stalled verdict streams. Enrolled factor removal/reset revokes sessions/outstanding links via migration 0009. See the [readiness report](phase-3-readiness.md) for tests and operational limits.
