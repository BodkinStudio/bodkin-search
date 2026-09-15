CREATE TABLE "linkedin_page_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"page_id" text NOT NULL,
	"page_name" text NOT NULL,
	"connected_by_user_id" text NOT NULL,
	"linkedin_account_id" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "linkedin_page_overview_caches" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"page_id" text NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"follower_gains" bigint,
	"page_views" bigint,
	"organic_impressions" bigint,
	"unique_impressions" bigint,
	"clicks" bigint,
	"likes" bigint,
	"comments" bigint,
	"reposts" bigint,
	"retrieved_at" text NOT NULL,
	"expires_at" text NOT NULL,
	"api_version" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "linkedin_page_connections" ADD CONSTRAINT "linkedin_page_connections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linkedin_page_connections" ADD CONSTRAINT "linkedin_page_connections_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linkedin_page_overview_caches" ADD CONSTRAINT "linkedin_page_overview_caches_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "linkedin_page_connections_project_idx" ON "linkedin_page_connections" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "linkedin_page_connections_organization_idx" ON "linkedin_page_connections" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "linkedin_page_overview_caches_period_idx" ON "linkedin_page_overview_caches" USING btree ("project_id","page_id","start_date","end_date");--> statement-breakpoint
CREATE INDEX "linkedin_page_overview_caches_retention_idx" ON "linkedin_page_overview_caches" USING btree ("retrieved_at");
