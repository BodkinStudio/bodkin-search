CREATE TABLE "growth_assessment_investigation_findings" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"investigation_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"title" text NOT NULL,
	"why_it_matters" text NOT NULL,
	"evidence" text NOT NULL,
	"source_url" text NOT NULL,
	"observed_at" text NOT NULL,
	"recommended_next_step" text NOT NULL,
	"unverified" text NOT NULL,
	CONSTRAINT "growth_assessment_investigation_findings_project_id_key" UNIQUE("project_id","id"),
	CONSTRAINT "growth_assessment_investigation_findings_ordinal_key" UNIQUE("project_id","investigation_id","ordinal")
);
--> statement-breakpoint
CREATE TABLE "growth_assessment_investigations" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"assessment_id" text NOT NULL,
	"assessment_version" integer NOT NULL,
	"status" text NOT NULL,
	"page_status" text NOT NULL,
	"analytics_status" text NOT NULL,
	"findings_status" text NOT NULL,
	"source_url" text,
	"source_title" text,
	"source_observed_at" text,
	"started_at" text NOT NULL,
	"completed_at" text,
	"failed_at" text,
	"stale_after" text NOT NULL,
	"failure_message" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	CONSTRAINT "growth_assessment_investigations_project_assessment_key" UNIQUE("project_id","assessment_id"),
	CONSTRAINT "growth_assessment_investigations_project_id_key" UNIQUE("project_id","id")
);
--> statement-breakpoint
ALTER TABLE "growth_assessment_investigation_findings" ADD CONSTRAINT "growth_assessment_investigation_findings_project_id_investigation_id_growth_assessment_investigations_project_id_id_fk" FOREIGN KEY ("project_id","investigation_id") REFERENCES "public"."growth_assessment_investigations"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_assessment_investigations" ADD CONSTRAINT "growth_assessment_investigations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_assessment_investigations" ADD CONSTRAINT "growth_assessment_investigations_project_id_assessment_id_growth_assessments_project_id_id_fk" FOREIGN KEY ("project_id","assessment_id") REFERENCES "public"."growth_assessments"("project_id","id") ON DELETE cascade ON UPDATE no action;