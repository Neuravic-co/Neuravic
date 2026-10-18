DROP INDEX `requests_org`;--> statement-breakpoint
DROP INDEX `requests_project`;--> statement-breakpoint
CREATE INDEX `requests_org_state_created` ON `requests` (`org_id`,`state`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `requests_org_created` ON `requests` (`org_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `requests_project` ON `requests` (`project_id`,`created_at`,`id`);--> statement-breakpoint
DROP INDEX `audit_at`;--> statement-breakpoint
DROP INDEX `audit_org`;--> statement-breakpoint
CREATE INDEX `audit_action` ON `audit_log` (`action`,`at`,`id`);--> statement-breakpoint
CREATE INDEX `audit_at` ON `audit_log` (`at`,`id`);--> statement-breakpoint
CREATE INDEX `audit_org` ON `audit_log` (`org_id`,`at`,`id`);--> statement-breakpoint
DROP INDEX `files_request`;--> statement-breakpoint
CREATE INDEX `files_request` ON `files` (`request_id`,`created_at`);--> statement-breakpoint
DROP INDEX `leads_status_created`;--> statement-breakpoint
CREATE INDEX `leads_created` ON `leads` (`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `leads_status_created` ON `leads` (`status`,`created_at`,`id`);--> statement-breakpoint
DROP INDEX `projects_org`;--> statement-breakpoint
CREATE INDEX `projects_org` ON `projects` (`org_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `auth_tokens_expires` ON `auth_tokens` (`expires_at`);--> statement-breakpoint
CREATE INDEX `sessions_expires` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE INDEX `sessions_absolute_expires` ON `sessions` (`absolute_expires_at`);