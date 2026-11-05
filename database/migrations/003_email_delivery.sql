ALTER TABLE outbox
  ADD COLUMN provider varchar(16) NULL,
  ADD COLUMN provider_message_id varchar(255) NULL,
  ADD COLUMN accepted_at bigint NULL,
  ADD COLUMN lead_id varchar(64) NULL,
  ADD COLUMN notification_kind varchar(32) NULL
-- @@
CREATE INDEX outbox_lead ON outbox (lead_id)
-- @@
CREATE TABLE lead_intake_locks (
  key varchar(64) NOT NULL PRIMARY KEY,
  expires_at bigint NOT NULL
)
-- @@
CREATE INDEX lead_intake_locks_expiry ON lead_intake_locks (expires_at)
