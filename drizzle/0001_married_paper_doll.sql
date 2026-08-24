CREATE TABLE `calendar_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`account_email` text NOT NULL,
	`access_token` text NOT NULL,
	`refresh_token` text,
	`expires_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_connections_email_unique` ON `calendar_connections` (`account_email`);--> statement-breakpoint
CREATE TABLE `calendar_events` (
	`id` text PRIMARY KEY NOT NULL,
	`appointment_id` text NOT NULL,
	`account_email` text NOT NULL,
	`provider_event_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_events_appointment_account_unique` ON `calendar_events` (`appointment_id`,`account_email`);