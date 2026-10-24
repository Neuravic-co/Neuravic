# 05 Operations

How to deploy, release, monitor, back up, recover and run Neuravic day to day.
Part of the documentation set: [01 Architecture](01-Architecture.md), [02 Getting started](02-Getting-Started.md), [03 API reference](03-API.md), [04 Security](04-Security.md), **05 Operations** (this file).

Production deployment, secret rotation, restores and repository protection changes need the owner's approval. This document is the procedure, not the approval.

## 1. What runs where

```
Users --HTTPS--> ingress --> frontend --private network--> gateway --> auth, portal, leads, admin, worker, file server --> MySQL 8
                                                                                                  file server --> uploads volume
                                                                                                  worker      --> Resend (email)
                                                                                                  file server --> malware scanner (private service)
```

| Part | Image / command | Replicas | Needs |
|---|---|---|---|
| Database | managed MySQL 8+ | provider | A database and the two accounts (`neuravic_app`, `neuravic_migrator`), created with `database/scripts/create-access.mjs` |
| Migration | backend image with `ENTRY=database/scripts/migrate.ts` | one job per release | `MIGRATE_DATABASE_URL` |
| gateway, auth, portal, leads | backend image, `ENTRY=nbe/services/<name>/src/index.ts` | 2 or more | The shared settings in [02 Getting started](02-Getting-Started.md) |
| admin | backend image | 1 or more | Same |
| worker | backend image | 1 (it sends email and runs maintenance) | Same, plus `RESEND_API_KEY` |
| file server | backend image, `ENTRY=server/src/index.ts` | 1 (one volume) | A persistent volume at `UPLOAD_DIR`, `MALWARE_SCANNER_URL` |
| frontend | frontend image | 2 or more | `API_ORIGIN`, `API_PROXY_SECRET`, `TRUST_PROXY_HEADERS`, `ALLOW_INSECURE_API_ORIGIN` |

Only the frontend is exposed to the internet. The gateway and the services stay on the private network.

## 2. Deploy and release

### Build the images

```bash
docker build -f deployment/docker/backend.Dockerfile  -t <registry>/neuravic-backend:<version>  .
docker build -f deployment/docker/frontend.Dockerfile -t <registry>/neuravic-frontend:<version> .
docker push <registry>/neuravic-backend:<version>
docker push <registry>/neuravic-frontend:<version>
```

Build from the repository root. Use a fixed version tag, never `latest`, so a rollback is exact.

### One machine with Docker Compose

```bash
cp deployment/.env.example deployment/.env          # fill in the values; generate secrets with security/scripts/generate-secrets.mjs
docker compose -f deployment/docker-compose.yml --env-file deployment/.env up --build -d
```

Compose starts MySQL (creating both accounts on first start), runs the migration, starts the services and the gateway, then the website on port 5173. Put HTTPS in front of port 5173.

### Kubernetes with Helm

1. Create the namespace and the Secret (see `deployment/k8s/namespace.yaml` and `deployment/k8s/secrets.example.yaml`; create the real Secret from the command line, never from a committed file):

   ```bash
   kubectl apply -f deployment/k8s/namespace.yaml
   kubectl -n neuravic create secret generic neuravic-secrets --from-literal=DATABASE_URL=... (see the example file for every key)
   ```

2. For a test cluster only, `kubectl apply -f deployment/k8s/mysql.yaml` adds a single MySQL. In production use a managed MySQL and put its address in `DATABASE_URL`.
3. Write a small values file (kept out of Git) with your images, host and settings, then install:

   ```bash
   helm upgrade --install neuravic deployment/helm/neuravic -n neuravic \
     -f my-values.yaml --set image.tag=<version>
   ```

   The chart runs the migration job first (a Helm hook), then rolls out the deployments. Set `networkPolicy.databaseCidr` to your database's address range and `networkPolicy.ingressNamespace` to your ingress controller's namespace.
4. Check: `kubectl -n neuravic get pods`, then `https://<host>/api/v1/health` shows every service as `ok`.

### Release

1. Merge only when the checks pass: frontend lint, typecheck and build; backend typecheck and `npm run smoke`; `helm lint`; the security check; CodeQL.
2. Record the commit, the current migration ledger (`SELECT name FROM schema_migrations`) and a fresh database backup.
3. Build and push both images with a new version tag.
4. `helm upgrade` with the new tag. The migration job runs first; if it fails the upgrade stops and the running version keeps serving. Migrations are forward only and each runs once; never edit an applied one and never reset the production database.
5. Watch the rollout and the health endpoint. Smoke test on the live site: sign-up and login with a test account, a contact enquiry, an organisation request with a file upload.

