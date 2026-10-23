# Production security configuration and recovery

This is a reviewable procedure for the owner. **Nothing here grants deployment, credential, recovery or repository-administration approval.** Use a separate staging account/Worker/D1/private bucket, designated test identities and independent secrets. Record approvals and evidence privately; attach only redacted status, dates and references to the release review. Never paste keys, recovery codes, tokens, exports or customer data into a PR/log.

## Environment and secret custody

| Setting/control | Required configuration and verification |
|---|---|
| Environment | Set `APP_ENV=production`, exact HTTPS `APP_URL`, and exact origin-only `ALLOWED_ORIGINS` including that website. Verify Secure/HttpOnly/`__Host-` cookies, trusted proxy behavior and no-store on private/error responses on the actual host. Do not mark arbitrary servers `VERCEL=1`. |
| Privacy identifiers | Independent random `PRIVACY_HASH_SECRET`, at least 32 cryptographically random characters, stored as a Worker secret. Different per environment and purpose. Public development key and known integration-key reuse are rejected. HMAC is pseudonymization, not deletion/anonymization. |
| Staff MFA | Independent `MFA_ENCRYPTION_KEY`: 32 random bytes encoded as 64 hex characters in the secret manager. `STAFF_MFA_REQUIRED=true` is mandatory for release; it defaults on outside development. Store encrypted backup and access procedure separately from D1. Never put it in public `NEXT_PUBLIC_*` settings. |
| Proxy | Matching independent `PROXY_SECRET` (Worker) / `API_PROXY_SECRET` (frontend), at least 32 characters, plus approved `API_ORIGIN`. Verify forged client forwarding headers do not affect identity. Rotate both ends under an approved contained cutover. |
| Mail / abuse prevention | Privately configure Resend sending domain/key, SPF/DKIM/DMARC and destination access. Configure actual public Turnstile site key and private API secret together, verify hostname/provider rejection/failure and WAF limits. Staging/production contact intake returns 503 when the secret is absent and rejects successful verdicts without a hostname matching an explicit `ALLOWED_ORIGINS` host. Development alone permits an unconfigured verifier. The CI `local-csp-fixture` site key must never become a production setting. |
| SSO | Private Ed25519 `SSO_PRIVATE_JWK`, stable unique `SSO_KEY_ID`, approved audiences and issuer. `SSO_PUBLIC_JWKS` is optional public-only overlap data; never include `d`. Test both product consumers. |
| Containment | Owner-controlled `MAINTENANCE_MODE=true` returns API 503 except health/version and pauses newly scheduled maintenance. Health says `maintenance`; JWKS remains public for outstanding tokens. It does not stop already-running tasks, revoke JWTs or protect a public bucket. Coordinate edge/provider containment and drain work before recovery. |

Inventory each secret's purpose, environment, owner, created/rotated dates, secret-manager version and recovery access. Use least privilege and individual MFA-protected accounts; prohibit shared credentials. Rotate promptly after exposure and on an owner-approved schedule. Verify replacements in staging and revoke superseded credentials only after the cutover plan succeeds. Do not print values in shell output, CI or test reports.

### Privacy-key rollout / rotation

Provision the new key privately before approved rollout; deployed configuration intentionally fails without it. Existing raw rate keys/unkeyed hashes remain subject to the documented retention and are not rewritten. Rotating the HMAC key changes correlation/rate identities immediately, so coordinate rate-limit windows/edge controls and monitoring; a new key cannot reconstruct old identifiers. Preserve any evidence under approved retention rather than attempting ad-hoc bulk rewrites. Test staging correlation separation, limits and redaction; no production key was generated or changed by this work.

### MFA enrollment, recovery and key rotation

