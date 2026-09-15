CREATE TABLE `growth_assessment_investigation_findings` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`investigation_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`title` text NOT NULL,
	`why_it_matters` text NOT NULL,
	`evidence` text NOT NULL,
	`source_url` text NOT NULL,
	`observed_at` text NOT NULL,
	`recommended_next_step` text NOT NULL,
	`unverified` text NOT NULL,
	FOREIGN KEY (`project_id`,`investigation_id`) REFERENCES `growth_assessment_investigations`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `growth_assessment_investigation_findings_project_id_key` ON `growth_assessment_investigation_findings` (`project_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `growth_assessment_investigation_findings_ordinal_key` ON `growth_assessment_investigation_findings` (`project_id`,`investigation_id`,`ordinal`);--> statement-breakpoint
CREATE TABLE `growth_assessment_investigations` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`assessment_id` text NOT NULL,
	`assessment_version` integer NOT NULL,
	`status` text NOT NULL,
	`page_status` text NOT NULL,
	`analytics_status` text NOT NULL,
	`findings_status` text NOT NULL,
	`source_url` text,
	`source_title` text,
	`source_observed_at` text,
	`started_at` text NOT NULL,
	`completed_at` text,
	`failed_at` text,
	`stale_after` text NOT NULL,
	`failure_message` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`assessment_id`) REFERENCES `growth_assessments`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `growth_assessment_investigations_project_assessment_key` ON `growth_assessment_investigations` (`project_id`,`assessment_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `growth_assessment_investigations_project_id_key` ON `growth_assessment_investigations` (`project_id`,`id`);