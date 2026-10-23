ALTER TABLE `files` ADD `scan_attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `files` ADD `next_scan_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `files_scan_due` ON `files` (`scan_state`,`next_scan_at`);