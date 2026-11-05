BEGIN;

DROP TABLE IF EXISTS
  approvals, comments, files, requests, projects, memberships, orgs,
  sessions, auth_tokens, staff_mfa, user_passwords, privacy_requests,
  lead_notes, content_items, audit_log, users
  CASCADE;

DROP FUNCTION IF EXISTS
  row_count(), users_revoke_credentials(), users_keep_active_admin(),
  approvals_require_open_request(), approvals_require_authorized_actor(),
  files_enforce_quota(), files_match_request(),
  staff_mfa_revoke_on_delete(), staff_mfa_revoke_on_reset()
  CASCADE;

COMMIT;
