CREATE TABLE `growth_measurement_metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`measurement_plan_id` text NOT NULL,
	`metric_type` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_key` text NOT NULL,
	`is_primary` integer NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`,`measurement_plan_id`) REFERENCES `growth_measurement_plans`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "growth_measurement_metrics_vocabulary_check" CHECK("growth_measurement_metrics"."metric_type" IN ('search_clicks','search_impressions','search_ctr','search_average_position','organic_sessions','organic_active_users','organic_engagement_rate','organic_key_events','backlink_count','referring_domain_count','audit_issue_page_count') AND "growth_measurement_metrics"."entity_type" IN ('site','url','keyword','cluster')),
	CONSTRAINT "growth_measurement_metrics_text_bounds_check" CHECK(length("growth_measurement_metrics"."id") BETWEEN 1 AND 100 AND length("growth_measurement_metrics"."measurement_plan_id") BETWEEN 1 AND 100 AND length("growth_measurement_metrics"."entity_key") BETWEEN 1 AND 2000),
	CONSTRAINT "growth_measurement_metrics_primary_check" CHECK(typeof("growth_measurement_metrics"."is_primary") = 'integer' AND "growth_measurement_metrics"."is_primary" IN (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `growth_measurement_metrics_project_plan_id_key` ON `growth_measurement_metrics` (`project_id`,`measurement_plan_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `growth_measurement_metrics_semantic_key` ON `growth_measurement_metrics` (`project_id`,`measurement_plan_id`,`metric_type`,`entity_type`,`entity_key`);--> statement-breakpoint
