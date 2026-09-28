CREATE TABLE "analytics_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"action" text NOT NULL,
	"destination" text NOT NULL,
	CONSTRAINT "analytics_actions_action_destination" UNIQUE("project_id","action","destination")
);
--> statement-breakpoint
CREATE TABLE "analytics_attributions" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"version" integer NOT NULL,
	"click_event_id" text,
	"method" text NOT NULL,
	"reason" text NOT NULL,
	"candidate_group_count" integer DEFAULT 0 NOT NULL,
	"elapsed_ms" integer,
	"rule_version" integer DEFAULT 1 NOT NULL,
	"created_at" text NOT NULL,
	CONSTRAINT "analytics_attributions_version" UNIQUE("customer_id","version")
);
--> statement-breakpoint
CREATE TABLE "analytics_claims" (
	"click_event_id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"project_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_contexts" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"source_id" text NOT NULL,
	"context_key" text NOT NULL,
	"environment" text NOT NULL,
	"created_at" text NOT NULL,
	"last_seen_at" text NOT NULL,
	"session_id" text NOT NULL,
	"attribution_allowed" boolean DEFAULT false NOT NULL,
	"identity_allowed" boolean DEFAULT false NOT NULL,
	"policy_version" text NOT NULL,
	"user_issuer" text,
	"user_id" text,
	"customer_id" text,
	CONSTRAINT "analytics_contexts_context" UNIQUE("project_id","source_id","context_key")
);
--> statement-breakpoint
CREATE TABLE "analytics_customers" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"environment" text NOT NULL,
	"issuer" text NOT NULL,
	"external_id" text NOT NULL,
	"first_seen_at" text NOT NULL,
	"acquired_at" text,
	"lifecycle" text DEFAULT 'identity_known' NOT NULL,
	"method" text DEFAULT 'unattributed' NOT NULL,
	"click_event_id" text,
	"context_id" text,
	"reason" text DEFAULT 'client_observation_missing' NOT NULL,
	"decision_version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "analytics_customers_customer" UNIQUE("project_id","environment","issuer","external_id")
);
--> statement-breakpoint
CREATE TABLE "analytics_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"context_id" text NOT NULL,
	"entry_event_id" text NOT NULL,
	"click_event_id" text,
	"method" text NOT NULL,
	"reason" text NOT NULL,
	"candidate_group_count" integer DEFAULT 0 NOT NULL,
	"elapsed_ms" integer,
	"created_at" text NOT NULL,
	"expires_at" text NOT NULL,
	CONSTRAINT "analytics_entries_context" UNIQUE("project_id","context_id")
);
--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"source_id" text NOT NULL,
	"environment" text NOT NULL,
	"context_id" text NOT NULL,
	"event_id" text NOT NULL,
	"session_id" text NOT NULL,
	"name" text NOT NULL,
	"occurred_at" text NOT NULL,
	"received_at" text NOT NULL,
	"sequence" integer DEFAULT 0 NOT NULL,
	"page_host" text,
	"page_path" text,
	"referrer_host" text,
	"campaign_source" text,
	"campaign_medium" text,
	"campaign_name" text,
	"action" text,
	"destination" text,
	"placement" text,
	"trust" text DEFAULT 'public' NOT NULL,
	"policy_version" text NOT NULL,
	CONSTRAINT "analytics_events_event" UNIQUE("project_id","event_id")
);
--> statement-breakpoint
CREATE TABLE "analytics_network_observations" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"environment" text NOT NULL,
	"event_id" text NOT NULL,
	"epoch" text NOT NULL,
	"network_key" text NOT NULL,
	"family" text NOT NULL,
	"observed_at" text NOT NULL,
	"expires_at" text NOT NULL,
	CONSTRAINT "analytics_network_observations_event_epoch" UNIQUE("event_id","epoch")
);
--> statement-breakpoint
CREATE TABLE "analytics_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"version" integer NOT NULL,
	"created_at" text NOT NULL,
	"delivered_at" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" text NOT NULL,
	"last_error" text,
	CONSTRAINT "analytics_outbox_delivery" UNIQUE("customer_id","version")
);
--> statement-breakpoint
CREATE TABLE "analytics_outcomes" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"environment" text NOT NULL,
	"issuer" text NOT NULL,
	"external_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"context_id" text,
	"name" text NOT NULL,
	"occurred_at" text NOT NULL,
	"amount_minor" integer,
	"currency" text,
	"payment_id" text,
	CONSTRAINT "analytics_outcomes_outcome" UNIQUE("project_id","environment","issuer","external_id")
);
--> statement-breakpoint
CREATE TABLE "analytics_settings" (
	"project_id" text PRIMARY KEY NOT NULL,
	"business_model" text DEFAULT 'organisation' NOT NULL,
	"primary_outcome" text DEFAULT 'registration_completed' NOT NULL,
	"matching_window_hours" integer DEFAULT 24 NOT NULL,
	"retention_days" integer DEFAULT 90 NOT NULL,
	"personal_access" boolean DEFAULT false NOT NULL,
	"webhook_url" text,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"public_key" text NOT NULL,
	"kind" text NOT NULL,
	"hostname" text NOT NULL,
	"environment" text DEFAULT 'production' NOT NULL,
	"destination" text DEFAULT 'product' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" text NOT NULL,
	CONSTRAINT "analytics_sources_public_key" UNIQUE("public_key"),
	CONSTRAINT "analytics_sources_host_env" UNIQUE("project_id","hostname","environment")
);
--> statement-breakpoint
CREATE TABLE "analytics_tombstones" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"source_id" text NOT NULL,
	"context_key" text NOT NULL,
	"erased_at" text NOT NULL,
	CONSTRAINT "analytics_tombstones_context" UNIQUE("project_id","source_id","context_key")
);
--> statement-breakpoint
ALTER TABLE "analytics_actions" ADD CONSTRAINT "analytics_actions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_attributions" ADD CONSTRAINT "analytics_attributions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_claims" ADD CONSTRAINT "analytics_claims_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_contexts" ADD CONSTRAINT "analytics_contexts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_customers" ADD CONSTRAINT "analytics_customers_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_entries" ADD CONSTRAINT "analytics_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_network_observations" ADD CONSTRAINT "analytics_network_observations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_outbox" ADD CONSTRAINT "analytics_outbox_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_outcomes" ADD CONSTRAINT "analytics_outcomes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_settings" ADD CONSTRAINT "analytics_settings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_sources" ADD CONSTRAINT "analytics_sources_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_tombstones" ADD CONSTRAINT "analytics_tombstones_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytics_contexts_seen" ON "analytics_contexts" USING btree ("project_id","environment","last_seen_at");--> statement-breakpoint
CREATE INDEX "analytics_events_timeline" ON "analytics_events" USING btree ("project_id","context_id","received_at","sequence");--> statement-breakpoint
CREATE INDEX "analytics_events_period" ON "analytics_events" USING btree ("project_id","environment","received_at");--> statement-breakpoint
CREATE INDEX "analytics_network_observations_lookup" ON "analytics_network_observations" USING btree ("project_id","environment","epoch","network_key","observed_at");--> statement-breakpoint
CREATE INDEX "analytics_outcomes_customer" ON "analytics_outcomes" USING btree ("project_id","customer_id","occurred_at");