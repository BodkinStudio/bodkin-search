CREATE TABLE `growth_ai_brief_caveats` (
	`project_id` text NOT NULL,
	`brief_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`content` text NOT NULL,
	FOREIGN KEY (`project_id`,`brief_id`) REFERENCES `growth_ai_briefs`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `growth_ai_brief_caveats_key` ON `growth_ai_brief_caveats` (`project_id`,`brief_id`,`ordinal`);--> statement-breakpoint
CREATE TABLE `growth_ai_brief_citation_sources` (
	`project_id` text NOT NULL,
	`brief_id` text NOT NULL,
	`citation_id` text NOT NULL,
	`label` text NOT NULL,
	`source` text NOT NULL,
	`snapshot` text,
	FOREIGN KEY (`project_id`,`brief_id`) REFERENCES `growth_ai_briefs`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `growth_ai_brief_citation_sources_key` ON `growth_ai_brief_citation_sources` (`project_id`,`brief_id`,`citation_id`);--> statement-breakpoint
CREATE TABLE `growth_ai_brief_citations` (
	`project_id` text NOT NULL,
	`brief_id` text NOT NULL,
	`claim_id` text NOT NULL,
	`citation_id` text NOT NULL,
	FOREIGN KEY (`project_id`,`brief_id`,`claim_id`) REFERENCES `growth_ai_brief_claims`(`project_id`,`brief_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`brief_id`,`citation_id`) REFERENCES `growth_ai_brief_citation_sources`(`project_id`,`brief_id`,`citation_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `growth_ai_brief_citations_key` ON `growth_ai_brief_citations` (`project_id`,`claim_id`,`citation_id`);--> statement-breakpoint
CREATE TABLE `growth_ai_brief_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`brief_id` text NOT NULL,
	`kind` text NOT NULL,
	`ordinal` integer NOT NULL,
	`statement` text NOT NULL,
	`confidence` text,
	FOREIGN KEY (`project_id`,`brief_id`) REFERENCES `growth_ai_briefs`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `growth_ai_brief_claims_project_id_key` ON `growth_ai_brief_claims` (`project_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `growth_ai_brief_claims_project_brief_id_key` ON `growth_ai_brief_claims` (`project_id`,`brief_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `growth_ai_brief_claims_key` ON `growth_ai_brief_claims` (`project_id`,`brief_id`,`kind`,`ordinal`);--> statement-breakpoint
CREATE TABLE `growth_ai_brief_steps` (
	`project_id` text NOT NULL,
	`brief_id` text NOT NULL,
	`kind` text NOT NULL,
	`ordinal` integer NOT NULL,
	`content` text NOT NULL,
	FOREIGN KEY (`project_id`,`brief_id`) REFERENCES `growth_ai_briefs`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `growth_ai_brief_steps_key` ON `growth_ai_brief_steps` (`project_id`,`brief_id`,`kind`,`ordinal`);--> statement-breakpoint
CREATE TABLE `growth_ai_briefs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`signal_id` text NOT NULL,
	`recommendation_id` text NOT NULL,
	`template_version` text NOT NULL,
	`model` text NOT NULL,
	`prompt_version` text NOT NULL,
	`generated_at` text NOT NULL,
	`affected_page_url` text,
	`current_business_context` text NOT NULL,
	`page_read_status` text NOT NULL,
	`requested_url` text,
	`resolved_url` text,
	`business_relevance` text NOT NULL,
	`title` text NOT NULL,
	`generated_measurement_approach` text NOT NULL,
	`measurement_approach` text NOT NULL,
	`proposal_write_key` text,
	`version` integer DEFAULT 0 NOT NULL,
	`approved_action_id` text,
	`approved_version` integer,
	`approved_due_on` text,
	`approved_at` text,
	`approved_actor_id` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`signal_id`) REFERENCES `growth_signals`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`recommendation_id`) REFERENCES `growth_recommendations`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`approved_action_id`) REFERENCES `growth_actions`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "growth_ai_briefs_approval_check" CHECK(("growth_ai_briefs"."approved_action_id" IS NULL AND "growth_ai_briefs"."approved_version" IS NULL AND "growth_ai_briefs"."approved_due_on" IS NULL AND "growth_ai_briefs"."approved_at" IS NULL AND "growth_ai_briefs"."approved_actor_id" IS NULL) OR ("growth_ai_briefs"."approved_action_id" IS NOT NULL AND "growth_ai_briefs"."approved_version" IS NOT NULL AND "growth_ai_briefs"."approved_due_on" IS NOT NULL AND "growth_ai_briefs"."approved_at" IS NOT NULL AND "growth_ai_briefs"."approved_actor_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `growth_ai_briefs_project_id_key` ON `growth_ai_briefs` (`project_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `growth_ai_briefs_project_signal_key` ON `growth_ai_briefs` (`project_id`,`signal_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `growth_signals_project_id_key` ON `growth_signals` (`project_id`,`id`);