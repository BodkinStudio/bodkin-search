CREATE TABLE "growth_project_settings" (
	"project_id" text PRIMARY KEY NOT NULL,
	"growth_enabled" boolean DEFAULT false NOT NULL,
	"report_timezone" text DEFAULT 'UTC' NOT NULL,
	"report_cadence" text DEFAULT 'monthly' NOT NULL,
	"report_day" integer DEFAULT 1 NOT NULL,
	"default_baseline_days" integer DEFAULT 28 NOT NULL,
	"default_cooldown_days" integer DEFAULT 7 NOT NULL,
	"default_primary_window_days" integer DEFAULT 28 NOT NULL,
	"default_long_window_days" integer DEFAULT 55,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	CONSTRAINT "growth_project_settings_report_schedule_check" CHECK (("growth_project_settings"."report_cadence" = 'weekly' AND "growth_project_settings"."report_day" BETWEEN 1 AND 7) OR ("growth_project_settings"."report_cadence" = 'monthly' AND "growth_project_settings"."report_day" BETWEEN 1 AND 28)),
	CONSTRAINT "growth_project_settings_baseline_days_check" CHECK ("growth_project_settings"."default_baseline_days" BETWEEN 1 AND 365),
	CONSTRAINT "growth_project_settings_cooldown_days_check" CHECK ("growth_project_settings"."default_cooldown_days" BETWEEN 0 AND 365),
	CONSTRAINT "growth_project_settings_primary_window_days_check" CHECK ("growth_project_settings"."default_primary_window_days" BETWEEN 1 AND 365),
	CONSTRAINT "growth_project_settings_long_window_days_check" CHECK ("growth_project_settings"."default_long_window_days" IS NULL OR "growth_project_settings"."default_long_window_days" BETWEEN 1 AND 365)
);
--> statement-breakpoint
ALTER TABLE "project_key_pages" ADD COLUMN "commercial_weight" integer;--> statement-breakpoint
ALTER TABLE "project_key_pages" ADD COLUMN "protected" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "project_key_pages" ADD COLUMN "actively_optimized" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "growth_project_settings" ADD CONSTRAINT "growth_project_settings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_key_pages" ADD CONSTRAINT "project_key_pages_commercial_weight_check" CHECK ("project_key_pages"."commercial_weight" IS NULL OR "project_key_pages"."commercial_weight" BETWEEN 1 AND 5);