CREATE TABLE `growth_measurement_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`measurement_plan_id` text NOT NULL,
	`metric_id` text NOT NULL,
	`period_type` text NOT NULL,
	`fact_hash` text NOT NULL,
	`effective_start` text NOT NULL,
	`effective_end` text NOT NULL,
	`value` real NOT NULL,
	`completeness` real NOT NULL,
	`evidence_kind` text NOT NULL,
	`evidence_ref` text NOT NULL,
	`captured_at` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`,`measurement_plan_id`,`metric_id`) REFERENCES `growth_measurement_metrics`(`project_id`,`measurement_plan_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "growth_measurement_observations_vocabulary_check" CHECK("growth_measurement_observations"."period_type" IN ('baseline','measurement','long_term') AND "growth_measurement_observations"."evidence_kind" IN ('gsc_period','ga4_period','rank_snapshot','audit_result','backlink_snapshot','manual_observation')),
	CONSTRAINT "growth_measurement_observations_text_bounds_check" CHECK(length("growth_measurement_observations"."id") BETWEEN 1 AND 100 AND length("growth_measurement_observations"."measurement_plan_id") BETWEEN 1 AND 100 AND length("growth_measurement_observations"."metric_id") BETWEEN 1 AND 100 AND length("growth_measurement_observations"."fact_hash") = 64 AND length("growth_measurement_observations"."evidence_ref") BETWEEN 1 AND 500 AND length("growth_measurement_observations"."captured_at") BETWEEN 20 AND 50),
	CONSTRAINT "growth_measurement_observations_dates_check" CHECK(length("growth_measurement_observations"."effective_start") = 10 AND length("growth_measurement_observations"."effective_end") = 10 AND "growth_measurement_observations"."effective_start" <= "growth_measurement_observations"."effective_end"),
	CONSTRAINT "growth_measurement_observations_value_check" CHECK(typeof("growth_measurement_observations"."value") IN ('integer','real') AND "growth_measurement_observations"."value" > -1e999 AND "growth_measurement_observations"."value" < 1e999),
	CONSTRAINT "growth_measurement_observations_completeness_check" CHECK(typeof("growth_measurement_observations"."completeness") IN ('integer','real') AND "growth_measurement_observations"."completeness" BETWEEN 0 AND 1)
);
--> statement-breakpoint
CREATE INDEX `growth_measurement_observations_project_plan_idx` ON `growth_measurement_observations` (`project_id`,`measurement_plan_id`,`captured_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `growth_measurement_observations_coordinate_key` ON `growth_measurement_observations` (`project_id`,`measurement_plan_id`,`metric_id`,`period_type`);--> statement-breakpoint
CREATE TABLE `growth_measurement_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`action_id` text NOT NULL,
	`fact_hash` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`action_version` integer NOT NULL,
	`anchor_at` text NOT NULL,
	`anchor_date` text NOT NULL,
	`report_timezone` text NOT NULL,
	`baseline_start` text NOT NULL,
	`baseline_end` text NOT NULL,
	`cooldown_end` text NOT NULL,
	`measurement_start` text NOT NULL,
	`measurement_end` text NOT NULL,
	`long_measurement_end` text,
	`comparison_mode` text NOT NULL,
	`completed_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`action_id`) REFERENCES `growth_actions`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "growth_measurement_plans_vocabulary_check" CHECK("growth_measurement_plans"."status" IN ('active','completed') AND "growth_measurement_plans"."comparison_mode" IN ('preceding_period','year_over_year','custom')),
	CONSTRAINT "growth_measurement_plans_text_bounds_check" CHECK(length("growth_measurement_plans"."id") BETWEEN 1 AND 100 AND length("growth_measurement_plans"."action_id") BETWEEN 1 AND 100 AND length("growth_measurement_plans"."fact_hash") = 64 AND length("growth_measurement_plans"."report_timezone") BETWEEN 1 AND 100 AND length("growth_measurement_plans"."anchor_at") BETWEEN 20 AND 50 AND ("growth_measurement_plans"."completed_at" IS NULL OR length("growth_measurement_plans"."completed_at") BETWEEN 20 AND 50)),
	CONSTRAINT "growth_measurement_plans_action_version_check" CHECK(typeof("growth_measurement_plans"."action_version") = 'integer' AND "growth_measurement_plans"."action_version" > 0),
	CONSTRAINT "growth_measurement_plans_dates_check" CHECK(length("growth_measurement_plans"."anchor_date") = 10 AND length("growth_measurement_plans"."baseline_start") = 10 AND length("growth_measurement_plans"."baseline_end") = 10 AND length("growth_measurement_plans"."cooldown_end") = 10 AND length("growth_measurement_plans"."measurement_start") = 10 AND length("growth_measurement_plans"."measurement_end") = 10 AND ("growth_measurement_plans"."long_measurement_end" IS NULL OR length("growth_measurement_plans"."long_measurement_end") = 10) AND "growth_measurement_plans"."baseline_start" <= "growth_measurement_plans"."baseline_end" AND "growth_measurement_plans"."baseline_end" < "growth_measurement_plans"."anchor_date" AND "growth_measurement_plans"."anchor_date" <= "growth_measurement_plans"."cooldown_end" AND "growth_measurement_plans"."cooldown_end" < "growth_measurement_plans"."measurement_start" AND "growth_measurement_plans"."measurement_start" <= "growth_measurement_plans"."measurement_end" AND ("growth_measurement_plans"."long_measurement_end" IS NULL OR "growth_measurement_plans"."measurement_end" < "growth_measurement_plans"."long_measurement_end")),
	CONSTRAINT "growth_measurement_plans_lifecycle_check" CHECK(("growth_measurement_plans"."status" = 'active' AND "growth_measurement_plans"."completed_at" IS NULL) OR ("growth_measurement_plans"."status" = 'completed' AND "growth_measurement_plans"."completed_at" IS NOT NULL AND "growth_measurement_plans"."completed_at" >= "growth_measurement_plans"."anchor_at"))
);
--> statement-breakpoint
CREATE INDEX `growth_measurement_plans_project_status_due_idx` ON `growth_measurement_plans` (`project_id`,`status`,`long_measurement_end`,`measurement_end`);--> statement-breakpoint
CREATE UNIQUE INDEX `growth_measurement_plans_project_id_key` ON `growth_measurement_plans` (`project_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `growth_measurement_plans_project_action_key` ON `growth_measurement_plans` (`project_id`,`action_id`);--> statement-breakpoint
CREATE TABLE `growth_measurement_result_changes` (
	`project_id` text NOT NULL,
	`measurement_result_id` text NOT NULL,
	`change_event_id` text NOT NULL,
	FOREIGN KEY (`project_id`,`measurement_result_id`) REFERENCES `growth_measurement_results`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`change_event_id`) REFERENCES `growth_change_events`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "growth_measurement_result_changes_text_bounds_check" CHECK(length("growth_measurement_result_changes"."measurement_result_id") BETWEEN 1 AND 100 AND length("growth_measurement_result_changes"."change_event_id") BETWEEN 1 AND 100)
);
--> statement-breakpoint
CREATE INDEX `growth_measurement_result_changes_project_event_idx` ON `growth_measurement_result_changes` (`project_id`,`change_event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `growth_measurement_result_changes_key` ON `growth_measurement_result_changes` (`project_id`,`measurement_result_id`,`change_event_id`);--> statement-breakpoint
CREATE TABLE `growth_measurement_results` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`measurement_plan_id` text NOT NULL,
	`fact_hash` text NOT NULL,
	`observations_hash` text NOT NULL,
	`outcome` text NOT NULL,
	`confidence` real NOT NULL,
	`summary` text NOT NULL,
	`evaluated_at` text NOT NULL,
	`model` text,
	`prompt_version` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`,`measurement_plan_id`) REFERENCES `growth_measurement_plans`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "growth_measurement_results_vocabulary_check" CHECK("growth_measurement_results"."outcome" IN ('strong_positive','positive','inconclusive','neutral','negative','strong_negative','not_measurable')),
	CONSTRAINT "growth_measurement_results_text_bounds_check" CHECK(length("growth_measurement_results"."id") BETWEEN 1 AND 100 AND length("growth_measurement_results"."measurement_plan_id") BETWEEN 1 AND 100 AND length("growth_measurement_results"."fact_hash") = 64 AND length("growth_measurement_results"."observations_hash") = 64 AND length("growth_measurement_results"."summary") BETWEEN 1 AND 5000 AND length("growth_measurement_results"."evaluated_at") BETWEEN 20 AND 50 AND ("growth_measurement_results"."model" IS NULL OR length("growth_measurement_results"."model") BETWEEN 1 AND 200) AND ("growth_measurement_results"."prompt_version" IS NULL OR length("growth_measurement_results"."prompt_version") BETWEEN 1 AND 100)),
	CONSTRAINT "growth_measurement_results_confidence_check" CHECK(typeof("growth_measurement_results"."confidence") IN ('integer','real') AND "growth_measurement_results"."confidence" BETWEEN 0 AND 1),
	CONSTRAINT "growth_measurement_results_model_prompt_check" CHECK(("growth_measurement_results"."model" IS NULL AND "growth_measurement_results"."prompt_version" IS NULL) OR ("growth_measurement_results"."model" IS NOT NULL AND "growth_measurement_results"."prompt_version" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `growth_measurement_results_project_id_key` ON `growth_measurement_results` (`project_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `growth_measurement_results_project_plan_key` ON `growth_measurement_results` (`project_id`,`measurement_plan_id`);