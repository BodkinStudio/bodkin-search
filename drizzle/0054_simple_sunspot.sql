PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_growth_project_settings` (
	`project_id` text PRIMARY KEY NOT NULL,
	`growth_enabled` integer DEFAULT false NOT NULL,
	`report_timezone` text DEFAULT 'UTC' NOT NULL,
	`report_cadence` text DEFAULT 'monthly' NOT NULL,
	`report_day` integer DEFAULT 1 NOT NULL,
	`next_monthly_review_at` text,
	`settings_revision` integer DEFAULT 1 NOT NULL,
	`default_baseline_days` integer DEFAULT 28 NOT NULL,
	`default_cooldown_days` integer DEFAULT 7 NOT NULL,
	`default_primary_window_days` integer DEFAULT 28 NOT NULL,
	`default_long_window_days` integer DEFAULT 55,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "growth_project_settings_report_schedule_check" CHECK(("__new_growth_project_settings"."report_cadence" = 'weekly' AND "__new_growth_project_settings"."report_day" BETWEEN 1 AND 7) OR ("__new_growth_project_settings"."report_cadence" = 'monthly' AND "__new_growth_project_settings"."report_day" BETWEEN 1 AND 28)),
	CONSTRAINT "growth_project_settings_revision_check" CHECK("__new_growth_project_settings"."settings_revision" >= 1),
	CONSTRAINT "growth_project_settings_baseline_days_check" CHECK("__new_growth_project_settings"."default_baseline_days" BETWEEN 1 AND 365),
	CONSTRAINT "growth_project_settings_cooldown_days_check" CHECK("__new_growth_project_settings"."default_cooldown_days" BETWEEN 0 AND 365),
	CONSTRAINT "growth_project_settings_primary_window_days_check" CHECK("__new_growth_project_settings"."default_primary_window_days" BETWEEN 1 AND 365),
	CONSTRAINT "growth_project_settings_long_window_days_check" CHECK("__new_growth_project_settings"."default_long_window_days" IS NULL OR "__new_growth_project_settings"."default_long_window_days" BETWEEN 1 AND 365)
);
--> statement-breakpoint
INSERT INTO `__new_growth_project_settings`("project_id", "growth_enabled", "report_timezone", "report_cadence", "report_day", "next_monthly_review_at", "settings_revision", "default_baseline_days", "default_cooldown_days", "default_primary_window_days", "default_long_window_days", "created_at", "updated_at") SELECT "project_id", "growth_enabled", "report_timezone", "report_cadence", "report_day", "next_monthly_review_at", 1, "default_baseline_days", "default_cooldown_days", "default_primary_window_days", "default_long_window_days", "created_at", "updated_at" FROM `growth_project_settings`;--> statement-breakpoint
DROP TABLE `growth_project_settings`;--> statement-breakpoint
ALTER TABLE `__new_growth_project_settings` RENAME TO `growth_project_settings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `growth_project_settings_monthly_due_idx` ON `growth_project_settings` (`growth_enabled`,`report_cadence`,`next_monthly_review_at`,`project_id`);
