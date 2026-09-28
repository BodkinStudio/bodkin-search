CREATE TABLE "growth_action_events" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"action_id" text NOT NULL,
	"action_version" integer NOT NULL,
	"fact_hash" text NOT NULL,
	"event_type" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"note" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	CONSTRAINT "growth_action_events_project_action_version_key" UNIQUE("project_id","action_id","action_version"),
	CONSTRAINT "growth_action_events_text_check" CHECK (length("growth_action_events"."fact_hash") = 64 AND length("growth_action_events"."actor_id") BETWEEN 1 AND 200 AND ("growth_action_events"."note" IS NULL OR length("growth_action_events"."note") BETWEEN 1 AND 5000)),
	CONSTRAINT "growth_action_events_shape_check" CHECK ("growth_action_events"."event_type" IN ('created','status_changed') AND "growth_action_events"."actor_type" IN ('user','agent','system') AND "growth_action_events"."to_status" IN ('approved','ready','in_progress','blocked','implemented','measuring','evaluated','cancelled') AND ("growth_action_events"."from_status" IS NULL OR "growth_action_events"."from_status" IN ('approved','ready','in_progress','blocked','implemented','measuring','evaluated','cancelled')) AND (("growth_action_events"."event_type" = 'created' AND "growth_action_events"."action_version" = 0 AND "growth_action_events"."from_status" IS NULL AND "growth_action_events"."to_status" = 'approved') OR ("growth_action_events"."event_type" = 'status_changed' AND "growth_action_events"."action_version" > 0 AND "growth_action_events"."from_status" IS NOT NULL))),
	CONSTRAINT "growth_action_events_transition_check" CHECK ("growth_action_events"."event_type" = 'created' OR ("growth_action_events"."from_status" = 'approved' AND "growth_action_events"."to_status" IN ('ready','cancelled')) OR ("growth_action_events"."from_status" = 'ready' AND "growth_action_events"."to_status" IN ('in_progress','cancelled')) OR ("growth_action_events"."from_status" = 'in_progress' AND "growth_action_events"."to_status" IN ('blocked','implemented','cancelled')) OR ("growth_action_events"."from_status" = 'blocked' AND "growth_action_events"."to_status" IN ('in_progress','implemented','cancelled')) OR ("growth_action_events"."from_status" = 'implemented' AND "growth_action_events"."to_status" = 'measuring') OR ("growth_action_events"."from_status" = 'measuring' AND "growth_action_events"."to_status" = 'evaluated'))
);
--> statement-breakpoint
CREATE TABLE "growth_action_targets" (
	"project_id" text NOT NULL,
	"action_id" text NOT NULL,
	"target_type" text NOT NULL,
	"target_value" text NOT NULL,
	CONSTRAINT "growth_action_targets_key" UNIQUE("project_id","action_id","target_type","target_value"),
	CONSTRAINT "growth_action_targets_text_check" CHECK ("growth_action_targets"."target_type" IN ('url', 'keyword', 'cluster', 'site') AND length("growth_action_targets"."target_value") BETWEEN 1 AND 2000)
);
--> statement-breakpoint
CREATE TABLE "growth_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"recommendation_id" text NOT NULL,
	"creation_key" text NOT NULL,
	"fact_hash" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"priority_score" double precision NOT NULL,
	"status" text DEFAULT 'approved' NOT NULL,
	"state_version" integer DEFAULT 0 NOT NULL,
	"owner_user_id" text,
	"due_at" text NOT NULL,
	"approved_at" text NOT NULL,
	"started_at" text,
	"implemented_at" text,
	"evaluated_at" text,
	"cancelled_at" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	CONSTRAINT "growth_actions_project_id_key" UNIQUE("project_id","id"),
	CONSTRAINT "growth_actions_project_creation_key" UNIQUE("project_id","creation_key"),
	CONSTRAINT "growth_actions_text_bounds_check" CHECK (length("growth_actions"."creation_key") BETWEEN 1 AND 200 AND length("growth_actions"."fact_hash") = 64 AND length("growth_actions"."title") BETWEEN 1 AND 300 AND length("growth_actions"."description") BETWEEN 1 AND 5000 AND length("growth_actions"."category") BETWEEN 1 AND 100 AND length("growth_actions"."due_at") BETWEEN 1 AND 50),
	CONSTRAINT "growth_actions_state_check" CHECK ("growth_actions"."status" IN ('approved','ready','in_progress','blocked','implemented','measuring','evaluated','cancelled') AND "growth_actions"."state_version" >= 0 AND "growth_actions"."priority_score" >= 0 AND "growth_actions"."priority_score" NOT IN ('Infinity'::double precision, '-Infinity'::double precision, 'NaN'::double precision) AND (("growth_actions"."state_version" = 0 AND "growth_actions"."status" = 'approved') OR ("growth_actions"."state_version" > 0 AND "growth_actions"."status" <> 'approved'))),
	CONSTRAINT "growth_actions_milestones_check" CHECK ("growth_actions"."approved_at" IS NOT NULL AND (("growth_actions"."status" = 'approved' AND "growth_actions"."started_at" IS NULL AND "growth_actions"."implemented_at" IS NULL AND "growth_actions"."evaluated_at" IS NULL AND "growth_actions"."cancelled_at" IS NULL) OR ("growth_actions"."status" = 'ready' AND "growth_actions"."started_at" IS NULL AND "growth_actions"."implemented_at" IS NULL AND "growth_actions"."evaluated_at" IS NULL AND "growth_actions"."cancelled_at" IS NULL) OR ("growth_actions"."status" IN ('in_progress','blocked') AND "growth_actions"."started_at" IS NOT NULL AND "growth_actions"."implemented_at" IS NULL AND "growth_actions"."evaluated_at" IS NULL AND "growth_actions"."cancelled_at" IS NULL) OR ("growth_actions"."status" IN ('implemented','measuring') AND "growth_actions"."started_at" IS NOT NULL AND "growth_actions"."implemented_at" IS NOT NULL AND "growth_actions"."evaluated_at" IS NULL AND "growth_actions"."cancelled_at" IS NULL) OR ("growth_actions"."status" = 'evaluated' AND "growth_actions"."started_at" IS NOT NULL AND "growth_actions"."implemented_at" IS NOT NULL AND "growth_actions"."evaluated_at" IS NOT NULL AND "growth_actions"."cancelled_at" IS NULL) OR ("growth_actions"."status" = 'cancelled' AND "growth_actions"."implemented_at" IS NULL AND "growth_actions"."evaluated_at" IS NULL AND "growth_actions"."cancelled_at" IS NOT NULL)))
);
--> statement-breakpoint
ALTER TABLE "growth_action_events" ADD CONSTRAINT "growth_action_events_project_action_fk" FOREIGN KEY ("project_id","action_id") REFERENCES "public"."growth_actions"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_action_targets" ADD CONSTRAINT "growth_action_targets_project_action_fk" FOREIGN KEY ("project_id","action_id") REFERENCES "public"."growth_actions"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_actions" ADD CONSTRAINT "growth_actions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_actions" ADD CONSTRAINT "growth_actions_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_actions" ADD CONSTRAINT "growth_actions_project_recommendation_fk" FOREIGN KEY ("project_id","recommendation_id") REFERENCES "public"."growth_recommendations"("project_id","id") ON DELETE cascade ON UPDATE no action;
