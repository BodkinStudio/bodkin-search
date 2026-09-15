-- D1 keeps foreign keys enabled inside migrations, and PRAGMA foreign_keys is a
-- no-op inside a transaction, so drizzle-kit's table rebuild would cascade the
-- DROP of growth_actions into its whole descendant graph. Snapshot those rows
-- first, rebuild growth_actions, then restore them in dependency order while
-- foreign key checks are deferred to commit (same shape as 0050_wet_omega_red).
-- Restores use INSERT OR IGNORE: rows that reference growth_actions only
-- through a nullable column (e.g. growth_ai_briefs.approved_action_id) survive
-- the drop and must not be inserted twice.
PRAGMA defer_foreign_keys=ON;
--> statement-breakpoint
CREATE TABLE `__plan_growth_action_events` AS SELECT * FROM `growth_action_events`;
--> statement-breakpoint
CREATE TABLE `__plan_growth_action_evidence` AS SELECT * FROM `growth_action_evidence`;
--> statement-breakpoint
CREATE TABLE `__plan_growth_action_targets` AS SELECT * FROM `growth_action_targets`;
--> statement-breakpoint
CREATE TABLE `__plan_growth_action_changes` AS SELECT * FROM `growth_action_changes`;
--> statement-breakpoint
CREATE TABLE `__plan_growth_measurement_plans` AS SELECT * FROM `growth_measurement_plans`;
--> statement-breakpoint
CREATE TABLE `__plan_growth_measurement_results` AS SELECT * FROM `growth_measurement_results`;
--> statement-breakpoint
CREATE TABLE `__plan_growth_report_actions` AS SELECT * FROM `growth_report_actions`;
--> statement-breakpoint
CREATE TABLE `__plan_growth_report_measurement_results` AS SELECT * FROM `growth_report_measurement_results`;
--> statement-breakpoint
CREATE TABLE `__plan_growth_ai_briefs` AS SELECT * FROM `growth_ai_briefs`;
--> statement-breakpoint
CREATE TABLE `__plan_growth_measurement_metrics` AS SELECT * FROM `growth_measurement_metrics`;
--> statement-breakpoint
CREATE TABLE `__plan_growth_measurement_observations` AS SELECT * FROM `growth_measurement_observations`;
--> statement-breakpoint
CREATE TABLE `__plan_growth_measurement_plan_anchors` AS SELECT * FROM `growth_measurement_plan_anchors`;
--> statement-breakpoint
CREATE TABLE `__plan_growth_measurement_result_changes` AS SELECT * FROM `growth_measurement_result_changes`;
--> statement-breakpoint
CREATE TABLE `__plan_growth_ai_brief_caveats` AS SELECT * FROM `growth_ai_brief_caveats`;
--> statement-breakpoint
CREATE TABLE `__plan_growth_ai_brief_citation_sources` AS SELECT * FROM `growth_ai_brief_citation_sources`;
--> statement-breakpoint
CREATE TABLE `__plan_growth_ai_brief_claims` AS SELECT * FROM `growth_ai_brief_claims`;
--> statement-breakpoint
CREATE TABLE `__plan_growth_ai_brief_steps` AS SELECT * FROM `growth_ai_brief_steps`;
--> statement-breakpoint
CREATE TABLE `__plan_growth_ai_brief_citations` AS SELECT * FROM `growth_ai_brief_citations`;
--> statement-breakpoint
CREATE TABLE `__new_growth_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`recommendation_id` text,
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
	`workstream_id` text,
	`workstream_position` integer,
	`rationale` text,
	`success_measure` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`project_id`,`workstream_id`) REFERENCES `growth_workstreams`(`project_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`,`recommendation_id`) REFERENCES `growth_recommendations`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "growth_actions_text_bounds_check" CHECK(length("__new_growth_actions"."creation_key") BETWEEN 1 AND 200 AND length("__new_growth_actions"."fact_hash") = 64 AND length("__new_growth_actions"."title") BETWEEN 1 AND 300 AND length("__new_growth_actions"."description") BETWEEN 1 AND 5000 AND length("__new_growth_actions"."category") BETWEEN 1 AND 100 AND length("__new_growth_actions"."due_at") BETWEEN 1 AND 50 AND ("__new_growth_actions"."rationale" IS NULL OR length("__new_growth_actions"."rationale") BETWEEN 1 AND 2000) AND ("__new_growth_actions"."success_measure" IS NULL OR length("__new_growth_actions"."success_measure") BETWEEN 1 AND 300)),
	CONSTRAINT "growth_actions_state_check" CHECK("__new_growth_actions"."status" IN ('approved','ready','in_progress','blocked','implemented','measuring','evaluated','cancelled') AND typeof("__new_growth_actions"."state_version") = 'integer' AND "__new_growth_actions"."state_version" >= 0 AND "__new_growth_actions"."priority_score" >= 0 AND "__new_growth_actions"."priority_score" < 1e999 AND (("__new_growth_actions"."state_version" = 0 AND "__new_growth_actions"."status" = 'approved') OR ("__new_growth_actions"."state_version" > 0 AND "__new_growth_actions"."status" <> 'approved'))),
	CONSTRAINT "growth_actions_origin_check" CHECK(("__new_growth_actions"."recommendation_id" IS NOT NULL OR "__new_growth_actions"."workstream_id" IS NOT NULL) AND ("__new_growth_actions"."workstream_position" IS NULL OR ("__new_growth_actions"."workstream_id" IS NOT NULL AND "__new_growth_actions"."workstream_position" >= 1))),
	CONSTRAINT "growth_actions_milestones_check" CHECK("__new_growth_actions"."approved_at" IS NOT NULL AND (("__new_growth_actions"."status" = 'approved' AND "__new_growth_actions"."started_at" IS NULL AND "__new_growth_actions"."implemented_at" IS NULL AND "__new_growth_actions"."evaluated_at" IS NULL AND "__new_growth_actions"."cancelled_at" IS NULL) OR ("__new_growth_actions"."status" = 'ready' AND "__new_growth_actions"."started_at" IS NULL AND "__new_growth_actions"."implemented_at" IS NULL AND "__new_growth_actions"."evaluated_at" IS NULL AND "__new_growth_actions"."cancelled_at" IS NULL) OR ("__new_growth_actions"."status" IN ('in_progress','blocked') AND "__new_growth_actions"."started_at" IS NOT NULL AND "__new_growth_actions"."implemented_at" IS NULL AND "__new_growth_actions"."evaluated_at" IS NULL AND "__new_growth_actions"."cancelled_at" IS NULL) OR ("__new_growth_actions"."status" IN ('implemented','measuring') AND "__new_growth_actions"."implemented_at" IS NOT NULL AND "__new_growth_actions"."evaluated_at" IS NULL AND "__new_growth_actions"."cancelled_at" IS NULL) OR ("__new_growth_actions"."status" = 'evaluated' AND "__new_growth_actions"."implemented_at" IS NOT NULL AND "__new_growth_actions"."evaluated_at" IS NOT NULL AND "__new_growth_actions"."cancelled_at" IS NULL) OR ("__new_growth_actions"."status" = 'cancelled' AND "__new_growth_actions"."implemented_at" IS NULL AND "__new_growth_actions"."evaluated_at" IS NULL AND "__new_growth_actions"."cancelled_at" IS NOT NULL)))
);
--> statement-breakpoint
INSERT INTO `__new_growth_actions`("id", "project_id", "recommendation_id", "creation_key", "fact_hash", "title", "description", "category", "priority_score", "status", "state_version", "owner_user_id", "due_at", "approved_at", "started_at", "implemented_at", "evaluated_at", "cancelled_at", "created_at", "updated_at", "workstream_id", "workstream_position", "rationale", "success_measure") SELECT "id", "project_id", "recommendation_id", "creation_key", "fact_hash", "title", "description", "category", "priority_score", "status", "state_version", "owner_user_id", "due_at", "approved_at", "started_at", "implemented_at", "evaluated_at", "cancelled_at", "created_at", "updated_at", "workstream_id", "workstream_position", "rationale", "success_measure" FROM `growth_actions`;
--> statement-breakpoint
DROP TABLE `growth_actions`;
--> statement-breakpoint
ALTER TABLE `__new_growth_actions` RENAME TO `growth_actions`;
--> statement-breakpoint
CREATE UNIQUE INDEX `growth_actions_project_id_key` ON `growth_actions` (`project_id`,`id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `growth_actions_project_creation_key` ON `growth_actions` (`project_id`,`creation_key`);
--> statement-breakpoint
CREATE UNIQUE INDEX `growth_actions_workstream_position_key` ON `growth_actions` (`project_id`,`workstream_id`,`workstream_position`);
--> statement-breakpoint
INSERT OR IGNORE INTO `growth_action_events` SELECT * FROM `__plan_growth_action_events`;
--> statement-breakpoint
INSERT OR IGNORE INTO `growth_action_evidence` SELECT * FROM `__plan_growth_action_evidence`;
--> statement-breakpoint
INSERT OR IGNORE INTO `growth_action_targets` SELECT * FROM `__plan_growth_action_targets`;
--> statement-breakpoint
INSERT OR IGNORE INTO `growth_action_changes` SELECT * FROM `__plan_growth_action_changes`;
--> statement-breakpoint
INSERT OR IGNORE INTO `growth_measurement_plans` SELECT * FROM `__plan_growth_measurement_plans`;
--> statement-breakpoint
INSERT OR IGNORE INTO `growth_measurement_results` SELECT * FROM `__plan_growth_measurement_results`;
--> statement-breakpoint
INSERT OR IGNORE INTO `growth_report_actions` SELECT * FROM `__plan_growth_report_actions`;
--> statement-breakpoint
INSERT OR IGNORE INTO `growth_report_measurement_results` SELECT * FROM `__plan_growth_report_measurement_results`;
--> statement-breakpoint
INSERT OR IGNORE INTO `growth_ai_briefs` SELECT * FROM `__plan_growth_ai_briefs`;
--> statement-breakpoint
INSERT OR IGNORE INTO `growth_measurement_metrics` SELECT * FROM `__plan_growth_measurement_metrics`;
--> statement-breakpoint
INSERT OR IGNORE INTO `growth_measurement_observations` SELECT * FROM `__plan_growth_measurement_observations`;
--> statement-breakpoint
INSERT OR IGNORE INTO `growth_measurement_plan_anchors` SELECT * FROM `__plan_growth_measurement_plan_anchors`;
--> statement-breakpoint
INSERT OR IGNORE INTO `growth_measurement_result_changes` SELECT * FROM `__plan_growth_measurement_result_changes`;
--> statement-breakpoint
INSERT OR IGNORE INTO `growth_ai_brief_caveats` SELECT * FROM `__plan_growth_ai_brief_caveats`;
--> statement-breakpoint
INSERT OR IGNORE INTO `growth_ai_brief_citation_sources` SELECT * FROM `__plan_growth_ai_brief_citation_sources`;
--> statement-breakpoint
INSERT OR IGNORE INTO `growth_ai_brief_claims` SELECT * FROM `__plan_growth_ai_brief_claims`;
--> statement-breakpoint
INSERT OR IGNORE INTO `growth_ai_brief_steps` SELECT * FROM `__plan_growth_ai_brief_steps`;
--> statement-breakpoint
INSERT OR IGNORE INTO `growth_ai_brief_citations` SELECT * FROM `__plan_growth_ai_brief_citations`;
--> statement-breakpoint
DROP TABLE `__plan_growth_action_events`;
--> statement-breakpoint
DROP TABLE `__plan_growth_action_evidence`;
--> statement-breakpoint
DROP TABLE `__plan_growth_action_targets`;
--> statement-breakpoint
DROP TABLE `__plan_growth_action_changes`;
--> statement-breakpoint
DROP TABLE `__plan_growth_measurement_plans`;
--> statement-breakpoint
DROP TABLE `__plan_growth_measurement_results`;
--> statement-breakpoint
DROP TABLE `__plan_growth_report_actions`;
--> statement-breakpoint
DROP TABLE `__plan_growth_report_measurement_results`;
--> statement-breakpoint
DROP TABLE `__plan_growth_ai_briefs`;
--> statement-breakpoint
DROP TABLE `__plan_growth_measurement_metrics`;
--> statement-breakpoint
DROP TABLE `__plan_growth_measurement_observations`;
--> statement-breakpoint
DROP TABLE `__plan_growth_measurement_plan_anchors`;
--> statement-breakpoint
DROP TABLE `__plan_growth_measurement_result_changes`;
--> statement-breakpoint
DROP TABLE `__plan_growth_ai_brief_caveats`;
--> statement-breakpoint
DROP TABLE `__plan_growth_ai_brief_citation_sources`;
--> statement-breakpoint
DROP TABLE `__plan_growth_ai_brief_claims`;
--> statement-breakpoint
DROP TABLE `__plan_growth_ai_brief_steps`;
--> statement-breakpoint
DROP TABLE `__plan_growth_ai_brief_citations`;
--> statement-breakpoint
PRAGMA defer_foreign_keys=OFF;
