CREATE TABLE `privacy_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`reviewed_by` text,
	`review_reference` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `privacy_requests_user` ON `privacy_requests` (`user_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `privacy_requests_created` ON `privacy_requests` (`created_at`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `privacy_requests_open` ON `privacy_requests` (`user_id`,`kind`) WHERE state in ('pending', 'in_review');