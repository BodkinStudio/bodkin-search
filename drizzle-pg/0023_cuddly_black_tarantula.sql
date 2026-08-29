CREATE TABLE "growth_insight_signals" (
	"project_id" text NOT NULL,
	"run_id" text NOT NULL,
	"insight_id" text NOT NULL,
	"signal_id" text NOT NULL,
	CONSTRAINT "growth_insight_signals_key" UNIQUE("project_id","run_id","insight_id","signal_id")
);
--> statement-breakpoint
CREATE TABLE "growth_insights" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"run_id" text NOT NULL,
	"creation_key" text NOT NULL,
	"fact_hash" text NOT NULL,
	"title" text NOT NULL,
	"explanation" text NOT NULL,
	"hypothesis" text NOT NULL,
	"confidence" double precision NOT NULL,
	"model" text,
	"prompt_version" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	CONSTRAINT "growth_insights_project_run_id_key" UNIQUE("project_id","run_id","id"),
	CONSTRAINT "growth_insights_project_run_creation_key" UNIQUE("project_id","run_id","creation_key"),
	CONSTRAINT "growth_insights_confidence_check" CHECK ("growth_insights"."confidence" BETWEEN 0 AND 1),
	CONSTRAINT "growth_insights_model_prompt_check" CHECK (("growth_insights"."model" IS NULL) = ("growth_insights"."prompt_version" IS NULL)),
	CONSTRAINT "growth_insights_text_bounds_check" CHECK (length("growth_insights"."creation_key") BETWEEN 1 AND 200 AND length("growth_insights"."fact_hash") = 64 AND length("growth_insights"."title") BETWEEN 1 AND 300 AND length("growth_insights"."explanation") BETWEEN 1 AND 5000 AND length("growth_insights"."hypothesis") BETWEEN 1 AND 5000)
);
--> statement-breakpoint
CREATE TABLE "growth_recommendation_insights" (
	"project_id" text NOT NULL,
	"run_id" text NOT NULL,
	"recommendation_id" text NOT NULL,
	"insight_id" text NOT NULL,
	CONSTRAINT "growth_recommendation_insights_key" UNIQUE("project_id","run_id","recommendation_id","insight_id")
);
--> statement-breakpoint
CREATE TABLE "growth_recommendation_steps" (
	"project_id" text NOT NULL,
	"run_id" text NOT NULL,
	"recommendation_id" text NOT NULL,
	"position" integer NOT NULL,
	"content" text NOT NULL,
	CONSTRAINT "growth_recommendation_steps_position_key" UNIQUE("project_id","run_id","recommendation_id","position"),
	CONSTRAINT "growth_recommendation_steps_bounds_check" CHECK ("growth_recommendation_steps"."position" >= 0 AND length("growth_recommendation_steps"."content") BETWEEN 1 AND 2000)
);
--> statement-breakpoint
CREATE TABLE "growth_recommendation_targets" (
	"project_id" text NOT NULL,
	"run_id" text NOT NULL,
	"recommendation_id" text NOT NULL,
	"target_type" text NOT NULL,
	"target_value" text NOT NULL,
	CONSTRAINT "growth_recommendation_targets_key" UNIQUE("project_id","run_id","recommendation_id","target_type","target_value"),
	CONSTRAINT "growth_recommendation_targets_text_check" CHECK ("growth_recommendation_targets"."target_type" IN ('url', 'keyword', 'cluster', 'site') AND length("growth_recommendation_targets"."target_value") BETWEEN 1 AND 2000)
);
--> statement-breakpoint
CREATE TABLE "growth_recommendations" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"run_id" text NOT NULL,
	"creation_key" text NOT NULL,
	"fact_hash" text NOT NULL,
	"title" text NOT NULL,
	"rationale" text NOT NULL,
	"category" text NOT NULL,
	"impact" integer NOT NULL,
	"commercial_relevance" integer NOT NULL,
	"effort" integer NOT NULL,
	"urgency" integer NOT NULL,
	"confidence" double precision NOT NULL,
	"priority_score" double precision NOT NULL,
	"model" text,
	"prompt_version" text,
	"status" text DEFAULT 'proposed' NOT NULL,
	"review_version" integer DEFAULT 0 NOT NULL,
	"snoozed_until" text,
	"dismissal_reason" text,
	"resolution_recommendation_id" text,
	"reviewed_at" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	CONSTRAINT "growth_recommendations_project_id_key" UNIQUE("project_id","id"),
	CONSTRAINT "growth_recommendations_project_run_id_key" UNIQUE("project_id","run_id","id"),
	CONSTRAINT "growth_recommendations_project_run_creation_key" UNIQUE("project_id","run_id","creation_key"),
	CONSTRAINT "growth_recommendations_scores_check" CHECK ("growth_recommendations"."impact" BETWEEN 1 AND 5 AND "growth_recommendations"."commercial_relevance" BETWEEN 1 AND 5 AND "growth_recommendations"."effort" BETWEEN 1 AND 5 AND "growth_recommendations"."urgency" BETWEEN 1 AND 3 AND "growth_recommendations"."confidence" BETWEEN 0 AND 1 AND "growth_recommendations"."priority_score" >= 0 AND "growth_recommendations"."review_version" >= 0),
	CONSTRAINT "growth_recommendations_model_prompt_check" CHECK (("growth_recommendations"."model" IS NULL) = ("growth_recommendations"."prompt_version" IS NULL)),
	CONSTRAINT "growth_recommendations_text_bounds_check" CHECK (length("growth_recommendations"."creation_key") BETWEEN 1 AND 200 AND length("growth_recommendations"."fact_hash") = 64 AND length("growth_recommendations"."title") BETWEEN 1 AND 300 AND length("growth_recommendations"."rationale") BETWEEN 1 AND 5000 AND length("growth_recommendations"."category") BETWEEN 1 AND 100),
	CONSTRAINT "growth_recommendations_review_check" CHECK (("growth_recommendations"."status" = 'proposed' AND "growth_recommendations"."snoozed_until" IS NULL AND "growth_recommendations"."dismissal_reason" IS NULL AND "growth_recommendations"."resolution_recommendation_id" IS NULL) OR ("growth_recommendations"."status" = 'accepted' AND "growth_recommendations"."snoozed_until" IS NULL AND "growth_recommendations"."dismissal_reason" IS NULL AND "growth_recommendations"."resolution_recommendation_id" IS NULL) OR ("growth_recommendations"."status" = 'dismissed' AND "growth_recommendations"."snoozed_until" IS NULL AND "growth_recommendations"."dismissal_reason" IN ('irrelevant','already_planned','not_commercially_important','insufficient_evidence','wrong_diagnosis','too_much_effort','duplicate','defer') AND "growth_recommendations"."resolution_recommendation_id" IS NULL) OR ("growth_recommendations"."status" = 'snoozed' AND "growth_recommendations"."snoozed_until" IS NOT NULL AND "growth_recommendations"."dismissal_reason" IS NULL AND "growth_recommendations"."resolution_recommendation_id" IS NULL) OR ("growth_recommendations"."status" IN ('merged','superseded') AND "growth_recommendations"."snoozed_until" IS NULL AND "growth_recommendations"."dismissal_reason" IS NULL AND "growth_recommendations"."resolution_recommendation_id" IS NOT NULL AND "growth_recommendations"."resolution_recommendation_id" <> "growth_recommendations"."id"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "growth_signals_project_run_id_key" ON "growth_signals" USING btree ("project_id","run_id","id");--> statement-breakpoint
ALTER TABLE "growth_insight_signals" ADD CONSTRAINT "growth_insight_signals_insight_fk" FOREIGN KEY ("project_id","run_id","insight_id") REFERENCES "public"."growth_insights"("project_id","run_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_insight_signals" ADD CONSTRAINT "growth_insight_signals_signal_fk" FOREIGN KEY ("project_id","run_id","signal_id") REFERENCES "public"."growth_signals"("project_id","run_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_insights" ADD CONSTRAINT "growth_insights_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_insights" ADD CONSTRAINT "growth_insights_project_run_fk" FOREIGN KEY ("project_id","run_id") REFERENCES "public"."growth_runs"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_recommendation_insights" ADD CONSTRAINT "growth_recommendation_insights_recommendation_fk" FOREIGN KEY ("project_id","run_id","recommendation_id") REFERENCES "public"."growth_recommendations"("project_id","run_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_recommendation_insights" ADD CONSTRAINT "growth_recommendation_insights_insight_fk" FOREIGN KEY ("project_id","run_id","insight_id") REFERENCES "public"."growth_insights"("project_id","run_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_recommendation_steps" ADD CONSTRAINT "growth_recommendation_steps_recommendation_fk" FOREIGN KEY ("project_id","run_id","recommendation_id") REFERENCES "public"."growth_recommendations"("project_id","run_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_recommendation_targets" ADD CONSTRAINT "growth_recommendation_targets_recommendation_fk" FOREIGN KEY ("project_id","run_id","recommendation_id") REFERENCES "public"."growth_recommendations"("project_id","run_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_recommendations" ADD CONSTRAINT "growth_recommendations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_recommendations" ADD CONSTRAINT "growth_recommendations_project_run_fk" FOREIGN KEY ("project_id","run_id") REFERENCES "public"."growth_runs"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_recommendations" ADD CONSTRAINT "growth_recommendations_resolution_fk" FOREIGN KEY ("project_id","run_id","resolution_recommendation_id") REFERENCES "public"."growth_recommendations"("project_id","run_id","id") ON DELETE no action ON UPDATE no action;
