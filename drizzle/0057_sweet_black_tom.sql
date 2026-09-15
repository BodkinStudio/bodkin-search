PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_growth_monthly_cycle_operator_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`run_id` text NOT NULL,
	`request_key` text NOT NULL,
	`preparation` text NOT NULL,
	`failure` text NOT NULL,
	`duplicate_spam` text NOT NULL,
	`note` text,
	`reviewer_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`run_id`) REFERENCES `growth_runs`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "growth_monthly_cycle_operator_observations_text_bounds_check" CHECK(length("__new_growth_monthly_cycle_operator_observations"."id") BETWEEN 1 AND 100 AND length("__new_growth_monthly_cycle_operator_observations"."request_key") BETWEEN 1 AND 100 AND length("__new_growth_monthly_cycle_operator_observations"."reviewer_id") BETWEEN 1 AND 200 AND ("__new_growth_monthly_cycle_operator_observations"."note" IS NULL OR length("__new_growth_monthly_cycle_operator_observations"."note") BETWEEN 1 AND 2000)),
	CONSTRAINT "growth_monthly_cycle_operator_observations_values_check" CHECK("__new_growth_monthly_cycle_operator_observations"."preparation" IN ('not_assessed', 'none', 'minor', 'substantial') AND "__new_growth_monthly_cycle_operator_observations"."failure" IN ('not_assessed', 'none_observed', 'explained', 'unexplained') AND "__new_growth_monthly_cycle_operator_observations"."duplicate_spam" IN ('not_assessed', 'not_observed', 'observed'))
);
--> statement-breakpoint
INSERT INTO `__new_growth_monthly_cycle_operator_observations`("id", "project_id", "run_id", "request_key", "preparation", "failure", "duplicate_spam", "note", "reviewer_id", "created_at") SELECT "id", "project_id", "run_id", "request_key", "preparation", "failure", "duplicate_spam", "note", "reviewer_id", "created_at" FROM `growth_monthly_cycle_operator_observations`;--> statement-breakpoint
DROP TABLE `growth_monthly_cycle_operator_observations`;--> statement-breakpoint
ALTER TABLE `__new_growth_monthly_cycle_operator_observations` RENAME TO `growth_monthly_cycle_operator_observations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `growth_monthly_cycle_operator_observations_latest_idx` ON `growth_monthly_cycle_operator_observations` (`project_id`,`run_id`,`created_at`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `growth_monthly_cycle_operator_observations_project_request_key` ON `growth_monthly_cycle_operator_observations` (`project_id`,`request_key`);