CREATE TABLE "growth_workstreams" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"creation_key" text,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"commercial_reason" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"target_label" text,
	"target_baseline" double precision,
	"target_value" double precision,
	"target_due_on" text,
	"updated_by" text DEFAULT 'user' NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	CONSTRAINT "growth_workstreams_project_id_key" UNIQUE("project_id","id"),
	CONSTRAINT "growth_workstreams_project_creation_key" UNIQUE("project_id","creation_key"),
	CONSTRAINT "growth_workstreams_project_position_key" UNIQUE("project_id","position"),
	CONSTRAINT "growth_workstreams_text_check" CHECK (length("growth_workstreams"."title") BETWEEN 1 AND 200 AND length("growth_workstreams"."commercial_reason") BETWEEN 1 AND 2000 AND ("growth_workstreams"."creation_key" IS NULL OR length("growth_workstreams"."creation_key") BETWEEN 1 AND 200) AND ("growth_workstreams"."target_label" IS NULL OR length("growth_workstreams"."target_label") BETWEEN 1 AND 300) AND ("growth_workstreams"."target_due_on" IS NULL OR length("growth_workstreams"."target_due_on") = 10)),
	CONSTRAINT "growth_workstreams_shape_check" CHECK ("growth_workstreams"."status" IN ('active','done','dropped') AND "growth_workstreams"."updated_by" IN ('user','agent','system') AND "growth_workstreams"."position" >= 1)
);
--> statement-breakpoint
CREATE TABLE "growth_action_evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"action_id" text NOT NULL,
	"kind" text NOT NULL,
	"statement" text NOT NULL,
	"source_label" text NOT NULL,
	"source_url" text,
	"observed_on" text,
	"position" integer NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	CONSTRAINT "growth_action_evidence_project_id_key" UNIQUE("project_id","id"),
	CONSTRAINT "growth_action_evidence_position_key" UNIQUE("project_id","action_id","position"),
	CONSTRAINT "growth_action_evidence_text_check" CHECK (length("growth_action_evidence"."statement") BETWEEN 1 AND 1000 AND length("growth_action_evidence"."source_label") BETWEEN 1 AND 200 AND ("growth_action_evidence"."source_url" IS NULL OR length("growth_action_evidence"."source_url") BETWEEN 1 AND 2000) AND ("growth_action_evidence"."observed_on" IS NULL OR length("growth_action_evidence"."observed_on") = 10)),
	CONSTRAINT "growth_action_evidence_shape_check" CHECK ("growth_action_evidence"."kind" IN ('measured','sampled','estimate','judgement','reference') AND "growth_action_evidence"."position" >= 1)
);
--> statement-breakpoint
ALTER TABLE "growth_actions" ADD COLUMN "workstream_id" text;--> statement-breakpoint
ALTER TABLE "growth_actions" ADD COLUMN "workstream_position" integer;--> statement-breakpoint
ALTER TABLE "growth_actions" ADD COLUMN "rationale" text;--> statement-breakpoint
ALTER TABLE "growth_actions" ADD COLUMN "success_measure" text;--> statement-breakpoint
ALTER TABLE "growth_workstreams" ADD CONSTRAINT "growth_workstreams_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_action_evidence" ADD CONSTRAINT "growth_action_evidence_project_action_fk" FOREIGN KEY ("project_id","action_id") REFERENCES "public"."growth_actions"("project_id","id") ON DELETE cascade ON UPDATE no action;