CREATE TABLE "prompt_explorer_snapshot_citations" (
	"project_id" text NOT NULL,
	"snapshot_id" text NOT NULL,
	"model" text NOT NULL,
	"ordinal" integer NOT NULL,
	"url" text NOT NULL,
	"domain" text,
	"title" text,
	"matched_brand" boolean NOT NULL,
	CONSTRAINT "prompt_explorer_snapshot_citations_key" UNIQUE("project_id","snapshot_id","model","ordinal")
);
--> statement-breakpoint
CREATE TABLE "prompt_explorer_snapshot_fan_out_queries" (
	"project_id" text NOT NULL,
	"snapshot_id" text NOT NULL,
	"model" text NOT NULL,
	"ordinal" integer NOT NULL,
	"query" text NOT NULL,
	CONSTRAINT "prompt_explorer_snapshot_fan_out_queries_key" UNIQUE("project_id","snapshot_id","model","ordinal")
);
--> statement-breakpoint
CREATE TABLE "prompt_explorer_snapshot_models" (
	"project_id" text NOT NULL,
	"snapshot_id" text NOT NULL,
	"model" text NOT NULL,
	"status" text NOT NULL,
	"model_name" text,
	"answer" text,
	"error_code" text,
	"error_message" text,
	"output_tokens" integer,
	"response_web_search" boolean,
	"brand_mentioned" boolean,
	"cache_source" text NOT NULL,
	"generated_at" text,
	CONSTRAINT "prompt_explorer_snapshot_models_key" UNIQUE("project_id","snapshot_id","model")
);
--> statement-breakpoint
CREATE TABLE "prompt_explorer_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"prompt" text NOT NULL,
	"highlight_brand" text,
	"web_search" boolean NOT NULL,
	"web_search_country_code" text,
	"captured_at" text NOT NULL,
	CONSTRAINT "prompt_explorer_snapshots_project_id_key" UNIQUE("project_id","id")
);
--> statement-breakpoint
ALTER TABLE "prompt_explorer_snapshot_citations" ADD CONSTRAINT "prompt_explorer_snapshot_citations_project_id_snapshot_id_model_prompt_explorer_snapshot_models_project_id_snapshot_id_model_fk" FOREIGN KEY ("project_id","snapshot_id","model") REFERENCES "public"."prompt_explorer_snapshot_models"("project_id","snapshot_id","model") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_explorer_snapshot_fan_out_queries" ADD CONSTRAINT "prompt_explorer_snapshot_fan_out_queries_project_id_snapshot_id_model_prompt_explorer_snapshot_models_project_id_snapshot_id_model_fk" FOREIGN KEY ("project_id","snapshot_id","model") REFERENCES "public"."prompt_explorer_snapshot_models"("project_id","snapshot_id","model") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_explorer_snapshot_models" ADD CONSTRAINT "prompt_explorer_snapshot_models_project_id_snapshot_id_prompt_explorer_snapshots_project_id_id_fk" FOREIGN KEY ("project_id","snapshot_id") REFERENCES "public"."prompt_explorer_snapshots"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_explorer_snapshots" ADD CONSTRAINT "prompt_explorer_snapshots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;