CREATE UNIQUE INDEX "project_key_pages_project_id_key" ON "project_key_pages" USING btree ("project_id","id");
--> statement-breakpoint
CREATE TABLE "growth_assessment_options" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"assessment_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"business_relevance" text NOT NULL,
	"evidence_source" text NOT NULL,
	"evidence_date" text NOT NULL,
	"evidence_scope" text NOT NULL,
	"observation" text NOT NULL,
	"uncertainty" text NOT NULL,
	"next_validation" text NOT NULL,
	"disposition" text NOT NULL,
	"key_page_id" text,
	CONSTRAINT "growth_assessment_options_project_id_key" UNIQUE("project_id","id"),
	CONSTRAINT "growth_assessment_options_assessment_ordinal_key" UNIQUE("project_id","assessment_id","ordinal")
);
--> statement-breakpoint
CREATE TABLE "growth_assessments" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"version" integer NOT NULL,
	"status" text NOT NULL,
	"objective" text NOT NULL,
	"market" text NOT NULL,
	"audience" text NOT NULL,
	"success_measure" text NOT NULL,
	"objective_confirmed" boolean DEFAULT false NOT NULL,
	"comparison_rationale" text NOT NULL,
	"selected_option_id" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	CONSTRAINT "growth_assessments_project_version_key" UNIQUE("project_id","version"),
	CONSTRAINT "growth_assessments_project_id_key" UNIQUE("project_id","id")
);
--> statement-breakpoint
ALTER TABLE "growth_assessment_options" ADD CONSTRAINT "growth_assessment_options_project_id_assessment_id_growth_assessments_project_id_id_fk" FOREIGN KEY ("project_id","assessment_id") REFERENCES "public"."growth_assessments"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_assessment_options" ADD CONSTRAINT "growth_assessment_options_project_id_key_page_id_project_key_pages_project_id_id_fk" FOREIGN KEY ("project_id","key_page_id") REFERENCES "public"."project_key_pages"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_assessments" ADD CONSTRAINT "growth_assessments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
