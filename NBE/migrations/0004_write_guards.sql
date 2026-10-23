-- These guards run at the write boundary inside D1's atomic batches. They do not rewrite existing data.
CREATE TRIGGER users_revoke_credentials
AFTER UPDATE OF status, staff_role ON users
WHEN NEW.status = 'disabled' OR NEW.staff_role IS NOT OLD.staff_role
BEGIN
  DELETE FROM sessions WHERE user_id = NEW.id;
  DELETE FROM auth_tokens WHERE email = OLD.email;
END;
--> statement-breakpoint
CREATE TRIGGER users_keep_active_admin
BEFORE UPDATE OF status, staff_role ON users
WHEN OLD.status = 'active' AND OLD.staff_role = 'admin'
  AND (NEW.status <> 'active' OR NEW.staff_role IS NOT 'admin')
  AND NOT EXISTS (SELECT 1 FROM users WHERE id <> OLD.id AND status = 'active' AND staff_role = 'admin')
BEGIN
  SELECT RAISE(ABORT, 'last_staff_admin');
END;
--> statement-breakpoint
CREATE TRIGGER leads_deduplicate
BEFORE INSERT ON leads
WHEN EXISTS (
  SELECT 1 FROM leads WHERE email = NEW.email AND message_hash = NEW.message_hash
  AND created_at >= NEW.created_at - 86400000
)
BEGIN
  SELECT RAISE(ABORT, 'duplicate_lead');
END;
--> statement-breakpoint
CREATE TRIGGER approvals_require_open_request
BEFORE INSERT ON approvals
WHEN NOT EXISTS (SELECT 1 FROM requests WHERE id = NEW.request_id AND state = 'open')
BEGIN
  SELECT RAISE(ABORT, 'request_not_open');
END;
--> statement-breakpoint
CREATE TRIGGER approvals_require_authorized_actor
BEFORE INSERT ON approvals
WHEN NOT EXISTS (
  SELECT 1 FROM requests r JOIN users u ON u.id = NEW.approver_id
  WHERE r.id = NEW.request_id AND r.requested_by <> u.id AND u.status = 'active'
    AND (u.staff_role IN ('admin', 'delivery') OR EXISTS (
      SELECT 1 FROM memberships m WHERE m.org_id = r.org_id AND m.user_id = u.id AND m.role IN ('admin', 'owner')
    ))
)
BEGIN
  SELECT RAISE(ABORT, 'approver_not_authorized');
END;
--> statement-breakpoint
CREATE TRIGGER files_enforce_quota
BEFORE INSERT ON files
WHEN (SELECT count(*) FROM files WHERE request_id = NEW.request_id) >= 20
BEGIN
  SELECT RAISE(ABORT, 'file_limit_reached');
END;
--> statement-breakpoint
CREATE TRIGGER files_match_request
BEFORE INSERT ON files
WHEN NOT EXISTS (SELECT 1 FROM requests WHERE id = NEW.request_id AND org_id = NEW.org_id AND state <> 'cancelled')
BEGIN
  SELECT RAISE(ABORT, 'file_request_unavailable');
END;
