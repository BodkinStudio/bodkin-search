PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_analytics_outcomes` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`environment` text NOT NULL,
	`issuer` text NOT NULL,
	`external_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`context_id` text,
	`name` text NOT NULL,
	`occurred_at` text NOT NULL,
	`amount_minor` integer,
	`refunded_minor` integer DEFAULT 0 NOT NULL,
	`currency` text,
	`payment_id` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "analytics_refund_within_payment" CHECK("__new_analytics_outcomes"."refunded_minor" >= 0 AND ("__new_analytics_outcomes"."amount_minor" IS NULL OR "__new_analytics_outcomes"."refunded_minor" <= "__new_analytics_outcomes"."amount_minor"))
);
--> statement-breakpoint
INSERT INTO `__new_analytics_outcomes`("id", "project_id", "environment", "issuer", "external_id", "customer_id", "context_id", "name", "occurred_at", "amount_minor", "refunded_minor", "currency", "payment_id") SELECT "id", "project_id", "environment", "issuer", "external_id", "customer_id", "context_id", "name", "occurred_at", "amount_minor", 0, "currency", "payment_id" FROM `analytics_outcomes`;--> statement-breakpoint
DROP TABLE `analytics_outcomes`;--> statement-breakpoint
ALTER TABLE `__new_analytics_outcomes` RENAME TO `analytics_outcomes`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `analytics_outcomes_customer` ON `analytics_outcomes` (`project_id`,`customer_id`,`occurred_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `analytics_outcomes_outcome` ON `analytics_outcomes` (`project_id`,`environment`,`issuer`,`external_id`);