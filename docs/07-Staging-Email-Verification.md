# Staging email verification: checklist and results

Use this with [06 Contact email](06-Contact-Email.md) when the owners are ready to prove that a contact enquiry really reaches two mailboxes. Nothing here sends mail by itself. Fill in the results table as you go and keep it with the release notes. Do not paste API keys, passwords or customer data into it.

## Before you start (owner inputs)

| Input | Value / where it is kept | Done |
|---|---|---|
| Resend account (or approved SMTP account) | | ☐ |
| Verified sending domain, SPF/DKIM published, DMARC reviewed | | ☐ |
| `EMAIL_FROM` (an address on that domain) | | ☐ |
| `NOTIFY_TO` (approved team mailbox) | | ☐ |
| Visitor test address (approved mailbox) | | ☐ |
| Isolated staging API, worker and Postgres | | ☐ |
| `TURNSTILE_SECRET` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (a matching pair) | | ☐ |
| `ALLOWED_ORIGINS` and `APP_URL` set to the exact staging website origin | | ☐ |
| `API_ORIGIN` and matching `API_PROXY_SECRET` / `PROXY_SECRET` | | ☐ |
| Access to Resend logs and to both mailboxes | | ☐ |

Stop if any row is empty. Never use production in place of staging.

## Steps

1. **Migrate.** Apply `database/migrations/003_email_delivery.sql` to the staging database before starting this version.
2. **Start the worker.** Run one persistent worker against the same database as the leads service. Confirm it is not in maintenance mode (`MAINTENANCE_MODE` unset or `false`).
3. **Check the gateway.** `GET <API_ORIGIN>/api/v1/health` reports healthy services. A loading website page does not prove this.
4. **Submit once.** On the staging website send one enquiry with synthetic text that includes a unique marker (for example `STAGING-<date>-1`) and the visitor test address. Record only the enquiry ID, the marker and the time.
5. **Check the database.** One saved enquiry and exactly two email jobs (team notification, visitor acknowledgement):

   ```sql
   SELECT id, lead_id, notification_kind, state, attempts, next_attempt_at,
          last_error, provider, provider_message_id, accepted_at
   FROM outbox WHERE topic = 'email' ORDER BY created_at DESC LIMIT 10;
   ```

   `provider` must be `resend` or `smtp`. `development` or `memory` means nothing real was sent.
6. **Check for duplicates.** Submit the identical enquiry again with a fresh challenge. It must reuse the same enquiry and add no new jobs.
7. **Check the provider.** In the Resend account, find both messages by their stored IDs. Note any bounce, suppression or delay. Record redacted evidence that the domain shows as verified.
8. **Check both mailboxes.** The owners of the team and visitor mailboxes confirm receipt, the content (enquiry ID, name, email, company, services, budget, message) and that there is no unintended duplicate. Check junk or spam if a message is missing.

## Results

Record each level separately. A later level does not follow from an earlier one.

| Level | Evidence | Result (pass / fail / not run) | Who and when |
|---|---|---|---|
| API accepted (HTTP 202, `status: received`) | | | |
| Saved enquiry plus exactly two jobs | | | |
| Provider accepted (message IDs recorded) | | | |
| Recipient server delivered (provider event or log) | | | |
| Team mailbox received, content correct | | | |
| Visitor mailbox received, content correct | | | |
| Duplicate resubmission added no jobs | | | |

## Troubleshooting

| What you see | Likely cause |
|---|---|
| `503 The API is not configured` | The frontend server has no `API_ORIGIN`. |
| Enquiry saved, jobs stay `pending`, `last_error` mentions `mail_not_configured` | Neither `RESEND_API_KEY` nor `SMTP_URL` is set where the worker runs. |
| Jobs `dead` with an authentication or domain error | The key is not for the sending domain, or the domain is not yet verified. |
| Contact form rejected before saving | Turnstile secret and site key do not match, or the origin is not in `ALLOWED_ORIGINS`. |
| No jobs at all | The submission hit the honeypot or spam quarantine, or reused an earlier enquiry. |

Do not reset a job or change its idempotency key to force another send; see "Delivery states, retries and troubleshooting" in [06 Contact email](06-Contact-Email.md).
