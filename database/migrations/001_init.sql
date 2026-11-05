
CREATE FUNCTION row_count() RETURNS bigint LANGUAGE sql VOLATILE AS $$
  SELECT coalesce(nullif(current_setting('app.row_count', true), '')::bigint, 0)
$$
-- @@
CREATE TABLE users (
  id varchar(64) NOT NULL PRIMARY KEY,
  email varchar(254) NOT NULL,
  name varchar(255) NULL,
  status varchar(16) NOT NULL DEFAULT 'invited',
  staff_role varchar(16) NULL,
  created_at bigint NOT NULL,
  last_login_at bigint NULL
)
-- @@
CREATE UNIQUE INDEX users_email_unique ON users (email)
-- @@
CREATE TABLE orgs (
  id varchar(64) NOT NULL PRIMARY KEY,
  name varchar(255) NOT NULL,
  slug varchar(120) NOT NULL,
  created_at bigint NOT NULL
)
-- @@
CREATE UNIQUE INDEX orgs_slug_unique ON orgs (slug)
-- @@
CREATE TABLE memberships (
  user_id varchar(64) NOT NULL,
  org_id varchar(64) NOT NULL,
  role varchar(16) NOT NULL,
  created_at bigint NOT NULL,
  PRIMARY KEY (user_id, org_id),
  CONSTRAINT fk_memberships_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_memberships_org FOREIGN KEY (org_id) REFERENCES orgs (id)
)
-- @@
CREATE INDEX memberships_org ON memberships (org_id)
-- @@
CREATE INDEX memberships_org_page ON memberships (org_id, created_at, user_id)
-- @@
CREATE TABLE sessions (
  id varchar(64) NOT NULL PRIMARY KEY,
  user_id varchar(64) NOT NULL,
  expires_at bigint NOT NULL,
  absolute_expires_at bigint NOT NULL,
  ip_hash varchar(64) NULL,
  ua_hash varchar(64) NULL,
  mfa_verified_at bigint NULL,
  created_at bigint NOT NULL,
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users (id)
)
-- @@
CREATE INDEX sessions_user ON sessions (user_id)
-- @@
CREATE INDEX sessions_expires ON sessions (expires_at)
-- @@
CREATE INDEX sessions_absolute_expires ON sessions (absolute_expires_at)
-- @@
CREATE TABLE staff_mfa (
  user_id varchar(64) NOT NULL PRIMARY KEY,
  encrypted_secret varchar(512) NOT NULL,
  enabled_at bigint NULL,
  created_at bigint NOT NULL,
  last_used_step bigint NOT NULL DEFAULT -1,
  recovery_hashes text NOT NULL,
  CONSTRAINT fk_staff_mfa_user FOREIGN KEY (user_id) REFERENCES users (id)
)
-- @@
CREATE TABLE privacy_requests (
  id varchar(64) NOT NULL PRIMARY KEY,
  user_id varchar(64) NOT NULL,
  kind varchar(16) NOT NULL,
  state varchar(16) NOT NULL DEFAULT 'pending',
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  reviewed_by varchar(64) NULL,
  review_reference varchar(100) NULL,
  CONSTRAINT fk_privacy_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_privacy_reviewer FOREIGN KEY (reviewed_by) REFERENCES users (id)
)
-- @@
CREATE INDEX privacy_requests_user ON privacy_requests (user_id, created_at, id)
-- @@
CREATE INDEX privacy_requests_created ON privacy_requests (created_at, id)
-- @@
CREATE UNIQUE INDEX privacy_requests_open ON privacy_requests (user_id, kind) WHERE state IN ('pending', 'in_review')
-- @@
CREATE TABLE auth_tokens (
  id varchar(64) NOT NULL PRIMARY KEY,
  email varchar(254) NOT NULL,
  purpose varchar(16) NOT NULL,
  expires_at bigint NOT NULL,
  used_at bigint NULL,
  created_at bigint NOT NULL,
  claimed_session_id varchar(64) NULL
)
-- @@
CREATE INDEX auth_tokens_email ON auth_tokens (email)
-- @@
CREATE INDEX auth_tokens_expires ON auth_tokens (expires_at)
-- @@
CREATE TABLE leads (
  id varchar(64) NOT NULL PRIMARY KEY,
  name varchar(255) NOT NULL,
  email varchar(254) NOT NULL,
  company varchar(255) NULL,
  message text NOT NULL,
  message_hash varchar(64) NOT NULL,
  service_interest text NOT NULL,
  budget_band varchar(100) NULL,
  source varchar(100) NOT NULL DEFAULT 'website',
  status varchar(16) NOT NULL DEFAULT 'new',
  spam_score integer NOT NULL DEFAULT 0,
  consent_at bigint NOT NULL,
  ip_hash varchar(64) NULL,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL
)
-- @@
CREATE INDEX leads_status_created ON leads (status, created_at, id)
-- @@
CREATE INDEX leads_created ON leads (created_at, id)
-- @@
CREATE INDEX leads_email_hash ON leads (email, message_hash)
-- @@
CREATE TABLE lead_notes (
  id varchar(64) NOT NULL PRIMARY KEY,
  lead_id varchar(64) NOT NULL,
  author_id varchar(64) NOT NULL,
  body text NOT NULL,
  created_at bigint NOT NULL,
  CONSTRAINT fk_lead_notes_lead FOREIGN KEY (lead_id) REFERENCES leads (id),
  CONSTRAINT fk_lead_notes_author FOREIGN KEY (author_id) REFERENCES users (id)
)
-- @@
CREATE INDEX lead_notes_lead ON lead_notes (lead_id)
-- @@
CREATE TABLE projects (
  id varchar(64) NOT NULL PRIMARY KEY,
  org_id varchar(64) NOT NULL,
  name varchar(255) NOT NULL,
  description text NULL,
  status varchar(16) NOT NULL DEFAULT 'active',
  created_by varchar(64) NOT NULL,
  created_at bigint NOT NULL,
  CONSTRAINT fk_projects_org FOREIGN KEY (org_id) REFERENCES orgs (id),
  CONSTRAINT fk_projects_creator FOREIGN KEY (created_by) REFERENCES users (id)
)
-- @@
CREATE INDEX projects_org ON projects (org_id, created_at, id)
-- @@
CREATE TABLE requests (
  id varchar(64) NOT NULL PRIMARY KEY,
  project_id varchar(64) NOT NULL,
  org_id varchar(64) NOT NULL,
  type varchar(16) NOT NULL,
  title varchar(255) NOT NULL,
  body text NOT NULL,
  state varchar(16) NOT NULL DEFAULT 'open',
  required_approvals integer NOT NULL DEFAULT 1,
  requested_by varchar(64) NOT NULL,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  CONSTRAINT fk_requests_project FOREIGN KEY (project_id) REFERENCES projects (id),
  CONSTRAINT fk_requests_org FOREIGN KEY (org_id) REFERENCES orgs (id),
  CONSTRAINT fk_requests_requester FOREIGN KEY (requested_by) REFERENCES users (id)
)
-- @@
CREATE INDEX requests_project ON requests (project_id, created_at, id)
-- @@
CREATE INDEX requests_org_state_created ON requests (org_id, state, created_at, id)
-- @@
CREATE INDEX requests_org_created ON requests (org_id, created_at, id)
-- @@
CREATE TABLE approvals (
  id varchar(64) NOT NULL PRIMARY KEY,
  request_id varchar(64) NOT NULL,
  approver_id varchar(64) NOT NULL,
  decision varchar(16) NOT NULL,
  comment text NULL,
  decided_at bigint NOT NULL,
  CONSTRAINT fk_approvals_request FOREIGN KEY (request_id) REFERENCES requests (id),
  CONSTRAINT fk_approvals_approver FOREIGN KEY (approver_id) REFERENCES users (id)
)
-- @@
CREATE UNIQUE INDEX approvals_unique ON approvals (request_id, approver_id)
-- @@
CREATE TABLE comments (
  id varchar(64) NOT NULL PRIMARY KEY,
  request_id varchar(64) NOT NULL,
  author_id varchar(64) NOT NULL,
  body text NOT NULL,
  created_at bigint NOT NULL,
  CONSTRAINT fk_comments_request FOREIGN KEY (request_id) REFERENCES requests (id),
  CONSTRAINT fk_comments_author FOREIGN KEY (author_id) REFERENCES users (id)
)
-- @@
CREATE INDEX comments_request ON comments (request_id, created_at)
-- @@
CREATE INDEX comments_request_page ON comments (request_id, created_at, id)
-- @@
CREATE TABLE files (
  id varchar(64) NOT NULL PRIMARY KEY,
  org_id varchar(64) NOT NULL,
  request_id varchar(64) NOT NULL,
  storage_key varchar(255) NOT NULL,
  name varchar(255) NOT NULL,
  size integer NOT NULL,
  mime varchar(150) NOT NULL,
  sha256 varchar(64) NOT NULL,
  scan_state varchar(16) NOT NULL DEFAULT 'pending',
  scan_attempts integer NOT NULL DEFAULT 0,
  next_scan_at bigint NOT NULL DEFAULT 0,
  uploaded_by varchar(64) NOT NULL,
  created_at bigint NOT NULL,
  CONSTRAINT fk_files_org FOREIGN KEY (org_id) REFERENCES orgs (id),
  CONSTRAINT fk_files_request FOREIGN KEY (request_id) REFERENCES requests (id),
  CONSTRAINT fk_files_uploader FOREIGN KEY (uploaded_by) REFERENCES users (id)
)
-- @@
CREATE INDEX files_request ON files (request_id, created_at)
-- @@
CREATE INDEX files_scan_due ON files (scan_state, next_scan_at)
-- @@
CREATE TABLE content_items (
  id varchar(64) NOT NULL PRIMARY KEY,
  kind varchar(16) NOT NULL,
  slug varchar(120) NOT NULL,
  position integer NOT NULL DEFAULT 0,
  data text NOT NULL,
  published boolean NOT NULL DEFAULT true,
  updated_at bigint NOT NULL
)
-- @@
CREATE UNIQUE INDEX content_kind_slug ON content_items (kind, slug)
-- @@
CREATE TABLE outbox (
  id varchar(64) NOT NULL PRIMARY KEY,
  topic varchar(16) NOT NULL,
  payload text NOT NULL,
  state varchar(16) NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at bigint NOT NULL,
  last_error varchar(255) NULL,
  created_at bigint NOT NULL
)
-- @@
CREATE INDEX outbox_due ON outbox (state, next_attempt_at)
-- @@
CREATE TABLE audit_log (
  id varchar(64) NOT NULL PRIMARY KEY,
  at bigint NOT NULL,
  actor_id varchar(64) NULL,
  org_id varchar(64) NULL,
  action varchar(100) NOT NULL,
  target_type varchar(64) NULL,
  target_id varchar(255) NULL,
  ip_hash varchar(64) NULL,
  meta text NULL
)
-- @@
CREATE INDEX audit_at ON audit_log (at, id)
-- @@
CREATE INDEX audit_org ON audit_log (org_id, at, id)
-- @@
CREATE INDEX audit_action ON audit_log (action, at, id)
-- @@
CREATE TABLE rate_limits (
  key varchar(255) NOT NULL PRIMARY KEY,
  count integer NOT NULL,
  expires_at bigint NOT NULL
)
-- @@
CREATE INDEX rate_limits_expires ON rate_limits (expires_at)
-- @@
CREATE FUNCTION users_revoke_credentials() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.status = 'disabled' AND OLD.status IS DISTINCT FROM NEW.status) OR NEW.staff_role IS DISTINCT FROM OLD.staff_role THEN
    DELETE FROM sessions WHERE user_id = NEW.id;
    DELETE FROM auth_tokens WHERE email = OLD.email;
  END IF;
  RETURN NULL;
