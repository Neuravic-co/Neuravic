-- Custom SQL migration file, put your code below! --
-- Supervised factor removal/reset must not leave earlier session proofs or emailed links usable.
CREATE TRIGGER staff_mfa_revoke_on_delete
AFTER DELETE ON staff_mfa
WHEN OLD.enabled_at IS NOT NULL
BEGIN
  DELETE FROM sessions WHERE user_id = OLD.user_id;
  DELETE FROM auth_tokens WHERE email IN (SELECT email FROM users WHERE id = OLD.user_id);
END;
--> statement-breakpoint
CREATE TRIGGER staff_mfa_revoke_on_reset
AFTER UPDATE OF enabled_at, user_id ON staff_mfa
WHEN OLD.enabled_at IS NOT NULL AND (NEW.enabled_at IS NOT OLD.enabled_at OR NEW.user_id IS NOT OLD.user_id)
BEGIN
  DELETE FROM sessions WHERE user_id = OLD.user_id;
  DELETE FROM auth_tokens WHERE email IN (SELECT email FROM users WHERE id = OLD.user_id);
END;
