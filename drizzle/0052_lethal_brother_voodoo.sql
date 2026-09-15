CREATE TABLE `growth_recommendation_signal_links` (
	`project_id` text NOT NULL,
	`signal_run_id` text NOT NULL,
	`signal_id` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`recommendation_id` text NOT NULL,
	`relationship` text NOT NULL,
	`suppression_reason` text,
	`policy_version` text NOT NULL,
	`controller_released_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`signal_run_id`,`signal_id`) REFERENCES `growth_signals`(`project_id`,`run_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`recommendation_id`) REFERENCES `growth_recommendations`(`project_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "growth_recommendation_signal_links_dedupe_key_check" CHECK(length("growth_recommendation_signal_links"."dedupe_key") = 64),
	CONSTRAINT "growth_recommendation_signal_links_relationship_check" CHECK(("growth_recommendation_signal_links"."relationship" = 'controller' AND "growth_recommendation_signal_links"."suppression_reason" IS NULL) OR ("growth_recommendation_signal_links"."relationship" = 'suppressed' AND "growth_recommendation_signal_links"."suppression_reason" IS NOT NULL AND "growth_recommendation_signal_links"."suppression_reason" IN ('existing_proposal','existing_snooze','prior_dismissal','existing_action','accepted_without_action','resolved_recommendation'))),
	CONSTRAINT "growth_recommendation_signal_links_release_check" CHECK("growth_recommendation_signal_links"."controller_released_at" IS NULL OR "growth_recommendation_signal_links"."relationship" = 'controller')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `growth_recommendation_signal_links_controller_key` ON `growth_recommendation_signal_links` (`project_id`,`recommendation_id`) WHERE "growth_recommendation_signal_links"."relationship" = 'controller';--> statement-breakpoint
CREATE UNIQUE INDEX `growth_recommendation_signal_links_active_controller_key` ON `growth_recommendation_signal_links` (`project_id`,`dedupe_key`) WHERE "growth_recommendation_signal_links"."relationship" = 'controller' AND "growth_recommendation_signal_links"."controller_released_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `growth_recommendation_signal_links_signal_key` ON `growth_recommendation_signal_links` (`project_id`,`signal_run_id`,`signal_id`);
