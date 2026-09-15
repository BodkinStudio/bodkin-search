CREATE TABLE `prompt_explorer_snapshot_citations` (
	`project_id` text NOT NULL,
	`snapshot_id` text NOT NULL,
	`model` text NOT NULL,
	`ordinal` integer NOT NULL,
	`url` text NOT NULL,
	`domain` text,
	`title` text,
	`matched_brand` integer NOT NULL,
	FOREIGN KEY (`project_id`,`snapshot_id`,`model`) REFERENCES `prompt_explorer_snapshot_models`(`project_id`,`snapshot_id`,`model`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prompt_explorer_snapshot_citations_key` ON `prompt_explorer_snapshot_citations` (`project_id`,`snapshot_id`,`model`,`ordinal`);--> statement-breakpoint
CREATE TABLE `prompt_explorer_snapshot_fan_out_queries` (
	`project_id` text NOT NULL,
	`snapshot_id` text NOT NULL,
	`model` text NOT NULL,
	`ordinal` integer NOT NULL,
	`query` text NOT NULL,
	FOREIGN KEY (`project_id`,`snapshot_id`,`model`) REFERENCES `prompt_explorer_snapshot_models`(`project_id`,`snapshot_id`,`model`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prompt_explorer_snapshot_fan_out_queries_key` ON `prompt_explorer_snapshot_fan_out_queries` (`project_id`,`snapshot_id`,`model`,`ordinal`);--> statement-breakpoint
CREATE TABLE `prompt_explorer_snapshot_models` (
	`project_id` text NOT NULL,
	`snapshot_id` text NOT NULL,
	`model` text NOT NULL,
	`status` text NOT NULL,
	`model_name` text,
	`answer` text,
	`error_code` text,
	`error_message` text,
	`output_tokens` integer,
	`response_web_search` integer,
	`brand_mentioned` integer,
	`cache_source` text NOT NULL,
	`generated_at` text,
	FOREIGN KEY (`project_id`,`snapshot_id`) REFERENCES `prompt_explorer_snapshots`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prompt_explorer_snapshot_models_key` ON `prompt_explorer_snapshot_models` (`project_id`,`snapshot_id`,`model`);--> statement-breakpoint
CREATE TABLE `prompt_explorer_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`prompt` text NOT NULL,
	`highlight_brand` text,
	`web_search` integer NOT NULL,
	`web_search_country_code` text,
	`captured_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prompt_explorer_snapshots_project_id_key` ON `prompt_explorer_snapshots` (`project_id`,`id`);