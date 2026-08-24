CREATE TABLE `appointments` (
	`id` text PRIMARY KEY NOT NULL,
	`doctor_name` text NOT NULL,
	`patient_name` text NOT NULL,
	`scheduled_for` text NOT NULL,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`symptoms` text NOT NULL,
	`urgency` text DEFAULT 'low' NOT NULL,
	`pre_visit_summary` text,
	`post_visit_summary` text,
	`hold_expires_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `appointments_doctor_slot_unique` ON `appointments` (`doctor_name`,`scheduled_for`);--> statement-breakpoint
CREATE INDEX `appointments_patient_idx` ON `appointments` (`patient_name`);--> statement-breakpoint
CREATE TABLE `doctor_leaves` (
	`id` text PRIMARY KEY NOT NULL,
	`doctor_id` text NOT NULL,
	`leave_date` text NOT NULL,
	`reason` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `doctor_leave_date_unique` ON `doctor_leaves` (`doctor_id`,`leave_date`);--> statement-breakpoint
CREATE TABLE `doctors` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`specialty` text NOT NULL,
	`working_hours` text NOT NULL,
	`slot_duration_minutes` integer DEFAULT 30 NOT NULL,
	`calendar_connected` integer DEFAULT false,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `notification_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`appointment_id` text,
	`channel` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer,
	`idempotency_key` text NOT NULL,
	FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_jobs_idempotency_key_unique` ON `notification_jobs` (`idempotency_key`);--> statement-breakpoint
CREATE TABLE `prescriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`appointment_id` text NOT NULL,
	`medication_name` text NOT NULL,
	`dosage` text NOT NULL,
	`frequency` text NOT NULL,
	`duration_days` integer NOT NULL,
	`instructions` text,
	FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);