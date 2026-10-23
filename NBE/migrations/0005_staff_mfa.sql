CREATE TABLE `staff_mfa` (
	`user_id` text PRIMARY KEY NOT NULL,
	`encrypted_secret` text NOT NULL,
	`enabled_at` integer,
	`created_at` integer NOT NULL,
	`last_used_step` integer DEFAULT -1 NOT NULL,
	`recovery_hashes` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `sessions` ADD `mfa_verified_at` integer;