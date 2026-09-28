CREATE TABLE `analytics_daily_aggregates` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`environment` text NOT NULL,
	`day` text NOT NULL,
	`metric` text NOT NULL,
	`currency` text DEFAULT '' NOT NULL,
	`value` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `analytics_daily_aggregate_dimension` ON `analytics_daily_aggregates` (`project_id`,`environment`,`day`,`metric`,`currency`);--> statement-breakpoint
CREATE TABLE `analytics_erasure_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`identity_key` text NOT NULL,
	`erased_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `analytics_erasure_identity` ON `analytics_erasure_keys` (`project_id`,`identity_key`);--> statement-breakpoint
CREATE TABLE `analytics_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`entity` text NOT NULL,
	`field` text NOT NULL,
	`previous_value` text,
	`next_value` text,
	`reason` text,
	`occurred_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `analytics_audit_project_time` ON `analytics_audit` (`project_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `analytics_excluded_paths` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`prefix` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `analytics_excluded_path` ON `analytics_excluded_paths` (`project_id`,`prefix`);--> statement-breakpoint
CREATE TABLE `analytics_funnel_stages` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`template` text NOT NULL,
	`position` integer NOT NULL,
	`label` text NOT NULL,
	`event` text NOT NULL,
	`action` text,
	`instrumented` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `analytics_funnel_stage_position` ON `analytics_funnel_stages` (`project_id`,`template`,`position`);--> statement-breakpoint
CREATE TABLE `analytics_reporting_settings` (
	`project_id` text PRIMARY KEY NOT NULL,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`completion_window_days` integer DEFAULT 7 NOT NULL,
	`onboarding_event` text DEFAULT 'activation_achieved' NOT NULL,
	`onboarding_instrumented` integer DEFAULT false NOT NULL,
	`onboarding_wait_days` integer DEFAULT 7 NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `analytics_settings` ADD `customer_retention_days` integer DEFAULT 395 NOT NULL;