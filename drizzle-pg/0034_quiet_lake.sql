CREATE TABLE "growth_monthly_cycle_operator_observations" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"run_id" text NOT NULL,
	"request_key" text NOT NULL,
	"preparation" text NOT NULL,
	"failure" text NOT NULL,
	"duplicate_spam" text NOT NULL,
	"note" text,
	"reviewer_id" text NOT NULL,
	"created_at" text NOT NULL,
	CONSTRAINT "growth_monthly_cycle_operator_observations_project_request_key" UNIQUE("project_id","request_key"),
	CONSTRAINT "growth_monthly_cycle_operator_observations_text_bounds_check" CHECK (length("growth_monthly_cycle_operator_observations"."id") BETWEEN 1 AND 100 AND length("growth_monthly_cycle_operator_observations"."request_key") BETWEEN 1 AND 100 AND length("growth_monthly_cycle_operator_observations"."reviewer_id") BETWEEN 1 AND 200 AND ("growth_monthly_cycle_operator_observations"."note" IS NULL OR length("growth_monthly_cycle_operator_observations"."note") BETWEEN 1 AND 2000))
);
--> statement-breakpoint
ALTER TABLE "growth_monthly_cycle_operator_observations" ADD CONSTRAINT "growth_monthly_cycle_operator_observations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_monthly_cycle_operator_observations" ADD CONSTRAINT "growth_monthly_cycle_operator_observations_project_run_fk" FOREIGN KEY ("project_id","run_id") REFERENCES "public"."growth_runs"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "growth_monthly_cycle_operator_observations_latest_idx" ON "growth_monthly_cycle_operator_observations" USING btree ("project_id","run_id","created_at","id");