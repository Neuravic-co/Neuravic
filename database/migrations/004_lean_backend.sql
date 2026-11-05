DROP TRIGGER IF EXISTS leads_deduplicate ON leads
-- @@
DROP FUNCTION IF EXISTS leads_deduplicate()
-- @@
DROP TABLE IF EXISTS lead_intake_locks
-- @@
ALTER TABLE leads ADD COLUMN IF NOT EXISTS dedupe_key varchar(64) NULL
-- @@
UPDATE leads SET dedupe_key = id WHERE dedupe_key IS NULL
-- @@
ALTER TABLE leads ALTER COLUMN dedupe_key SET NOT NULL
-- @@
CREATE UNIQUE INDEX IF NOT EXISTS leads_dedupe_key ON leads (dedupe_key)