Rollback: `helm rollback neuravic <revision>` (or deploy the previous tag). Do not undo migrations; they are additive, so older code still runs on the newer schema. Restoring a database backup is a separate, approved operation (section 6).

## 3. Background work

The worker polls the email outbox every 2 seconds and runs maintenance every 5 minutes (`modules/maintenance`); the file server scans pending files every 30 seconds. Every step is safe to repeat.

| Job | What it does |
|---|---|
| Email outbox (worker) | Sends queued email, retries failures with growing delays, marks messages `dead` after the last retry |
| File scan (file server) | Scans up to 5 pending files per run with retries and backoff |
| Cleanup | Removes expired sessions, used or expired login tokens (one day after expiry), old rate-limit rows |
| Retention | Deletes spam enquiries after 90 days, lost enquiries after 365 days, sent outbox rows after 30 days, dead ones after 90 days |

Keep the retention windows in step with the privacy notice. With `MAINTENANCE_MODE=true` the jobs pause.

## 4. Monitoring and alerts

Logs are one JSON line per event on standard output (`request`, `maintenance_completed`, `outbox_delivery_failed`, `server_started` and others) with a request id, method, route and duration, and never tokens, bodies or email addresses. Ship them to a log service with restricted access and a fixed retention period.

Health: each service answers `GET /api/v1/health` (the Kubernetes probes use it) and the gateway's `GET /api/v1/health` lists all of them: `{"status":"ok","services":{...}}`, with `degraded` or `maintenance` when something is wrong. It proves the processes are up, not that the scanner or mail provider work. `GET /api/v1/admin/security-status` (staff admin only) reports MFA enrolment, quarantine, outbox and key presence; poll it from an authenticated private monitor, never publicly.

Suggested alerts (calibrate in staging and name a responder for each):

| Signal | Alert |
|---|---|
| API errors | 5xx above 1% for 5 minutes with a minimum traffic count |
| Authentication | Unusual 401 or 429 rates, repeated MFA failures, any recovery-code use, any role change |
| Email | Any `dead` outbox message, or the oldest pending message older than 15 minutes |
| Scanner | Repeated scan failures, oldest pending file older than 15 minutes, outdated signatures |
| Maintenance | No `maintenance_completed` log line from the worker for more than 15 minutes (except during planned containment) |
| Pods | Restarts, `CrashLoopBackOff`, a service with no ready pod |
| Backups | Last successful backup older than 24 hours |
| Disk | Upload volume or database storage above 80% |

## 5. Backups

- **Database:** encrypted automated backups plus point-in-time recovery if your MySQL service offers it. Decide the retention, the recovery point objective (how much data you can lose) and the recovery time objective (how long you can be down), and name who may approve a restore.
- **Uploads:** back up the `UPLOAD_DIR` volume together with the database. The `files` table and the files on disk must match.
- **Keys:** store `MFA_ENCRYPTION_KEY`, `PRIVACY_HASH_SECRET`, `SSO_PRIVATE_JWK` and `PROXY_SECRET` in a secret manager with a recovery copy kept separately from the database backups. Without `MFA_ENCRYPTION_KEY` staff must be re-enrolled.
- **Audit log:** export `audit_log` to a separate store that administrators cannot edit.
- Test a restore on a separate server at least once before launch and after any major change, and write down the measured time.

## 6. Restoring from a backup

Only with the owner's approval and a second reviewer.

1. Write down the source, the target and the snapshot time. Keep the current state as evidence.
2. Contain: set `MAINTENANCE_MODE=true` (Helm `config.maintenanceMode`), scale the frontend to zero and let in-flight jobs finish.
3. Restore into a separate target database first and check row counts, the migration ledger and the triggers.
4. A restored snapshot can bring back sessions, sign-in links, recovery codes, scan decisions and pending emails that were already used or revoked. Before reopening:
   - delete every session and unused login token
   - have staff replace their recovery codes, or re-enrol if in doubt
   - set restored files back to `pending` so they are scanned again
   - hold pending outbox messages for manual review
5. Point the backend at the restored database, run `npm run migrate`, test sign-in, a staff MFA login, tenant access and a file download, then set `MAINTENANCE_MODE=false`.
6. Single sign-on tokens issued before the incident stay valid for up to 5 minutes. Rotate the SSO key (section 8) if the key may have leaked.

## 7. Incident response

