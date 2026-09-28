CREATE TABLE "growth_evidence_points" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"series_id" text NOT NULL,
	"position" integer NOT NULL,
	"label" text NOT NULL,
	"group_label" text,
	"value" double precision,
	CONSTRAINT "growth_evidence_points_position_key" UNIQUE("project_id","series_id","position"),
	CONSTRAINT "growth_evidence_points_text_check" CHECK (length("growth_evidence_points"."label") BETWEEN 1 AND 100 AND ("growth_evidence_points"."group_label" IS NULL OR length("growth_evidence_points"."group_label") BETWEEN 1 AND 100)),
	CONSTRAINT "growth_evidence_points_shape_check" CHECK ("growth_evidence_points"."position" >= 1)
);
--> statement-breakpoint
CREATE TABLE "growth_evidence_series" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"evidence_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"unit" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	CONSTRAINT "growth_evidence_series_project_id_key" UNIQUE("project_id","id"),
	CONSTRAINT "growth_evidence_series_evidence_key" UNIQUE("project_id","evidence_id"),
	CONSTRAINT "growth_evidence_series_text_check" CHECK (length("growth_evidence_series"."title") BETWEEN 1 AND 200 AND length("growth_evidence_series"."unit") BETWEEN 1 AND 50),
	CONSTRAINT "growth_evidence_series_shape_check" CHECK ("growth_evidence_series"."kind" IN ('monthly','bars','matrix'))
);
--> statement-breakpoint
ALTER TABLE "growth_evidence_points" ADD CONSTRAINT "growth_evidence_points_project_series_fk" FOREIGN KEY ("project_id","series_id") REFERENCES "public"."growth_evidence_series"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_evidence_series" ADD CONSTRAINT "growth_evidence_series_project_evidence_fk" FOREIGN KEY ("project_id","evidence_id") REFERENCES "public"."growth_action_evidence"("project_id","id") ON DELETE cascade ON UPDATE no action;