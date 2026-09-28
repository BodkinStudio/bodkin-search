-- Adds the Growth watch's page snapshots and the "monitor" change source.
-- Widening growth_change_events' CHECK needs drizzle-kit's table rebuild.
-- D1 keeps foreign keys enabled inside migrations (PRAGMA foreign_keys is a
-- no-op there), so dropping growth_change_events would cascade into the
-- tables that reference it. Snapshot them first, rebuild, then restore while
-- foreign key checks are deferred to commit (same shape as 0071).
CREATE TABLE `growth_page_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`url` text NOT NULL,
	`captured_at` text NOT NULL,
	`status_code` integer NOT NULL,
	`resolved_url` text NOT NULL,
	`title` text,
	`meta_description` text,
	`h1` text,
	`canonical` text,
	`indexable` integer NOT NULL,
	`word_count` integer NOT NULL,
	`content_hash` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `growth_page_snapshots_page_idx` ON `growth_page_snapshots` (`project_id`,`url`,`captured_at`);--> statement-breakpoint
PRAGMA defer_foreign_keys=ON;
--> statement-breakpoint
CREATE TABLE `__plan_growth_change_event_urls` AS SELECT * FROM `growth_change_event_urls`;
--> statement-breakpoint
CREATE TABLE `__plan_growth_action_changes` AS SELECT * FROM `growth_action_changes`;
--> statement-breakpoint
CREATE TABLE `__plan_growth_measurement_result_changes` AS SELECT * FROM `growth_measurement_result_changes`;
--> statement-breakpoint
CREATE TABLE `__new_growth_change_events` (
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
	CONSTRAINT "growth_change_events_text_bounds_check" CHECK(length("creation_key") BETWEEN 1 AND 200 AND length("fact_hash") = 64 AND length("actor_id") BETWEEN 1 AND 200 AND length("description") BETWEEN 1 AND 5000 AND length("happened_at") BETWEEN 1 AND 50 AND ("external_ref" IS NULL OR length("external_ref") BETWEEN 1 AND 500)),
	CONSTRAINT "growth_change_events_vocabulary_check" CHECK("source" IN ('manual','sherpa','cms_webhook','deployment','monitor') AND "change_type" IN ('content_updated','title_meta_updated','page_created','page_removed','redirect_changed','internal_links_changed','template_changed','structured_data_changed','technical_fix','design_restructure','migration','unknown','mixed') AND "actor_type" IN ('user','agent','system'))
);
--> statement-breakpoint
INSERT INTO `__new_growth_change_events`("id", "project_id", "creation_key", "fact_hash", "source", "change_type", "actor_type", "actor_id", "description", "happened_at", "external_ref", "created_at") SELECT "id", "project_id", "creation_key", "fact_hash", "source", "change_type", "actor_type", "actor_id", "description", "happened_at", "external_ref", "created_at" FROM `growth_change_events`;--> statement-breakpoint
DROP TABLE `growth_change_events`;--> statement-breakpoint
ALTER TABLE `__new_growth_change_events` RENAME TO `growth_change_events`;--> statement-breakpoint
CREATE INDEX `growth_change_events_project_happened_idx` ON `growth_change_events` (`project_id`,`happened_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `growth_change_events_project_id_key` ON `growth_change_events` (`project_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `growth_change_events_project_creation_key` ON `growth_change_events` (`project_id`,`creation_key`);
--> statement-breakpoint
INSERT OR IGNORE INTO `growth_change_event_urls` SELECT * FROM `__plan_growth_change_event_urls`;
--> statement-breakpoint
INSERT OR IGNORE INTO `growth_action_changes` SELECT * FROM `__plan_growth_action_changes`;
--> statement-breakpoint
INSERT OR IGNORE INTO `growth_measurement_result_changes` SELECT * FROM `__plan_growth_measurement_result_changes`;
--> statement-breakpoint
DROP TABLE `__plan_growth_change_event_urls`;
--> statement-breakpoint
DROP TABLE `__plan_growth_action_changes`;
--> statement-breakpoint
DROP TABLE `__plan_growth_measurement_result_changes`;
