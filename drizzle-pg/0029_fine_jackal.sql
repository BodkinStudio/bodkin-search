CREATE TABLE "growth_measurement_plan_anchors" (
	"project_id" text NOT NULL,
	"measurement_plan_id" text NOT NULL,
	"action_id" text NOT NULL,
	"change_event_id" text NOT NULL,
	CONSTRAINT "growth_measurement_plan_anchors_project_plan_key" UNIQUE("project_id","measurement_plan_id"),
	CONSTRAINT "growth_measurement_plan_anchors_text_bounds_check" CHECK (length("growth_measurement_plan_anchors"."measurement_plan_id") BETWEEN 1 AND 100 AND length("growth_measurement_plan_anchors"."action_id") BETWEEN 1 AND 100 AND length("growth_measurement_plan_anchors"."change_event_id") BETWEEN 1 AND 100)
);
--> statement-breakpoint
ALTER TABLE "growth_measurement_plan_anchors" ADD CONSTRAINT "growth_measurement_plan_anchors_project_plan_action_fk" FOREIGN KEY ("project_id","measurement_plan_id","action_id") REFERENCES "public"."growth_measurement_plans"("project_id","id","action_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_measurement_plan_anchors" ADD CONSTRAINT "growth_measurement_plan_anchors_project_action_change_fk" FOREIGN KEY ("project_id","action_id","change_event_id") REFERENCES "public"."growth_action_changes"("project_id","action_id","change_event_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "growth_measurement_plan_anchors_project_change_idx" ON "growth_measurement_plan_anchors" USING btree ("project_id","change_event_id");--> statement-breakpoint
ALTER TABLE "growth_measurement_plans" ADD CONSTRAINT "growth_measurement_plans_project_id_action_key" UNIQUE("project_id","id","action_id");