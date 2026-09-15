CREATE TABLE `growth_assessment_investigation_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`investigation_id` text NOT NULL,
	`attempt_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`source` text NOT NULL,
	`title` text NOT NULL,
	`evidence_text` text NOT NULL,
	`source_url` text,
	`observed_at` text NOT NULL,
	`scope` text NOT NULL,
	FOREIGN KEY (`project_id`,`investigation_id`) REFERENCES `growth_assessment_investigations`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `growth_assessment_investigation_evidence_project_id_key` ON `growth_assessment_investigation_evidence` (`project_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `growth_assessment_investigation_evidence_ordinal_key` ON `growth_assessment_investigation_evidence` (`project_id`,`investigation_id`,`attempt_id`,`ordinal`);--> statement-breakpoint
ALTER TABLE `growth_assessment_investigations` ADD `decision_verdict` text;--> statement-breakpoint
ALTER TABLE `growth_assessment_investigations` ADD `decision_headline` text;--> statement-breakpoint
ALTER TABLE `growth_assessment_investigations` ADD `decision_why_this_page` text;--> statement-breakpoint
ALTER TABLE `growth_assessment_investigations` ADD `decision_rationale` text;--> statement-breakpoint
ALTER TABLE `growth_assessment_investigations` ADD `decision_next_action` text;--> statement-breakpoint
ALTER TABLE `growth_assessment_investigations` ADD `decision_expected_outcome` text;--> statement-breakpoint
ALTER TABLE `growth_assessment_investigations` ADD `decision_measurement` text;--> statement-breakpoint
ALTER TABLE `growth_assessment_investigations` ADD `decision_caveat` text;