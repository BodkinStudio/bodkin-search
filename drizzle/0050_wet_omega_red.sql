-- D1 keeps foreign keys enabled inside migrations. Dropping growth_actions
-- cascades into its descendants even with deferred checks. Snapshot the complete
-- affected row graph without foreign keys, rebuild only the two changed tables,
-- then restore in dependency order. The migration runner must execute this file
-- atomically (Wrangler D1 migrations and Drizzle's migrator both do so).
--> statement-breakpoint
PRAGMA defer_foreign_keys=ON;
--> statement-breakpoint
CREATE TABLE `__growth_done_growth_actions` AS SELECT * FROM `growth_actions`;
--> statement-breakpoint
CREATE TABLE `__growth_done_growth_action_events` AS SELECT * FROM `growth_action_events`;
--> statement-breakpoint
CREATE TABLE `__growth_done_growth_action_targets` AS SELECT * FROM `growth_action_targets`;
--> statement-breakpoint
CREATE TABLE `__growth_done_growth_action_changes` AS SELECT * FROM `growth_action_changes`;
--> statement-breakpoint
CREATE TABLE `__growth_done_growth_measurement_plans` AS SELECT * FROM `growth_measurement_plans`;
--> statement-breakpoint
CREATE TABLE `__growth_done_growth_measurement_metrics` AS SELECT * FROM `growth_measurement_metrics`;
--> statement-breakpoint
CREATE TABLE `__growth_done_growth_measurement_observations` AS SELECT * FROM `growth_measurement_observations`;
--> statement-breakpoint
CREATE TABLE `__growth_done_growth_measurement_results` AS SELECT * FROM `growth_measurement_results`;
--> statement-breakpoint
CREATE TABLE `__growth_done_growth_measurement_result_changes` AS SELECT * FROM `growth_measurement_result_changes`;
--> statement-breakpoint
CREATE TABLE `__growth_done_growth_report_actions` AS SELECT * FROM `growth_report_actions`;
--> statement-breakpoint
CREATE TABLE `__growth_done_growth_report_measurement_results` AS SELECT * FROM `growth_report_measurement_results`;
--> statement-breakpoint
DROP TABLE `growth_action_events`;
--> statement-breakpoint
DROP TABLE `growth_actions`;
--> statement-breakpoint
CREATE TABLE `growth_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`recommendation_id` text NOT NULL,
	`creation_key` text NOT NULL,
	`fact_hash` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`priority_score` real NOT NULL,
	`status` text DEFAULT 'approved' NOT NULL,
	`state_version` integer DEFAULT 0 NOT NULL,
	`owner_user_id` text,
	`due_at` text NOT NULL,
	`approved_at` text NOT NULL,
	`started_at` text,
	`implemented_at` text,
	`evaluated_at` text,
	`cancelled_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`project_id`,`recommendation_id`) REFERENCES `growth_recommendations`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "growth_actions_text_bounds_check" CHECK(length("growth_actions"."creation_key") BETWEEN 1 AND 200 AND length("growth_actions"."fact_hash") = 64 AND length("growth_actions"."title") BETWEEN 1 AND 300 AND length("growth_actions"."description") BETWEEN 1 AND 5000 AND length("growth_actions"."category") BETWEEN 1 AND 100 AND length("growth_actions"."due_at") BETWEEN 1 AND 50),
	CONSTRAINT "growth_actions_state_check" CHECK("growth_actions"."status" IN ('approved','ready','in_progress','blocked','implemented','measuring','evaluated','cancelled') AND typeof("growth_actions"."state_version") = 'integer' AND "growth_actions"."state_version" >= 0 AND "growth_actions"."priority_score" >= 0 AND "growth_actions"."priority_score" < 1e999 AND (("growth_actions"."state_version" = 0 AND "growth_actions"."status" = 'approved') OR ("growth_actions"."state_version" > 0 AND "growth_actions"."status" <> 'approved'))),
	CONSTRAINT "growth_actions_milestones_check" CHECK("growth_actions"."approved_at" IS NOT NULL AND (("growth_actions"."status" = 'approved' AND "growth_actions"."started_at" IS NULL AND "growth_actions"."implemented_at" IS NULL AND "growth_actions"."evaluated_at" IS NULL AND "growth_actions"."cancelled_at" IS NULL) OR ("growth_actions"."status" = 'ready' AND "growth_actions"."started_at" IS NULL AND "growth_actions"."implemented_at" IS NULL AND "growth_actions"."evaluated_at" IS NULL AND "growth_actions"."cancelled_at" IS NULL) OR ("growth_actions"."status" IN ('in_progress','blocked') AND "growth_actions"."started_at" IS NOT NULL AND "growth_actions"."implemented_at" IS NULL AND "growth_actions"."evaluated_at" IS NULL AND "growth_actions"."cancelled_at" IS NULL) OR ("growth_actions"."status" IN ('implemented','measuring') AND "growth_actions"."implemented_at" IS NOT NULL AND "growth_actions"."evaluated_at" IS NULL AND "growth_actions"."cancelled_at" IS NULL) OR ("growth_actions"."status" = 'evaluated' AND "growth_actions"."implemented_at" IS NOT NULL AND "growth_actions"."evaluated_at" IS NOT NULL AND "growth_actions"."cancelled_at" IS NULL) OR ("growth_actions"."status" = 'cancelled' AND "growth_actions"."implemented_at" IS NULL AND "growth_actions"."evaluated_at" IS NULL AND "growth_actions"."cancelled_at" IS NOT NULL)))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `growth_actions_project_id_key` ON `growth_actions` (`project_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `growth_actions_project_creation_key` ON `growth_actions` (`project_id`,`creation_key`);
--> statement-breakpoint
CREATE TABLE `growth_action_events` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`action_id` text NOT NULL,
	`action_version` integer NOT NULL,
	`fact_hash` text NOT NULL,
	`event_type` text NOT NULL,
	`actor_type` text NOT NULL,
	`actor_id` text NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`note` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`,`action_id`) REFERENCES `growth_actions`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "growth_action_events_text_check" CHECK(length("growth_action_events"."fact_hash") = 64 AND length("growth_action_events"."actor_id") BETWEEN 1 AND 200 AND ("growth_action_events"."note" IS NULL OR length("growth_action_events"."note") BETWEEN 1 AND 5000)),
	CONSTRAINT "growth_action_events_shape_check" CHECK("growth_action_events"."event_type" IN ('created','status_changed') AND "growth_action_events"."actor_type" IN ('user','agent','system') AND "growth_action_events"."to_status" IN ('approved','ready','in_progress','blocked','implemented','measuring','evaluated','cancelled') AND ("growth_action_events"."from_status" IS NULL OR "growth_action_events"."from_status" IN ('approved','ready','in_progress','blocked','implemented','measuring','evaluated','cancelled')) AND typeof("growth_action_events"."action_version") = 'integer' AND (("growth_action_events"."event_type" = 'created' AND "growth_action_events"."action_version" = 0 AND "growth_action_events"."from_status" IS NULL AND "growth_action_events"."to_status" = 'approved') OR ("growth_action_events"."event_type" = 'status_changed' AND "growth_action_events"."action_version" > 0 AND "growth_action_events"."from_status" IS NOT NULL))),
	CONSTRAINT "growth_action_events_transition_check" CHECK("growth_action_events"."event_type" = 'created' OR ("growth_action_events"."from_status" = 'approved' AND "growth_action_events"."to_status" IN ('ready','implemented','cancelled')) OR ("growth_action_events"."from_status" = 'ready' AND "growth_action_events"."to_status" IN ('in_progress','implemented','cancelled')) OR ("growth_action_events"."from_status" = 'in_progress' AND "growth_action_events"."to_status" IN ('blocked','implemented','cancelled')) OR ("growth_action_events"."from_status" = 'blocked' AND "growth_action_events"."to_status" IN ('in_progress','implemented','cancelled')) OR ("growth_action_events"."from_status" = 'implemented' AND "growth_action_events"."to_status" = 'measuring') OR ("growth_action_events"."from_status" = 'measuring' AND "growth_action_events"."to_status" = 'evaluated'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `growth_action_events_project_action_version_key` ON `growth_action_events` (`project_id`,`action_id`,`action_version`);--> statement-breakpoint
--> statement-breakpoint
INSERT INTO `growth_actions` SELECT * FROM `__growth_done_growth_actions`;
--> statement-breakpoint
INSERT INTO `growth_action_events` SELECT * FROM `__growth_done_growth_action_events`;
--> statement-breakpoint
INSERT INTO `growth_action_targets` SELECT * FROM `__growth_done_growth_action_targets`;
--> statement-breakpoint
INSERT INTO `growth_action_changes` SELECT * FROM `__growth_done_growth_action_changes`;
--> statement-breakpoint
INSERT INTO `growth_measurement_plans` SELECT * FROM `__growth_done_growth_measurement_plans`;
--> statement-breakpoint
INSERT INTO `growth_measurement_metrics` SELECT * FROM `__growth_done_growth_measurement_metrics`;
--> statement-breakpoint
INSERT INTO `growth_measurement_observations` SELECT * FROM `__growth_done_growth_measurement_observations`;
--> statement-breakpoint
INSERT INTO `growth_measurement_results` SELECT * FROM `__growth_done_growth_measurement_results`;
--> statement-breakpoint
INSERT INTO `growth_measurement_result_changes` SELECT * FROM `__growth_done_growth_measurement_result_changes`;
--> statement-breakpoint
INSERT INTO `growth_report_actions` SELECT * FROM `__growth_done_growth_report_actions`;
--> statement-breakpoint
INSERT INTO `growth_report_measurement_results` SELECT * FROM `__growth_done_growth_report_measurement_results`;
--> statement-breakpoint
DROP TABLE `__growth_done_growth_actions`;
--> statement-breakpoint
DROP TABLE `__growth_done_growth_action_events`;
--> statement-breakpoint
DROP TABLE `__growth_done_growth_action_targets`;
--> statement-breakpoint
DROP TABLE `__growth_done_growth_action_changes`;
--> statement-breakpoint
DROP TABLE `__growth_done_growth_measurement_plans`;
--> statement-breakpoint
DROP TABLE `__growth_done_growth_measurement_metrics`;
--> statement-breakpoint
DROP TABLE `__growth_done_growth_measurement_observations`;
--> statement-breakpoint
DROP TABLE `__growth_done_growth_measurement_results`;
--> statement-breakpoint
DROP TABLE `__growth_done_growth_measurement_result_changes`;
--> statement-breakpoint
DROP TABLE `__growth_done_growth_report_actions`;
--> statement-breakpoint
DROP TABLE `__growth_done_growth_report_measurement_results`;
--> statement-breakpoint
PRAGMA defer_foreign_keys=OFF;
