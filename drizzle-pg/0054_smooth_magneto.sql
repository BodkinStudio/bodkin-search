ALTER TABLE "analytics_attributions" ADD COLUMN "source_host" text;--> statement-breakpoint
ALTER TABLE "analytics_attributions" ADD COLUMN "page_path" text;--> statement-breakpoint
ALTER TABLE "analytics_attributions" ADD COLUMN "referrer_host" text;--> statement-breakpoint
ALTER TABLE "analytics_attributions" ADD COLUMN "campaign_source" text;--> statement-breakpoint
ALTER TABLE "analytics_attributions" ADD COLUMN "campaign_medium" text;--> statement-breakpoint
ALTER TABLE "analytics_attributions" ADD COLUMN "campaign_name" text;--> statement-breakpoint
ALTER TABLE "analytics_attributions" ADD COLUMN "action" text;--> statement-breakpoint
ALTER TABLE "analytics_attributions" ADD COLUMN "destination" text;--> statement-breakpoint
ALTER TABLE "analytics_attributions" ADD COLUMN "first_touch_at" text;--> statement-breakpoint
ALTER TABLE "analytics_attributions" ADD COLUMN "first_page_path" text;--> statement-breakpoint
ALTER TABLE "analytics_attributions" ADD COLUMN "first_source" text;--> statement-breakpoint
ALTER TABLE "analytics_customers" ADD COLUMN "delivery_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "analytics_outbox" ADD COLUMN "decision_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "analytics_outbox" ADD COLUMN "kind" text DEFAULT 'acquisition' NOT NULL;--> statement-breakpoint
ALTER TABLE "analytics_outbox" ADD COLUMN "outcome_id" text;
--> statement-breakpoint
UPDATE analytics_customers SET delivery_version = decision_version;
--> statement-breakpoint
UPDATE analytics_outbox SET decision_version = version;
