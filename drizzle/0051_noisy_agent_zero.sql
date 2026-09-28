CREATE TABLE `growth_measurement_plan_anchors` (
	`project_id` text NOT NULL,
	`measurement_plan_id` text NOT NULL,
	`action_id` text NOT NULL,
	`change_event_id` text NOT NULL,
	FOREIGN KEY (`project_id`,`measurement_plan_id`,`action_id`) REFERENCES `growth_measurement_plans`(`project_id`,`id`,`action_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`action_id`,`change_event_id`) REFERENCES `growth_action_changes`(`project_id`,`action_id`,`change_event_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "growth_measurement_plan_anchors_text_bounds_check" CHECK(length("growth_measurement_plan_anchors"."measurement_plan_id") BETWEEN 1 AND 100 AND length("growth_measurement_plan_anchors"."action_id") BETWEEN 1 AND 100 AND length("growth_measurement_plan_anchors"."change_event_id") BETWEEN 1 AND 100)
);
--> statement-breakpoint
CREATE INDEX `growth_measurement_plan_anchors_project_change_idx` ON `growth_measurement_plan_anchors` (`project_id`,`change_event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `growth_measurement_plan_anchors_project_plan_key` ON `growth_measurement_plan_anchors` (`project_id`,`measurement_plan_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `growth_measurement_plans_project_id_action_key` ON `growth_measurement_plans` (`project_id`,`id`,`action_id`);