CREATE TABLE `growth_workstreams` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`creation_key` text,
	`position` integer NOT NULL,
	`title` text NOT NULL,
	`commercial_reason` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`target_label` text,
	`target_baseline` real,
	`target_value` real,
	`target_due_on` text,
	`updated_by` text DEFAULT 'user' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "growth_workstreams_text_check" CHECK(length("growth_workstreams"."title") BETWEEN 1 AND 200 AND length("growth_workstreams"."commercial_reason") BETWEEN 1 AND 2000 AND ("growth_workstreams"."creation_key" IS NULL OR length("growth_workstreams"."creation_key") BETWEEN 1 AND 200) AND ("growth_workstreams"."target_label" IS NULL OR length("growth_workstreams"."target_label") BETWEEN 1 AND 300) AND ("growth_workstreams"."target_due_on" IS NULL OR length("growth_workstreams"."target_due_on") = 10)),
	CONSTRAINT "growth_workstreams_shape_check" CHECK("growth_workstreams"."status" IN ('active','done','dropped') AND "growth_workstreams"."updated_by" IN ('user','agent','system') AND typeof("growth_workstreams"."position") = 'integer' AND "growth_workstreams"."position" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `growth_workstreams_project_id_key` ON `growth_workstreams` (`project_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `growth_workstreams_project_creation_key` ON `growth_workstreams` (`project_id`,`creation_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `growth_workstreams_project_position_key` ON `growth_workstreams` (`project_id`,`position`);--> statement-breakpoint
CREATE TABLE `growth_action_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`action_id` text NOT NULL,
	`kind` text NOT NULL,
	`statement` text NOT NULL,
	`source_label` text NOT NULL,
	`source_url` text,
	`observed_on` text,
	`position` integer NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`,`action_id`) REFERENCES `growth_actions`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "growth_action_evidence_text_check" CHECK(length("growth_action_evidence"."statement") BETWEEN 1 AND 1000 AND length("growth_action_evidence"."source_label") BETWEEN 1 AND 200 AND ("growth_action_evidence"."source_url" IS NULL OR length("growth_action_evidence"."source_url") BETWEEN 1 AND 2000) AND ("growth_action_evidence"."observed_on" IS NULL OR length("growth_action_evidence"."observed_on") = 10)),
	CONSTRAINT "growth_action_evidence_shape_check" CHECK("growth_action_evidence"."kind" IN ('measured','sampled','estimate','judgement','reference') AND typeof("growth_action_evidence"."position") = 'integer' AND "growth_action_evidence"."position" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `growth_action_evidence_project_id_key` ON `growth_action_evidence` (`project_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `growth_action_evidence_position_key` ON `growth_action_evidence` (`project_id`,`action_id`,`position`);--> statement-breakpoint
ALTER TABLE `growth_actions` ADD `workstream_id` text;--> statement-breakpoint
ALTER TABLE `growth_actions` ADD `workstream_position` integer;--> statement-breakpoint
ALTER TABLE `growth_actions` ADD `rationale` text;--> statement-breakpoint
ALTER TABLE `growth_actions` ADD `success_measure` text;