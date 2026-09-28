CREATE TABLE `growth_report_actions` (
	`project_id` text NOT NULL,
	`report_id` text NOT NULL,
	`action_id` text NOT NULL,
	FOREIGN KEY (`project_id`,`report_id`) REFERENCES `growth_reports`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`action_id`) REFERENCES `growth_actions`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "growth_report_actions_text_bounds_check" CHECK(length("growth_report_actions"."report_id") BETWEEN 1 AND 100 AND length("growth_report_actions"."action_id") BETWEEN 1 AND 100)
);
--> statement-breakpoint
CREATE INDEX `growth_report_actions_project_action_idx` ON `growth_report_actions` (`project_id`,`action_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `growth_report_actions_key` ON `growth_report_actions` (`project_id`,`report_id`,`action_id`);--> statement-breakpoint
CREATE TABLE `growth_report_measurement_results` (
	`project_id` text NOT NULL,
	`report_id` text NOT NULL,
	`measurement_result_id` text NOT NULL,
	FOREIGN KEY (`project_id`,`report_id`) REFERENCES `growth_reports`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`measurement_result_id`) REFERENCES `growth_measurement_results`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "growth_report_measurement_results_text_bounds_check" CHECK(length("growth_report_measurement_results"."report_id") BETWEEN 1 AND 100 AND length("growth_report_measurement_results"."measurement_result_id") BETWEEN 1 AND 100)
);
--> statement-breakpoint
CREATE INDEX `growth_report_measurement_results_project_result_idx` ON `growth_report_measurement_results` (`project_id`,`measurement_result_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `growth_report_measurement_results_key` ON `growth_report_measurement_results` (`project_id`,`report_id`,`measurement_result_id`);--> statement-breakpoint
CREATE TABLE `growth_report_sections` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`report_id` text NOT NULL,
	`section_type` text NOT NULL,
	`position` integer NOT NULL,
	`structured_content` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`,`report_id`) REFERENCES `growth_reports`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "growth_report_sections_vocabulary_check" CHECK("growth_report_sections"."section_type" IN ('executive_summary','performance','meaningful_changes','work_completed','results_from_earlier_work','risks','opportunities','next_month')),
	CONSTRAINT "growth_report_sections_position_check" CHECK(typeof("growth_report_sections"."position") = 'integer' AND (("growth_report_sections"."position" = 0 AND "growth_report_sections"."section_type" = 'executive_summary') OR ("growth_report_sections"."position" = 1 AND "growth_report_sections"."section_type" = 'performance') OR ("growth_report_sections"."position" = 2 AND "growth_report_sections"."section_type" = 'meaningful_changes') OR ("growth_report_sections"."position" = 3 AND "growth_report_sections"."section_type" = 'work_completed') OR ("growth_report_sections"."position" = 4 AND "growth_report_sections"."section_type" = 'results_from_earlier_work') OR ("growth_report_sections"."position" = 5 AND "growth_report_sections"."section_type" = 'risks') OR ("growth_report_sections"."position" = 6 AND "growth_report_sections"."section_type" = 'opportunities') OR ("growth_report_sections"."position" = 7 AND "growth_report_sections"."section_type" = 'next_month'))),
	CONSTRAINT "growth_report_sections_text_bounds_check" CHECK(length("growth_report_sections"."id") BETWEEN 1 AND 100 AND length("growth_report_sections"."report_id") BETWEEN 1 AND 100 AND length(CAST("growth_report_sections"."structured_content" AS BLOB)) BETWEEN 1 AND 65536),
	CONSTRAINT "growth_report_sections_content_json_check" CHECK(json_valid("growth_report_sections"."structured_content"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `growth_report_sections_project_report_id_key` ON `growth_report_sections` (`project_id`,`report_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `growth_report_sections_project_report_type_key` ON `growth_report_sections` (`project_id`,`report_id`,`section_type`);--> statement-breakpoint
CREATE UNIQUE INDEX `growth_report_sections_project_report_position_key` ON `growth_report_sections` (`project_id`,`report_id`,`position`);--> statement-breakpoint
CREATE TABLE `growth_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`fact_hash` text NOT NULL,
	`report_type` text NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`version` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`report_timezone` text NOT NULL,
	`data_cutoff_at` text NOT NULL,
	`generated_at` text NOT NULL,
	`builder_version` text NOT NULL,
	`content_schema_version` integer NOT NULL,
	`created_by_type` text NOT NULL,
	`created_by_id` text NOT NULL,
	`published_at` text,
	`published_by_type` text,
	`published_by_id` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "growth_reports_vocabulary_check" CHECK("growth_reports"."report_type" = 'monthly' AND "growth_reports"."status" IN ('draft','published') AND "growth_reports"."created_by_type" IN ('user','agent','system') AND ("growth_reports"."published_by_type" IS NULL OR "growth_reports"."published_by_type" IN ('user','agent','system'))),
	CONSTRAINT "growth_reports_text_bounds_check" CHECK(length("growth_reports"."id") BETWEEN 1 AND 100 AND length("growth_reports"."fact_hash") = 64 AND length("growth_reports"."report_timezone") BETWEEN 1 AND 100 AND length("growth_reports"."data_cutoff_at") BETWEEN 20 AND 50 AND length("growth_reports"."generated_at") BETWEEN 20 AND 50 AND length("growth_reports"."builder_version") BETWEEN 1 AND 100 AND length("growth_reports"."created_by_id") BETWEEN 1 AND 200 AND ("growth_reports"."published_at" IS NULL OR length("growth_reports"."published_at") BETWEEN 20 AND 50) AND ("growth_reports"."published_by_id" IS NULL OR length("growth_reports"."published_by_id") BETWEEN 1 AND 200)),
	CONSTRAINT "growth_reports_version_check" CHECK(typeof("growth_reports"."version") = 'integer' AND "growth_reports"."version" > 0 AND typeof("growth_reports"."content_schema_version") = 'integer' AND "growth_reports"."content_schema_version" = 1),
	CONSTRAINT "growth_reports_period_check" CHECK(length("growth_reports"."period_start") = 10 AND length("growth_reports"."period_end") = 10 AND "growth_reports"."period_start" <= "growth_reports"."period_end" AND "growth_reports"."data_cutoff_at" <= "growth_reports"."generated_at"),
	CONSTRAINT "growth_reports_lifecycle_check" CHECK(("growth_reports"."status" = 'draft' AND "growth_reports"."published_at" IS NULL AND "growth_reports"."published_by_type" IS NULL AND "growth_reports"."published_by_id" IS NULL) OR ("growth_reports"."status" = 'published' AND "growth_reports"."published_at" IS NOT NULL AND "growth_reports"."published_at" >= "growth_reports"."generated_at" AND "growth_reports"."published_by_type" IS NOT NULL AND "growth_reports"."published_by_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `growth_reports_project_status_period_idx` ON `growth_reports` (`project_id`,`status`,`period_end`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `growth_reports_project_id_key` ON `growth_reports` (`project_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `growth_reports_family_version_key` ON `growth_reports` (`project_id`,`report_type`,`period_start`,`period_end`,`version`);