CREATE TABLE "analytics_daily_aggregates" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"environment" text NOT NULL,
	"day" text NOT NULL,
	"metric" text NOT NULL,
	"currency" text DEFAULT '' NOT NULL,
	"value" integer NOT NULL,
	CONSTRAINT "analytics_daily_aggregate_dimension" UNIQUE("project_id","environment","day","metric","currency")
);
--> statement-breakpoint
CREATE TABLE "analytics_erasure_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"identity_key" text NOT NULL,
	"erased_at" text NOT NULL,
	CONSTRAINT "analytics_erasure_identity" UNIQUE("project_id","identity_key")
);
--> statement-breakpoint
CREATE TABLE "analytics_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"entity" text NOT NULL,
	"field" text NOT NULL,
	"previous_value" text,
	"next_value" text,
	"reason" text,
	"occurred_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_excluded_paths" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"prefix" text NOT NULL,
	CONSTRAINT "analytics_excluded_path" UNIQUE("project_id","prefix")
);
--> statement-breakpoint
CREATE TABLE "analytics_funnel_stages" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"template" text NOT NULL,
	"position" integer NOT NULL,
	"label" text NOT NULL,
	"event" text NOT NULL,
	"action" text,
	"instrumented" boolean DEFAULT false NOT NULL,
	CONSTRAINT "analytics_funnel_stage_position" UNIQUE("project_id","template","position")
);
--> statement-breakpoint
CREATE TABLE "analytics_reporting_settings" (
	"project_id" text PRIMARY KEY NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"completion_window_days" integer DEFAULT 7 NOT NULL,
	"onboarding_event" text DEFAULT 'activation_achieved' NOT NULL,
	"onboarding_instrumented" boolean DEFAULT false NOT NULL,
	"onboarding_wait_days" integer DEFAULT 7 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analytics_settings" ADD COLUMN "customer_retention_days" integer DEFAULT 395 NOT NULL;--> statement-breakpoint
ALTER TABLE "analytics_daily_aggregates" ADD CONSTRAINT "analytics_daily_aggregates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_erasure_keys" ADD CONSTRAINT "analytics_erasure_keys_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_audit" ADD CONSTRAINT "analytics_audit_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_excluded_paths" ADD CONSTRAINT "analytics_excluded_paths_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_funnel_stages" ADD CONSTRAINT "analytics_funnel_stages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_reporting_settings" ADD CONSTRAINT "analytics_reporting_settings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytics_audit_project_time" ON "analytics_audit" USING btree ("project_id","occurred_at");