CREATE TABLE `linkedin_page_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`page_id` text NOT NULL,
	`page_name` text NOT NULL,
	`connected_by_user_id` text NOT NULL,
	`linkedin_account_id` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `linkedin_page_connections_project_idx` ON `linkedin_page_connections` (`project_id`);--> statement-breakpoint
CREATE INDEX `linkedin_page_connections_organization_idx` ON `linkedin_page_connections` (`organization_id`);--> statement-breakpoint
CREATE TABLE `linkedin_page_overview_caches` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`page_id` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`follower_gains` integer,
	`page_views` integer,
	`organic_impressions` integer,
	`unique_impressions` integer,
	`clicks` integer,
	`likes` integer,
	`comments` integer,
	`reposts` integer,
	`retrieved_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`api_version` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `linkedin_page_overview_caches_period_idx` ON `linkedin_page_overview_caches` (`project_id`,`page_id`,`start_date`,`end_date`);--> statement-breakpoint
CREATE INDEX `linkedin_page_overview_caches_retention_idx` ON `linkedin_page_overview_caches` (`retrieved_at`);
