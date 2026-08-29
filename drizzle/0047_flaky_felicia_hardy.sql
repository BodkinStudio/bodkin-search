CREATE TABLE `growth_action_changes` (
	`project_id` text NOT NULL,
	`action_id` text NOT NULL,
	`change_event_id` text NOT NULL,
	FOREIGN KEY (`project_id`,`action_id`) REFERENCES `growth_actions`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`change_event_id`) REFERENCES `growth_change_events`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `growth_action_changes_project_event_idx` ON `growth_action_changes` (`project_id`,`change_event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `growth_action_changes_key` ON `growth_action_changes` (`project_id`,`action_id`,`change_event_id`);--> statement-breakpoint
CREATE TABLE `growth_change_event_urls` (
	`project_id` text NOT NULL,
	`change_event_id` text NOT NULL,
	`url` text NOT NULL,
	FOREIGN KEY (`project_id`,`change_event_id`) REFERENCES `growth_change_events`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "growth_change_event_urls_text_check" CHECK(length("growth_change_event_urls"."url") BETWEEN 1 AND 2000)
);
--> statement-breakpoint
CREATE INDEX `growth_change_event_urls_project_url_idx` ON `growth_change_event_urls` (`project_id`,`url`);--> statement-breakpoint
CREATE UNIQUE INDEX `growth_change_event_urls_key` ON `growth_change_event_urls` (`project_id`,`change_event_id`,`url`);--> statement-breakpoint
CREATE TABLE `growth_change_events` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`creation_key` text NOT NULL,
	`fact_hash` text NOT NULL,
	`source` text NOT NULL,
	`change_type` text NOT NULL,
	`actor_type` text NOT NULL,
	`actor_id` text NOT NULL,
	`description` text NOT NULL,
	`happened_at` text NOT NULL,
	`external_ref` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "growth_change_events_text_bounds_check" CHECK(length("growth_change_events"."creation_key") BETWEEN 1 AND 200 AND length("growth_change_events"."fact_hash") = 64 AND length("growth_change_events"."actor_id") BETWEEN 1 AND 200 AND length("growth_change_events"."description") BETWEEN 1 AND 5000 AND length("growth_change_events"."happened_at") BETWEEN 1 AND 50 AND ("growth_change_events"."external_ref" IS NULL OR length("growth_change_events"."external_ref") BETWEEN 1 AND 500)),
	CONSTRAINT "growth_change_events_vocabulary_check" CHECK("growth_change_events"."source" IN ('manual','sherpa','cms_webhook','deployment') AND "growth_change_events"."change_type" IN ('content_updated','title_meta_updated','page_created','page_removed','redirect_changed','internal_links_changed','template_changed','structured_data_changed','technical_fix','design_restructure','migration','unknown','mixed') AND "growth_change_events"."actor_type" IN ('user','agent','system'))
);
--> statement-breakpoint
CREATE INDEX `growth_change_events_project_happened_idx` ON `growth_change_events` (`project_id`,`happened_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `growth_change_events_project_id_key` ON `growth_change_events` (`project_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `growth_change_events_project_creation_key` ON `growth_change_events` (`project_id`,`creation_key`);