CREATE TABLE `linkedin_page_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`page_name` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`imported_at` text DEFAULT (current_timestamp) NOT NULL,
	`row_count` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `linkedin_page_imports_project_period_idx` ON `linkedin_page_imports` (`project_id`,`start_date`,`end_date`);--> statement-breakpoint
CREATE INDEX `linkedin_page_imports_project_imported_idx` ON `linkedin_page_imports` (`project_id`,`imported_at`);--> statement-breakpoint
CREATE TABLE `linkedin_page_post_metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`import_id` text NOT NULL,
	`post_key` text NOT NULL,
	`post_url` text,
	`post_text` text,
	`published_at` text,
	`impressions` integer,
	`members_reached` integer,
	`clicks` integer,
	`reactions` integer,
	`comments` integer,
	`reposts` integer,
	`video_views` integer,
	`follows` integer,
	`provider_click_through_rate_basis_points` integer,
	`provider_engagement_rate_basis_points` integer,
	FOREIGN KEY (`import_id`) REFERENCES `linkedin_page_imports`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `linkedin_page_post_metrics_import_idx` ON `linkedin_page_post_metrics` (`import_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `linkedin_page_post_metrics_import_post_key_idx` ON `linkedin_page_post_metrics` (`import_id`,`post_key`);