1. Verify staff identity and email ownership out of band before first enrollment. Inventory all active staff and supervise setup; compromised email before enrollment is a bootstrap risk. Confirm all required staff enrolled via the private security-status aggregate and private roster review.
2. Enroll from a fresh email session, confirm an authenticator code, store the eight once-only recovery codes privately and acknowledge them. Test a second sign-in, code replay rejection and logout. Keep device/server clocks synchronized; investigate drift instead of widening the acceptance window.
3. A recovery code is valid only after a fresh email sign-in, is consumed once, and does not disable MFA. To replace codes, use the Privacy screen with an already verified session and a fresh unused authenticator code; old recovery codes then stop working. Do not record the codes in tickets or audit metadata.
4. Loss of both authenticator and codes requires a supervised owner-approved recovery: verify identity using independent evidence and two accountable reviewers, preserve a private incident reference, contain access, revoke existing credentials and remove/reset the factor only after approval. Database guards revoke sessions and outstanding links on enrolled-factor removal or an enrollment-time reset. Issue a new link only after verification and supervise re-enrollment. **There is no email-only factor reset API.** Do not overwrite ciphertext while preserving the old enabled time to simulate a reset.
5. Do not simply replace `MFA_ENCRYPTION_KEY`: existing seeds use AES-GCM with user ID as authenticated data and will become unreadable. There is no automatic multi-key rewrap utility in this release. A key rotation requires an owner-approved, separately reviewed migration: contain/drain, recover a private backup, decrypt/re-encrypt every enrolled seed under the new key with fresh IV and identical user-ID binding, preserve replay counters, verify every row in isolation, expire pending setup records, revoke sessions/links, invalidate recovery codes if required by the incident, and test fresh sign-in before reopening. Do not export plaintext seeds or disable enforcement to recover availability.
6. Rehearse backup-key recovery on staging with authentic encrypted fixture factors. The Phase 3 database restore uses placeholder ciphertext and cannot supply this evidence. If the encryption key is lost, undecryptable factors require supervised re-enrollment; a database backup alone is insufficient.

TOTP can be phished. Passkeys or an identity provider with an independently verified MFA policy are future security decisions, not claims about the current implementation.

## Upload quarantine and scanner commissioning

Keep R2 private with no public/custom-domain/object URL bypass; read only through authorized application routes. Select a scanner/data region approved for customer content, bind it privately as `MALWARE_SCANNER`, and restrict who can deploy/change the service. No shared HTTP scanner credential or public verdict callback is required.