END
$$
-- @@
CREATE TRIGGER users_revoke_credentials AFTER UPDATE ON users FOR EACH ROW EXECUTE FUNCTION users_revoke_credentials()
-- @@
CREATE FUNCTION users_keep_active_admin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'active' AND OLD.staff_role = 'admin'
    AND (NEW.status <> 'active' OR NEW.staff_role IS DISTINCT FROM 'admin')
    AND NOT EXISTS (SELECT 1 FROM users WHERE id <> OLD.id AND status = 'active' AND staff_role = 'admin') THEN
    RAISE EXCEPTION 'last_staff_admin';
  END IF;
  RETURN NEW;
END
$$
-- @@
CREATE TRIGGER users_keep_active_admin BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION users_keep_active_admin()
-- @@
CREATE FUNCTION leads_deduplicate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM leads WHERE email = NEW.email AND message_hash = NEW.message_hash AND created_at >= NEW.created_at - 86400000) THEN
    RAISE EXCEPTION 'duplicate_lead';
  END IF;
  RETURN NEW;
END
$$
-- @@
CREATE TRIGGER leads_deduplicate BEFORE INSERT ON leads FOR EACH ROW EXECUTE FUNCTION leads_deduplicate()
-- @@
CREATE FUNCTION approvals_require_open_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM requests WHERE id = NEW.request_id AND state = 'open') THEN
    RAISE EXCEPTION 'request_not_open';
  END IF;
  RETURN NEW;
