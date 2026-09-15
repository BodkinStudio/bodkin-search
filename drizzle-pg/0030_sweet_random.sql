CREATE TABLE "growth_recommendation_signal_links" (
	"project_id" text NOT NULL,
	"signal_run_id" text NOT NULL,
	"signal_id" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"recommendation_id" text NOT NULL,
	"relationship" text NOT NULL,
	"suppression_reason" text,
	"policy_version" text NOT NULL,
	"controller_released_at" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	CONSTRAINT "growth_recommendation_signal_links_signal_key" UNIQUE("project_id","signal_run_id","signal_id"),
	CONSTRAINT "growth_recommendation_signal_links_dedupe_key_check" CHECK (length("growth_recommendation_signal_links"."dedupe_key") = 64),
	CONSTRAINT "growth_recommendation_signal_links_relationship_check" CHECK (("growth_recommendation_signal_links"."relationship" = 'controller' AND "growth_recommendation_signal_links"."suppression_reason" IS NULL) OR ("growth_recommendation_signal_links"."relationship" = 'suppressed' AND "growth_recommendation_signal_links"."suppression_reason" IS NOT NULL AND "growth_recommendation_signal_links"."suppression_reason" IN ('existing_proposal','existing_snooze','prior_dismissal','existing_action','accepted_without_action','resolved_recommendation'))),
	CONSTRAINT "growth_recommendation_signal_links_release_check" CHECK ("growth_recommendation_signal_links"."controller_released_at" IS NULL OR "growth_recommendation_signal_links"."relationship" = 'controller')
);
--> statement-breakpoint
ALTER TABLE "growth_recommendation_signal_links" ADD CONSTRAINT "growth_recommendation_signal_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_recommendation_signal_links" ADD CONSTRAINT "growth_recommendation_signal_links_signal_fk" FOREIGN KEY ("project_id","signal_run_id","signal_id") REFERENCES "public"."growth_signals"("project_id","run_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_recommendation_signal_links" ADD CONSTRAINT "growth_recommendation_signal_links_recommendation_fk" FOREIGN KEY ("project_id","recommendation_id") REFERENCES "public"."growth_recommendations"("project_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "growth_recommendation_signal_links_controller_key" ON "growth_recommendation_signal_links" USING btree ("project_id","recommendation_id") WHERE "growth_recommendation_signal_links"."relationship" = 'controller';--> statement-breakpoint
CREATE UNIQUE INDEX "growth_recommendation_signal_links_active_controller_key" ON "growth_recommendation_signal_links" USING btree ("project_id","dedupe_key") WHERE "growth_recommendation_signal_links"."relationship" = 'controller' AND "growth_recommendation_signal_links"."controller_released_at" IS NULL;