1. **Contain.** Set `MAINTENANCE_MODE=true` (every service answers 503 except health and version). If a secret leaked, rotate it (below). If a staff account is suspect, disable it with `PATCH /admin/users/:id` `{ "status": "disabled" }`, which also revokes its sessions and links.
2. **Preserve.** Keep logs, request ids, the audit log and the database state before you rotate or delete anything. Record times and request ids in a private incident record.
3. **Investigate.** `GET /admin/audit?action=` shows sign-ins, role changes, exports and token issuing. Request ids in a response header tie a user report to the log line.
4. **Recover.** Fix the cause, restore from backup only if data was damaged (section 6), rotate affected secrets, and reopen after smoke tests.
5. **Tell people.** Notify affected people and regulators where the law requires it, using the privacy contact. Learn from it and update this document and the checklists.

### Rotating a secret

| Secret | How |
|---|---|
| `PROXY_SECRET` (the Secret key; the website reads the same key as `API_PROXY_SECRET`) | Update the Secret and restart the frontend and every service together; until both sides match, rate limiting sees every visitor as one address |
| `PRIVACY_HASH_SECRET` | Change it and restart. New identifiers stop matching old ones; nothing is rewritten |
| `RESEND_API_KEY`, `SLACK_WEBHOOK_URL` | Create the new one, update, restart, then revoke the old one |
| `MFA_ENCRYPTION_KEY` | Not a simple swap. Contain, back up, decrypt and re-encrypt every enrolled seed under the new key with a fresh IV and the same user id binding, verify each row in isolation, revoke sessions and links, then reopen. If the key is lost, staff must be re-enrolled under supervision |
| `SSO_PRIVATE_JWK` | Use the overlap procedure in section 8 |
| Database passwords | Run `database/scripts/create-access.mjs` with new `APP_DB_PASSWORD` and `MIGRATE_DB_PASSWORD` (it resets them), update the Secret and restart the services |

## 8. Rotating the single sign-on key

1. Create a new Ed25519 private key and give it a new unique key id. Export only its public part (it must have no `d` field).
2. Set `SSO_PUBLIC_JWKS` to `{"keys":[<public A>,<public B>]}` while the private signer stays A. Restart.
3. Check that every consuming product fetches both keys, verifies the signature, issuer, audience and expiry, and refreshes unknown key ids from `/.well-known/jwks.json`. The endpoint is cacheable for 300 seconds; wait at least 330 seconds.
4. Switch `SSO_PRIVATE_JWK` and `SSO_KEY_ID` to B together, keeping both public keys published.
5. Keep A published for at least 330 seconds after the last token it signed, then remove it and archive or destroy the old private key. Never reuse a key id. An emergency compromise needs immediate revocation instead of this grace period.

## 9. Privacy requests

People can ask for a copy of their data or for deletion in the portal. A staff admin other than the subject reviews each request (see [04 Security](04-Security.md), section 5). For deletion, prepare a scope covering business records, memberships, audit evidence, files, backup expiry and legal holds, get the required approval before anything destructive, keep the last-owner and last-admin rules intact and revoke the person's sessions. There is no bulk delete script by design.

## 10. Routine tasks

| When | Task |
|---|---|
| Daily | Look at alerts; check the outbox for `dead` messages and the oldest pending file |
| Weekly | Review the security check and Dependabot pull requests (assigned to the owner); check disk usage |
| Monthly | Test a restore; review staff accounts and organisation owners; review the audit log for unusual role changes and exports |
| After any change to storage, secrets or scanning | Re-run the go-live checklist items in [04 Security](04-Security.md) that it touches |

## 11. Troubleshooting production

| Symptom | Check |
|---|---|
| Users see "sign-in is not available" | `/api/v1/health` through the website (it shows which service is down); `API_ORIGIN` and `API_PROXY_SECRET` on the website; `kubectl -n neuravic get pods`; MySQL reachability; the network policies |
| A service answers 503 "service_unavailable" | The gateway cannot reach it: check its pod, its `<NAME>_URL` setting and the network policy |
| Every visitor is rate limited together | `PROXY_SECRET` and `API_PROXY_SECRET` differ or are missing, or `TRUST_PROXY_HEADERS` is off behind the ingress; the visitor address is only trusted when signed |
| No emails arrive | `RESEND_API_KEY`, the sending domain, and the outbox: `pending` rows mean delivery is failing, `dead` rows mean retries ran out |
| Uploads never become downloadable | The scanner service: it must be reachable at `MALWARE_SCANNER_URL`, answer within 10 seconds with a matching digest, and not return errors |
| Staff are locked out after enabling MFA | They need their recovery codes; otherwise follow the supervised recovery in [04 Security](04-Security.md) |
| The API refuses to start | The error names the invalid setting (never its value). Typical causes: `APP_URL` not in `ALLOWED_ORIGINS`, non-HTTPS origins in production, missing `PRIVACY_HASH_SECRET` or `MFA_ENCRYPTION_KEY` |
| 403 `mfa_required` for a staff member | They must finish authenticator verification for this session |
