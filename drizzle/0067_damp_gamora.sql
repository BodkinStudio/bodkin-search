DROP INDEX `growth_assessment_investigation_findings_ordinal_key`;--> statement-breakpoint
ALTER TABLE `growth_assessment_investigation_findings` ADD `attempt_id` text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `growth_assessment_investigation_findings_ordinal_key` ON `growth_assessment_investigation_findings` (`project_id`,`investigation_id`,`attempt_id`,`ordinal`);--> statement-breakpoint
ALTER TABLE `growth_assessment_investigations` ADD `attempt_id` text NOT NULL;