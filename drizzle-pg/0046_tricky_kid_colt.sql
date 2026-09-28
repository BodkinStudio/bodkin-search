CREATE TABLE "growth_assessment_investigation_evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"investigation_id" text NOT NULL,
	"attempt_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"source" text NOT NULL,
	"title" text NOT NULL,
	"evidence_text" text NOT NULL,
	"source_url" text,
	"observed_at" text NOT NULL,
	"scope" text NOT NULL,
	CONSTRAINT "growth_assessment_investigation_evidence_project_id_key" UNIQUE("project_id","id"),
	CONSTRAINT "growth_assessment_investigation_evidence_ordinal_key" UNIQUE("project_id","investigation_id","attempt_id","ordinal")
);
--> statement-breakpoint
ALTER TABLE "growth_assessment_investigations" ADD COLUMN "decision_verdict" text;--> statement-breakpoint
ALTER TABLE "growth_assessment_investigations" ADD COLUMN "decision_headline" text;--> statement-breakpoint
ALTER TABLE "growth_assessment_investigations" ADD COLUMN "decision_why_this_page" text;--> statement-breakpoint
ALTER TABLE "growth_assessment_investigations" ADD COLUMN "decision_rationale" text;--> statement-breakpoint
ALTER TABLE "growth_assessment_investigations" ADD COLUMN "decision_next_action" text;--> statement-breakpoint
ALTER TABLE "growth_assessment_investigations" ADD COLUMN "decision_expected_outcome" text;--> statement-breakpoint
ALTER TABLE "growth_assessment_investigations" ADD COLUMN "decision_measurement" text;--> statement-breakpoint
ALTER TABLE "growth_assessment_investigations" ADD COLUMN "decision_caveat" text;--> statement-breakpoint
ALTER TABLE "growth_assessment_investigation_evidence" ADD CONSTRAINT "growth_assessment_investigation_evidence_project_id_investigation_id_growth_assessment_investigations_project_id_id_fk" FOREIGN KEY ("project_id","investigation_id") REFERENCES "public"."growth_assessment_investigations"("project_id","id") ON DELETE cascade ON UPDATE no action;