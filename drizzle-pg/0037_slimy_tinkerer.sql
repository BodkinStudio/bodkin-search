CREATE TABLE "linkedin_page_imports" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"page_name" text NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"imported_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"row_count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "linkedin_page_post_metrics" (
	"id" text PRIMARY KEY NOT NULL,
	"import_id" text NOT NULL,
	"post_key" text NOT NULL,
	"post_url" text,
	"post_text" text,
	"published_at" text,
	"impressions" integer,
	"members_reached" integer,
	"clicks" integer,
	"reactions" integer,
	"comments" integer,
	"reposts" integer,
	"video_views" integer,
	"follows" integer,
	"provider_click_through_rate_basis_points" integer,
	"provider_engagement_rate_basis_points" integer
);
--> statement-breakpoint
ALTER TABLE "linkedin_page_imports" ADD CONSTRAINT "linkedin_page_imports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linkedin_page_post_metrics" ADD CONSTRAINT "linkedin_page_post_metrics_import_id_linkedin_page_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."linkedin_page_imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "linkedin_page_imports_project_period_idx" ON "linkedin_page_imports" USING btree ("project_id","start_date","end_date");--> statement-breakpoint
CREATE INDEX "linkedin_page_imports_project_imported_idx" ON "linkedin_page_imports" USING btree ("project_id","imported_at");--> statement-breakpoint
CREATE INDEX "linkedin_page_post_metrics_import_idx" ON "linkedin_page_post_metrics" USING btree ("import_id");--> statement-breakpoint
CREATE UNIQUE INDEX "linkedin_page_post_metrics_import_post_key_idx" ON "linkedin_page_post_metrics" USING btree ("import_id","post_key");