END
$$
-- @@
CREATE TRIGGER approvals_require_open_request BEFORE INSERT ON approvals FOR EACH ROW EXECUTE FUNCTION approvals_require_open_request()
-- @@
CREATE FUNCTION approvals_require_authorized_actor() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM requests r JOIN users u ON u.id = NEW.approver_id
    WHERE r.id = NEW.request_id AND r.requested_by <> u.id AND u.status = 'active'
      AND (u.staff_role IN ('admin', 'delivery') OR EXISTS (
        SELECT 1 FROM memberships m WHERE m.org_id = r.org_id AND m.user_id = u.id AND m.role IN ('admin', 'owner')
      ))
  ) THEN
    RAISE EXCEPTION 'approver_not_authorized';
  END IF;
  RETURN NEW;
END
$$
-- @@
CREATE TRIGGER approvals_require_authorized_actor BEFORE INSERT ON approvals FOR EACH ROW EXECUTE FUNCTION approvals_require_authorized_actor()
-- @@
CREATE FUNCTION files_enforce_quota() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT count(*) FROM files WHERE request_id = NEW.request_id) >= 20 THEN
    RAISE EXCEPTION 'file_limit_reached';
  END IF;
  RETURN NEW;
END
$$
-- @@
CREATE TRIGGER files_enforce_quota BEFORE INSERT ON files FOR EACH ROW EXECUTE FUNCTION files_enforce_quota()
-- @@
CREATE FUNCTION files_match_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM requests WHERE id = NEW.request_id AND org_id = NEW.org_id AND state <> 'cancelled') THEN
    RAISE EXCEPTION 'file_request_unavailable';
  END IF;
  RETURN NEW;
