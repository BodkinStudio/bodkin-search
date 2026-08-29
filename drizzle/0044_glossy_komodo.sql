CREATE TABLE `growth_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`run_type` text NOT NULL,
	`trigger` text NOT NULL,
	`status` text NOT NULL,
	`cadence_slot` text NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text,
	`detector_version` text NOT NULL,
	`analysis_version` text,
	`model` text,
	`prompt_version` text,
	`provider_cost_minor` integer,
	`failure_code` text,
	`failure_message` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "growth_runs_period_check" CHECK("growth_runs"."period_start" <= "growth_runs"."period_end" AND length("growth_runs"."period_start") = 10 AND length("growth_runs"."period_end") = 10),
	CONSTRAINT "growth_runs_vocabulary_check" CHECK("growth_runs"."run_type" IN ('daily_monitor', 'weekly_review', 'monthly_review', 'measurement_review', 'manual_analysis') AND "growth_runs"."trigger" IN ('manual', 'scheduled') AND "growth_runs"."status" IN ('running', 'completed', 'completed_with_errors', 'failed')),
	CONSTRAINT "growth_runs_provider_cost_check" CHECK("growth_runs"."provider_cost_minor" IS NULL OR (typeof("growth_runs"."provider_cost_minor") = 'integer' AND "growth_runs"."provider_cost_minor" >= 0)),
	CONSTRAINT "growth_runs_failure_check" CHECK(("growth_runs"."status" = 'running' AND "growth_runs"."completed_at" IS NULL AND "growth_runs"."failure_code" IS NULL AND "growth_runs"."failure_message" IS NULL) OR ("growth_runs"."status" = 'completed' AND "growth_runs"."completed_at" IS NOT NULL AND "growth_runs"."failure_code" IS NULL AND "growth_runs"."failure_message" IS NULL) OR ("growth_runs"."status" IN ('completed_with_errors', 'failed') AND "growth_runs"."completed_at" IS NOT NULL AND length("growth_runs"."failure_code") BETWEEN 1 AND 100 AND length("growth_runs"."failure_message") BETWEEN 1 AND 1000)),
	CONSTRAINT "growth_runs_completion_time_check" CHECK("growth_runs"."completed_at" IS NULL OR "growth_runs"."completed_at" >= "growth_runs"."started_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `growth_runs_project_type_slot_idx` ON `growth_runs` (`project_id`,`run_type`,`cadence_slot`);--> statement-breakpoint
CREATE INDEX `growth_runs_project_started_idx` ON `growth_runs` (`project_id`,`started_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `growth_runs_project_id_key` ON `growth_runs` (`project_id`,`id`);--> statement-breakpoint
CREATE TABLE `growth_signals` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`run_id` text NOT NULL,
	`signal_type` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_ref` text NOT NULL,
	`metric` text NOT NULL,
	`severity` text NOT NULL,
	`confidence` real NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`baseline_value` real NOT NULL,
	`current_value` real NOT NULL,
	`delta_value` real NOT NULL,
	`delta_percent` real,
	`evidence_kind` text NOT NULL,
	`evidence_ref` text NOT NULL,
	`captured_at` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`run_id`) REFERENCES `growth_runs`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "growth_signals_period_check" CHECK("growth_signals"."period_start" <= "growth_signals"."period_end" AND length("growth_signals"."period_start") = 10 AND length("growth_signals"."period_end") = 10),
	CONSTRAINT "growth_signals_confidence_check" CHECK("growth_signals"."confidence" BETWEEN 0 AND 1),
	CONSTRAINT "growth_signals_severity_check" CHECK("growth_signals"."severity" IN ('info', 'warning', 'critical')),
	CONSTRAINT "growth_signals_evidence_kind_check" CHECK("growth_signals"."evidence_kind" IN ('gsc_period', 'ga4_period', 'rank_snapshot', 'audit_result', 'backlink_snapshot', 'manual_observation')),
	CONSTRAINT "growth_signals_text_bounds_check" CHECK(length("growth_signals"."signal_type") BETWEEN 1 AND 100 AND length("growth_signals"."entity_type") BETWEEN 1 AND 100 AND length("growth_signals"."entity_ref") BETWEEN 1 AND 500 AND length("growth_signals"."metric") BETWEEN 1 AND 200 AND length("growth_signals"."evidence_ref") BETWEEN 1 AND 500)
);
--> statement-breakpoint
CREATE INDEX `growth_signals_project_run_created_idx` ON `growth_signals` (`project_id`,`run_id`,`created_at`);
