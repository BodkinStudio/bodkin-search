CREATE TABLE `growth_evidence_points` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`series_id` text NOT NULL,
	`position` integer NOT NULL,
	`label` text NOT NULL,
	`group_label` text,
	`value` real,
	FOREIGN KEY (`project_id`,`series_id`) REFERENCES `growth_evidence_series`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "growth_evidence_points_text_check" CHECK(length("growth_evidence_points"."label") BETWEEN 1 AND 100 AND ("growth_evidence_points"."group_label" IS NULL OR length("growth_evidence_points"."group_label") BETWEEN 1 AND 100)),
	CONSTRAINT "growth_evidence_points_shape_check" CHECK(typeof("growth_evidence_points"."position") = 'integer' AND "growth_evidence_points"."position" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `growth_evidence_points_position_key` ON `growth_evidence_points` (`project_id`,`series_id`,`position`);--> statement-breakpoint
CREATE TABLE `growth_evidence_series` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`evidence_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`unit` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`,`evidence_id`) REFERENCES `growth_action_evidence`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "growth_evidence_series_text_check" CHECK(length("growth_evidence_series"."title") BETWEEN 1 AND 200 AND length("growth_evidence_series"."unit") BETWEEN 1 AND 50),
	CONSTRAINT "growth_evidence_series_shape_check" CHECK("growth_evidence_series"."kind" IN ('monthly','bars','matrix'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `growth_evidence_series_project_id_key` ON `growth_evidence_series` (`project_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `growth_evidence_series_evidence_key` ON `growth_evidence_series` (`project_id`,`evidence_id`);