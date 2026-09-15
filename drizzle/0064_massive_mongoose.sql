CREATE TABLE `growth_assessment_options` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`assessment_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`business_relevance` text NOT NULL,
	`evidence_source` text NOT NULL,
	`evidence_date` text NOT NULL,
	`evidence_scope` text NOT NULL,
	`observation` text NOT NULL,
	`uncertainty` text NOT NULL,
	`next_validation` text NOT NULL,
	`disposition` text NOT NULL,
	`key_page_id` text,
	FOREIGN KEY (`project_id`,`assessment_id`) REFERENCES `growth_assessments`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`key_page_id`) REFERENCES `project_key_pages`(`project_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `growth_assessment_options_project_id_key` ON `growth_assessment_options` (`project_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `growth_assessment_options_assessment_ordinal_key` ON `growth_assessment_options` (`project_id`,`assessment_id`,`ordinal`);--> statement-breakpoint
CREATE TABLE `growth_assessments` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`version` integer NOT NULL,
	`status` text NOT NULL,
	`objective` text NOT NULL,
	`market` text NOT NULL,
	`audience` text NOT NULL,
	`success_measure` text NOT NULL,
	`objective_confirmed` integer DEFAULT false NOT NULL,
	`comparison_rationale` text NOT NULL,
	`selected_option_id` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `growth_assessments_project_version_key` ON `growth_assessments` (`project_id`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `growth_assessments_project_id_key` ON `growth_assessments` (`project_id`,`id`);