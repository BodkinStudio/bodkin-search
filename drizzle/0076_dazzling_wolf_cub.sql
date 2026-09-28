ALTER TABLE `analytics_attributions` ADD `source_host` text;--> statement-breakpoint
ALTER TABLE `analytics_attributions` ADD `page_path` text;--> statement-breakpoint
ALTER TABLE `analytics_attributions` ADD `referrer_host` text;--> statement-breakpoint
ALTER TABLE `analytics_attributions` ADD `campaign_source` text;--> statement-breakpoint
ALTER TABLE `analytics_attributions` ADD `campaign_medium` text;--> statement-breakpoint
ALTER TABLE `analytics_attributions` ADD `campaign_name` text;--> statement-breakpoint
ALTER TABLE `analytics_attributions` ADD `action` text;--> statement-breakpoint
ALTER TABLE `analytics_attributions` ADD `destination` text;--> statement-breakpoint
ALTER TABLE `analytics_attributions` ADD `first_touch_at` text;--> statement-breakpoint
ALTER TABLE `analytics_attributions` ADD `first_page_path` text;--> statement-breakpoint
ALTER TABLE `analytics_attributions` ADD `first_source` text;--> statement-breakpoint
ALTER TABLE `analytics_customers` ADD `delivery_version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `analytics_outbox` ADD `decision_version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `analytics_outbox` ADD `kind` text DEFAULT 'acquisition' NOT NULL;--> statement-breakpoint
ALTER TABLE `analytics_outbox` ADD `outcome_id` text;
--> statement-breakpoint
UPDATE analytics_customers SET delivery_version = decision_version;
--> statement-breakpoint
UPDATE analytics_outbox SET decision_version = version;
