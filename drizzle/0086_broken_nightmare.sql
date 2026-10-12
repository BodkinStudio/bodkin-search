CREATE TABLE `analytics_clarity_connections` (
	`project_id` text PRIMARY KEY NOT NULL,
	`clarity_project_id` text NOT NULL,
	`encrypted_token` text NOT NULL,
	`connected_by_user_id` text NOT NULL,
	`last_synced_at` text,
	`last_sync_error` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `analytics_clarity_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`day` text NOT NULL,
	`page_path` text NOT NULL,
	`sessions` integer NOT NULL,
	`bot_sessions` integer,
	`scroll_depth` real,
	`active_time` real,
	`dead_click_pct` real,
	`rage_click_pct` real,
	`quick_back_pct` real,
	`excessive_scroll_pct` real,
	`error_click_pct` real,
	`script_error_pct` real,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `analytics_clarity_page_day` ON `analytics_clarity_pages` (`project_id`,`day`,`page_path`);