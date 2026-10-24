-- Neuravic MySQL schema (MySQL 8+). Statements are separated by lines that read "-- @@" (run by scripts/migrate.ts).
-- Text is compared byte for byte (utf8mb4_bin), like the SQLite database this was ported from.

CREATE TABLE users (
  id varchar(64) NOT NULL PRIMARY KEY,
  email varchar(254) NOT NULL,
  name varchar(255) NULL,
  status varchar(16) NOT NULL DEFAULT 'invited',
  staff_role varchar(16) NULL,
  created_at bigint NOT NULL,
  last_login_at bigint NULL,
  UNIQUE KEY users_email_unique (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
-- @@
CREATE TABLE orgs (
  id varchar(64) NOT NULL PRIMARY KEY,
  name varchar(255) NOT NULL,
  slug varchar(120) NOT NULL,
  created_at bigint NOT NULL,
  UNIQUE KEY orgs_slug_unique (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
-- @@
CREATE TABLE memberships (
  user_id varchar(64) NOT NULL,
  org_id varchar(64) NOT NULL,
  role varchar(16) NOT NULL,
  created_at bigint NOT NULL,
  PRIMARY KEY (user_id, org_id),
  KEY memberships_org (org_id),
  KEY memberships_org_page (org_id, created_at, user_id),
  CONSTRAINT fk_memberships_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_memberships_org FOREIGN KEY (org_id) REFERENCES orgs (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
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
  KEY sessions_user (user_id),
  KEY sessions_expires (expires_at),
  KEY sessions_absolute_expires (absolute_expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
-- @@
CREATE TABLE staff_mfa (
  user_id varchar(64) NOT NULL PRIMARY KEY,
  encrypted_secret varchar(512) NOT NULL,
  enabled_at bigint NULL,
  created_at bigint NOT NULL,
  last_used_step bigint NOT NULL DEFAULT -1,
  recovery_hashes mediumtext NOT NULL,
  CONSTRAINT fk_staff_mfa_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
-- @@
-- open_key replaces the partial unique index SQLite had: it is 1 only while a request is open, and NULLs never collide.
CREATE TABLE privacy_requests (
  id varchar(64) NOT NULL PRIMARY KEY,
  user_id varchar(64) NOT NULL,
  kind varchar(16) NOT NULL,
  state varchar(16) NOT NULL DEFAULT 'pending',
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  reviewed_by varchar(64) NULL,
  review_reference varchar(100) NULL,
  open_key tinyint GENERATED ALWAYS AS (CASE WHEN state IN ('pending', 'in_review') THEN 1 ELSE NULL END) VIRTUAL,
  KEY privacy_requests_user (user_id, created_at, id),
  KEY privacy_requests_created (created_at, id),
  UNIQUE KEY privacy_requests_open (user_id, kind, open_key),
  CONSTRAINT fk_privacy_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_privacy_reviewer FOREIGN KEY (reviewed_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
-- @@
CREATE TABLE auth_tokens (
  id varchar(64) NOT NULL PRIMARY KEY,
  email varchar(254) NOT NULL,
  purpose varchar(16) NOT NULL,
  expires_at bigint NOT NULL,
  used_at bigint NULL,
  created_at bigint NOT NULL,
  claimed_session_id varchar(64) NULL,
  KEY auth_tokens_email (email),
  KEY auth_tokens_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
-- @@
CREATE TABLE leads (
  id varchar(64) NOT NULL PRIMARY KEY,
  name varchar(255) NOT NULL,
  email varchar(254) NOT NULL,
  company varchar(255) NULL,
  message text NOT NULL,
  message_hash varchar(64) NOT NULL,
  service_interest mediumtext NOT NULL,
  budget_band varchar(100) NULL,
  source varchar(100) NOT NULL DEFAULT 'website',
  status varchar(16) NOT NULL DEFAULT 'new',
  spam_score int NOT NULL DEFAULT 0,
  consent_at bigint NOT NULL,
  ip_hash varchar(64) NULL,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  KEY leads_status_created (status, created_at, id),
  KEY leads_created (created_at, id),
  KEY leads_email_hash (email, message_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
-- @@
CREATE TABLE lead_notes (
  id varchar(64) NOT NULL PRIMARY KEY,
  lead_id varchar(64) NOT NULL,
  author_id varchar(64) NOT NULL,
  body text NOT NULL,
  created_at bigint NOT NULL,
  KEY lead_notes_lead (lead_id),
  CONSTRAINT fk_lead_notes_lead FOREIGN KEY (lead_id) REFERENCES leads (id),
  CONSTRAINT fk_lead_notes_author FOREIGN KEY (author_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
-- @@
CREATE TABLE projects (
  id varchar(64) NOT NULL PRIMARY KEY,
  org_id varchar(64) NOT NULL,
  name varchar(255) NOT NULL,
  description text NULL,
  status varchar(16) NOT NULL DEFAULT 'active',
  created_by varchar(64) NOT NULL,
  created_at bigint NOT NULL,
  KEY projects_org (org_id, created_at, id),
  CONSTRAINT fk_projects_org FOREIGN KEY (org_id) REFERENCES orgs (id),
  CONSTRAINT fk_projects_creator FOREIGN KEY (created_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
-- @@
CREATE TABLE requests (
  id varchar(64) NOT NULL PRIMARY KEY,
  project_id varchar(64) NOT NULL,
  org_id varchar(64) NOT NULL,
  type varchar(16) NOT NULL,
  title varchar(255) NOT NULL,
  body text NOT NULL,
  state varchar(16) NOT NULL DEFAULT 'open',
  required_approvals int NOT NULL DEFAULT 1,
  requested_by varchar(64) NOT NULL,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  KEY requests_project (project_id, created_at, id),
  KEY requests_org_state_created (org_id, state, created_at, id),
  KEY requests_org_created (org_id, created_at, id),
  CONSTRAINT fk_requests_project FOREIGN KEY (project_id) REFERENCES projects (id),
  CONSTRAINT fk_requests_org FOREIGN KEY (org_id) REFERENCES orgs (id),
  CONSTRAINT fk_requests_requester FOREIGN KEY (requested_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
-- @@
CREATE TABLE approvals (
  id varchar(64) NOT NULL PRIMARY KEY,
  request_id varchar(64) NOT NULL,
  approver_id varchar(64) NOT NULL,
  decision varchar(16) NOT NULL,
  comment text NULL,
  decided_at bigint NOT NULL,
  UNIQUE KEY approvals_unique (request_id, approver_id),
  CONSTRAINT fk_approvals_request FOREIGN KEY (request_id) REFERENCES requests (id),
  CONSTRAINT fk_approvals_approver FOREIGN KEY (approver_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
-- @@
CREATE TABLE comments (
  id varchar(64) NOT NULL PRIMARY KEY,
  request_id varchar(64) NOT NULL,
  author_id varchar(64) NOT NULL,
  body text NOT NULL,
  created_at bigint NOT NULL,
  KEY comments_request (request_id, created_at),
  KEY comments_request_page (request_id, created_at, id),
  CONSTRAINT fk_comments_request FOREIGN KEY (request_id) REFERENCES requests (id),
  CONSTRAINT fk_comments_author FOREIGN KEY (author_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
-- @@
CREATE TABLE files (
  id varchar(64) NOT NULL PRIMARY KEY,
  org_id varchar(64) NOT NULL,
  request_id varchar(64) NOT NULL,
  storage_key varchar(255) NOT NULL,
  name varchar(255) NOT NULL,
  size int NOT NULL,
  mime varchar(150) NOT NULL,
  sha256 varchar(64) NOT NULL,
  scan_state varchar(16) NOT NULL DEFAULT 'pending',
  scan_attempts int NOT NULL DEFAULT 0,
  next_scan_at bigint NOT NULL DEFAULT 0,
  uploaded_by varchar(64) NOT NULL,
  created_at bigint NOT NULL,
  KEY files_request (request_id, created_at),
  KEY files_scan_due (scan_state, next_scan_at),
  CONSTRAINT fk_files_org FOREIGN KEY (org_id) REFERENCES orgs (id),
  CONSTRAINT fk_files_request FOREIGN KEY (request_id) REFERENCES requests (id),
  CONSTRAINT fk_files_uploader FOREIGN KEY (uploaded_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
-- @@
CREATE TABLE content_items (
  id varchar(64) NOT NULL PRIMARY KEY,
  kind varchar(16) NOT NULL,
  slug varchar(120) NOT NULL,
  position int NOT NULL DEFAULT 0,
  data mediumtext NOT NULL,
  published tinyint(1) NOT NULL DEFAULT 1,
  updated_at bigint NOT NULL,
  UNIQUE KEY content_kind_slug (kind, slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
-- @@
-- Column order matters: the portal inserts into outbox with INSERT ... SELECT.
CREATE TABLE outbox (
  id varchar(64) NOT NULL PRIMARY KEY,
  topic varchar(16) NOT NULL,
  payload mediumtext NOT NULL,
  state varchar(16) NOT NULL DEFAULT 'pending',
  attempts int NOT NULL DEFAULT 0,
  next_attempt_at bigint NOT NULL,
  last_error varchar(255) NULL,
  created_at bigint NOT NULL,
  KEY outbox_due (state, next_attempt_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
-- @@
-- Column order matters: audit rows are also written with INSERT ... SELECT.
CREATE TABLE audit_log (
  id varchar(64) NOT NULL PRIMARY KEY,
  at bigint NOT NULL,
  actor_id varchar(64) NULL,
  org_id varchar(64) NULL,
  action varchar(100) NOT NULL,
  target_type varchar(64) NULL,
  target_id varchar(255) NULL,
  ip_hash varchar(64) NULL,
  meta mediumtext NULL,
  KEY audit_at (at, id),
  KEY audit_org (org_id, at, id),
  KEY audit_action (action, at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
-- @@
CREATE TABLE rate_limits (
  `key` varchar(255) NOT NULL PRIMARY KEY,
  count int NOT NULL,
  expires_at bigint NOT NULL,
  KEY rate_limits_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
-- @@
-- Write guards. They run inside the same transaction as the write that trips them. The error message is the marker
-- the application looks for (see lib/errors.ts).
CREATE TRIGGER users_revoke_credentials AFTER UPDATE ON users FOR EACH ROW
BEGIN
  IF (NEW.status = 'disabled' AND NOT (OLD.status <=> NEW.status)) OR NOT (NEW.staff_role <=> OLD.staff_role) THEN
    DELETE FROM sessions WHERE user_id = NEW.id;
    DELETE FROM auth_tokens WHERE email = OLD.email;
  END IF;
END
-- @@
CREATE TRIGGER users_keep_active_admin BEFORE UPDATE ON users FOR EACH ROW
BEGIN
  IF OLD.status = 'active' AND OLD.staff_role = 'admin'
    AND (NEW.status <> 'active' OR NOT (NEW.staff_role <=> 'admin'))
    AND NOT EXISTS (SELECT 1 FROM users WHERE id <> OLD.id AND status = 'active' AND staff_role = 'admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'last_staff_admin';
  END IF;
END
-- @@
CREATE TRIGGER leads_deduplicate BEFORE INSERT ON leads FOR EACH ROW
BEGIN
  IF EXISTS (SELECT 1 FROM leads WHERE email = NEW.email AND message_hash = NEW.message_hash AND created_at >= NEW.created_at - 86400000) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'duplicate_lead';
  END IF;
END
-- @@
CREATE TRIGGER approvals_require_open_request BEFORE INSERT ON approvals FOR EACH ROW
BEGIN
  IF NOT EXISTS (SELECT 1 FROM requests WHERE id = NEW.request_id AND state = 'open') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'request_not_open';
  END IF;
END
-- @@
CREATE TRIGGER approvals_require_authorized_actor BEFORE INSERT ON approvals FOR EACH ROW
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM requests r JOIN users u ON u.id = NEW.approver_id
    WHERE r.id = NEW.request_id AND r.requested_by <> u.id AND u.status = 'active'
      AND (u.staff_role IN ('admin', 'delivery') OR EXISTS (
        SELECT 1 FROM memberships m WHERE m.org_id = r.org_id AND m.user_id = u.id AND m.role IN ('admin', 'owner')
      ))
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'approver_not_authorized';
  END IF;
END
-- @@
CREATE TRIGGER files_enforce_quota BEFORE INSERT ON files FOR EACH ROW
BEGIN
  IF (SELECT count(*) FROM files WHERE request_id = NEW.request_id) >= 20 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'file_limit_reached';
  END IF;
END
-- @@
CREATE TRIGGER files_match_request BEFORE INSERT ON files FOR EACH ROW
BEGIN
  IF NOT EXISTS (SELECT 1 FROM requests WHERE id = NEW.request_id AND org_id = NEW.org_id AND state <> 'cancelled') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'file_request_unavailable';
  END IF;
END
-- @@
CREATE TRIGGER staff_mfa_revoke_on_delete AFTER DELETE ON staff_mfa FOR EACH ROW
BEGIN
  IF OLD.enabled_at IS NOT NULL THEN
    DELETE FROM sessions WHERE user_id = OLD.user_id;
    DELETE FROM auth_tokens WHERE email IN (SELECT email FROM users WHERE id = OLD.user_id);
  END IF;
END
-- @@
CREATE TRIGGER staff_mfa_revoke_on_reset AFTER UPDATE ON staff_mfa FOR EACH ROW
BEGIN
  IF OLD.enabled_at IS NOT NULL AND (NOT (NEW.enabled_at <=> OLD.enabled_at) OR NOT (NEW.user_id <=> OLD.user_id)) THEN
    DELETE FROM sessions WHERE user_id = OLD.user_id;
    DELETE FROM auth_tokens WHERE email IN (SELECT email FROM users WHERE id = OLD.user_id);
  END IF;
END
