-- Provider acceptance is separate from inbox delivery. No message text or recipients in metadata.
ALTER TABLE outbox
  ADD COLUMN provider varchar(16) NULL,
  ADD COLUMN provider_message_id varchar(255) NULL,
  ADD COLUMN accepted_at bigint NULL,
  ADD COLUMN lead_id varchar(64) NULL,
  ADD COLUMN notification_kind varchar(32) NULL,
  ADD KEY outbox_lead (lead_id);
-- @@
-- Acquire this unique row before inserting a lead; the existing trigger then sees the winning transaction.
CREATE TABLE lead_intake_locks (
  `key` varchar(64) NOT NULL PRIMARY KEY,
  expires_at bigint NOT NULL,
  KEY lead_intake_locks_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