The binding receives raw bytes by POST to `https://scanner.internal/scan`, octet-stream MIME and `X-Content-SHA256`. Return bounded JSON with exact matching digest and literal `clean` or `infected`; independently hash/scan complete bytes. No filename, tenant or email is sent. See the [protocol](operations-runbook.md#private-scanner-contract).

Require a real maintained engine, current signature feed and limits for nested/archive/decompression ratio, encrypted/unsupported containers, CPU, memory and execution time. Unknown, partial, stale-engine, encrypted or over-limit content must fail closed. The application bounds fetch plus verdict read to ten seconds and quarantines every error; it does not implement antivirus detection itself.

In staging, record clean fixtures, approved standard antivirus test fixtures, malformed signatures, unsupported/encrypted archives, digest mismatch, scanner disconnect/timeout/stalled stream and outage/recovery. Verify no role or direct storage path can read pending/infected/changed objects. Check digest again after scan/download. Re-scan old pending objects; never mark them clean in SQL to restore access. Validate engine version/signature freshness and private logs without uploading real client malware to public analysis services. Configure quarantine-age/failure alerts and an approved infected-file retention/deletion policy.

The application retries five due files per cron with a lease/backoff. A scanner outage must be visible as growing pending age, not treated as a clean verdict. Type signatures/UTF-8 validation are preliminary checks only; Office ZIP magic does not validate or sanitize complete documents. Download remains attachment/nosniff/sandbox.

## CSP and frontend staging verification

Use both host paths actually intended for deployment. Fetch real response headers on home, portal, privacy, verify and error pages. Confirm unique nonce values match rendered scripts, scripts have strict-dynamic with no production unsafe-eval/unsafe-inline, HTML is private/no-store, and the CDN never serves a shared nonce. Preserve `object-src`, frame/base/form restrictions and attachment sandbox. Current inline styles are a documented residual limitation.

With the real approved provider keys, exercise fonts, navigation, client hydration, contact validation/submission, Turnstile success/expiry/failure, login, MFA enrollment/recovery, privacy download/intake and tenant files. Test same-origin proxy and any explicitly approved cross-origin API. Browser fixtures prove policy mechanics; they do not validate real challenge-provider operation or production CDN overrides. Review new third-party scripts/origins before changing CSP. Configure private CSP/error monitoring with data minimization; no public collection endpoint was added.

## Monitoring, alerts and operational access

Configure an authenticated private monitor for `/api/v1/admin/security-status`; do not publish its session or expose the endpoint anonymously. Enrollment, quarantine, outbox and key-presence aggregates are evidence inputs, not a configured alert service. A 200 health response is liveness, not database/scanner/readiness proof.

Initial thresholds below are proposals requiring staging calibration, delivery tests and an assigned responder:

| Signal | Initial alert / required exercise |
|---|---|
| API failures | Sustained 5xx above 1% for five minutes with a minimum traffic count; inject an isolated dependency failure and verify responder delivery. |
| Authentication | Abnormal 401/429 rates, staff MFA failures/replay/recovery use, enrollment/reset and role changes. No email/IP labels or unapproved geo tracking. |
| Mail | Any dead job, oldest pending >15 minutes, provider reject/delivery failure; test provider outage and dead-letter review. |
| Scanner | Repeated scan failures, oldest pending >15 minutes, signature-feed staleness or engine outage; test timeout and recovery without releasing quarantined data. |
| Scheduled work | No successful maintenance completion for >15 minutes except approved containment; verify cron is actually enabled. Alert on unexpected/overlong maintenance mode. |
| Integrity/operations | Blob cleanup failures, unusual exports/SSO issuing, missing audit/backup stream, backup age >24 hours; exercise private alerts and access review. |

Assign incident ownership, acknowledgment/escalation, access review and retention. Keep operational dashboards, D1/R2, provider accounts and backup buckets private under least privilege and MFA. Export audit evidence to an approved separate tamper-resistant destination; application audit rows are mutable by a database administrator. Preserve evidence before secret rotation/deletion. Slack crash retries may duplicate; sensitive pending outbox bodies need restricted access and existing expiry/scrubbing.

## Backup, migration and disaster recovery

Approve retention, residency, RPO/RTO, named restore authority, encryption-key custody and provider plan coverage before release. Configure D1 Time Travel/backup availability for the actual plan and encrypted scheduled exports to an independently controlled private location, plus R2 object/version/metadata consistency and key backups. Do not store backup decryption keys next to the export or attach an export to GitHub. Test account loss as well as database loss.

### Migration release procedure (requires separate release approval)

1. Record exact combined commits, artifact versions, current schema/migration ledger and private recoverable snapshot references. Audit pre-existing inconsistent rows; triggers guard future writes without repairing old records.
2. Contain API and scheduled mutation work; drain in-flight jobs, then capture a consistent backup. Rehearse the same release against a staging copy with sanitized data and authentic staging MFA keys. Verify both upgrade from pre-hardening and current Phase 2 schema, data counts and negative guard tests.
3. Retain the compatible frontend supporting fragment and legacy links. Configure required secrets and migrate before the backend uses new tables/columns. Apply each missing migration **in order**, 0000 through 0009; do not replay applied migrations or use schema push on production. Phase 3 adds privacy table/indexes (0008) and enrolled-factor recovery guards (0009).
4. Check migration ledger, schema, data, auth/MFA, tenant roles, quarantine and outbox before any approved reopening. Keep the previous compatible artifacts privately. All migrations have local evidence; remote execution is still unverified.

### Recovery rehearsal and rollback limits

`node NBE/scripts/verify-local-recovery.mjs` only creates isolated local databases under ignored `tmp/`. It strips Cloudflare credential variables, asserts `--local`, exports schema/data separately, restores to a fresh target, compares data/migration counts, checks local SQLite integrity/FKs and rehearses revocation. D1 forbids the integrity-check pragma; the test opens the closed local SQLite database read-only for that check. This is **not** a remote recovery command or permission to restore production.

The tested export strategy requires a **quiescent source** while schema and data are exported. A raw interleaved export failed on forward foreign-key table references; create all schema first, then import the complete data with deferred FKs in the same transaction, preserving the migration ledger and triggers. Validate the actual provider restore mechanism separately; do not turn foreign-key enforcement off or assume local Miniflare timing is a production RTO.

For an approved real restore: identify source/target and snapshot time with a second reviewer; preserve incident evidence/current state; contain/drain and restore into a separately verified target first. A snapshot can resurrect used sessions, magic links, recovery codes, expired scan decisions and pending notifications. Before reopening, separately approve and verify revocation of restored sessions/links, invalidation of saved recovery codes, fresh-TOTP code replacement/re-enrollment as appropriate, and quarantine/revalidation of restored files. Hold pending deliveries for manual review so old messages are not resent; scrub sensitive payloads only after required evidence is preserved. Retain encrypted factor seeds only if their matching key is available and validated. Independently revalidate disabled users, role changes, legal holds and deletions after snapshot time.

The fixture rehearses containment by removing local sessions/links, clearing recovery hashes and holding/scrubbing pending jobs. **Do not copy those writes blindly to production**: approvals, snapshot delta reconciliation and evidence-retention review are required. The script proves guards survive restore; it does not decrypt a real factor or establish R2/provider consistency.

JWTs already issued may remain usable for up to five minutes; maintenance/session revocation does not invalidate them. Coordinate consumers and incident key revocation if necessary. Confirm no old key/token/cache path reopens access after restore. Reopen only after documented smoke tests, responder confirmation and owner approval; record measured production-like restore time/data loss against RPO/RTO.

Use forward repair or a compatible application rollback while preserving additive schema/guards/keys. Never blindly roll back to PR #55: it would remove MFA enforcement and restore pending-file downloads. Do not drop privacy/factor/scan tables or triggers as a routine rollback. Keep fragment-link-compatible NFE until all newer links expire. A database restore and every sensitive key rotation remain separately approved operations.

## SSO public-key overlap and rotation

1. Generate a new private key in the approved secret-management environment; assign a new unique key ID. Export **only** the public Ed25519 JWK. Keep current private signer A unchanged. Set public `SSO_PUBLIC_JWKS` to `{"keys":[<public A>,<public B>]}` in the approved environment; placeholder notation here is not valid configuration. Extra keys must have kty OKP/crv Ed25519/x/kid and no `d`; conflicting/duplicate IDs fail.
2. Verify both consumers fetch/publish A+B, enforce signature/EdDSA/kid/issuer/audience/expiry and refresh an unknown kid safely from the fixed trusted JWKS URL. The endpoint caches for 300 seconds; wait at least 330 seconds before switching, and longer if consumer cache policy requires it. Capture actual cache behavior privately; do not assume the reference verifier is the deployed consumer.
3. After approval, switch the private signer and `SSO_KEY_ID` together to B while retaining the same public A+B overlap. Existing A tokens and fresh B tokens must verify in both products, including cached JWKS.
4. Retain public A until the last A-issued token's 300-second maximum lifetime plus clock allowance has elapsed and consumers have demonstrably refreshed; use at least 330 seconds after last A issuance and account for actual cache/rollout delays. Then retire A publicly and revoke/archive the old private material per policy. Never reuse key IDs. Verify expired/retired tokens fail. Emergency compromise needs explicit incident revocation, not the normal overlap grace.
5. Local generated-key tests cover these mechanics and reject ambiguous/private keys. Staging consumer integration and production private-key changes remain owner actions.

## Privacy request fulfillment

The portal offers a recent-auth **limited account copy** and reviewed export/erasure intake. Full exports may include records involving other tenants/people; requester identity, tenant permission, legal holds and required retention must be reviewed by an authorized person. Keep case details/evidence in an approved private system; store only an opaque reference in the API.

Use the staff-admin list to triage, then PATCH a request with expected state, review reference, `identityVerified:true` and `retentionReviewed:true`. Another admin must review the subject's request; fresh sign-in is required. Transition pending → in_review → fulfilled/declined only after the actual authorized response has occurred. The endpoint records the attestation and audit; it neither creates a complete legal export nor deletes records. Do not mark complete simply because intake succeeded. Establish response deadlines, notification/appeal procedure and a reviewer rota.

For erasure, prepare a concrete scope/preview including business records, memberships, audit/security evidence, files, backup expiry and legal holds. Obtain required owner/legal approval before destructive work; preserve tenant confidentiality and last-owner/admin invariants. Revoke credentials as part of approved fulfillment. No blanket cascade deletion or production cleanup script is included. Demonstrate the procedure in staging and update the privacy notice/retention schedule before accepting real requests.