END
$$
-- @@
CREATE TRIGGER files_match_request BEFORE INSERT ON files FOR EACH ROW EXECUTE FUNCTION files_match_request()
-- @@
CREATE FUNCTION staff_mfa_revoke_on_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.enabled_at IS NOT NULL THEN
    DELETE FROM sessions WHERE user_id = OLD.user_id;
    DELETE FROM auth_tokens WHERE email IN (SELECT email FROM users WHERE id = OLD.user_id);
  END IF;
  RETURN NULL;
END
$$
-- @@
CREATE TRIGGER staff_mfa_revoke_on_delete AFTER DELETE ON staff_mfa FOR EACH ROW EXECUTE FUNCTION staff_mfa_revoke_on_delete()
-- @@
CREATE FUNCTION staff_mfa_revoke_on_reset() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.enabled_at IS NOT NULL AND (NEW.enabled_at IS DISTINCT FROM OLD.enabled_at OR NEW.user_id IS DISTINCT FROM OLD.user_id) THEN
    DELETE FROM sessions WHERE user_id = OLD.user_id;
    DELETE FROM auth_tokens WHERE email IN (SELECT email FROM users WHERE id = OLD.user_id);
  END IF;
  RETURN NULL;
END
$$
-- @@
CREATE TRIGGER staff_mfa_revoke_on_reset AFTER UPDATE ON staff_mfa FOR EACH ROW EXECUTE FUNCTION staff_mfa_revoke_on_reset()
