CREATE TABLE "growth_ai_brief_caveats" (
	"project_id" text NOT NULL,
	"brief_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"content" text NOT NULL,
	CONSTRAINT "growth_ai_brief_caveats_key" UNIQUE("project_id","brief_id","ordinal")
);
--> statement-breakpoint
CREATE TABLE "growth_ai_brief_citation_sources" (
	"project_id" text NOT NULL,
	"brief_id" text NOT NULL,
	"citation_id" text NOT NULL,
	"label" text NOT NULL,
	"source" text NOT NULL,
	"snapshot" text,
	CONSTRAINT "growth_ai_brief_citation_sources_key" UNIQUE("project_id","brief_id","citation_id")
);
--> statement-breakpoint
CREATE TABLE "growth_ai_brief_citations" (
	"project_id" text NOT NULL,
	"brief_id" text NOT NULL,
	"claim_id" text NOT NULL,
	"citation_id" text NOT NULL,
	CONSTRAINT "growth_ai_brief_citations_key" UNIQUE("project_id","claim_id","citation_id")
);
--> statement-breakpoint
CREATE TABLE "growth_ai_brief_claims" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"brief_id" text NOT NULL,
	"kind" text NOT NULL,
	"ordinal" integer NOT NULL,
	"statement" text NOT NULL,
	"confidence" text,
	CONSTRAINT "growth_ai_brief_claims_project_id_key" UNIQUE("project_id","id"),
	CONSTRAINT "growth_ai_brief_claims_project_brief_id_key" UNIQUE("project_id","brief_id","id"),
	CONSTRAINT "growth_ai_brief_claims_key" UNIQUE("project_id","brief_id","kind","ordinal")
);
--> statement-breakpoint
CREATE TABLE "growth_ai_brief_steps" (
	"project_id" text NOT NULL,
	"brief_id" text NOT NULL,
	"kind" text NOT NULL,
	"ordinal" integer NOT NULL,
	"content" text NOT NULL,
	CONSTRAINT "growth_ai_brief_steps_key" UNIQUE("project_id","brief_id","kind","ordinal")
);
--> statement-breakpoint
CREATE TABLE "growth_ai_briefs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"signal_id" text NOT NULL,
	"recommendation_id" text NOT NULL,
	"template_version" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"generated_at" text NOT NULL,
	"affected_page_url" text,
	"current_business_context" text NOT NULL,
	"page_read_status" text NOT NULL,
	"requested_url" text,
	"resolved_url" text,
	"business_relevance" text NOT NULL,
	"title" text NOT NULL,
	"generated_measurement_approach" text NOT NULL,
	"measurement_approach" text NOT NULL,
	"proposal_write_key" text,
	"version" integer DEFAULT 0 NOT NULL,
	"approved_action_id" text,
	"approved_version" integer,
	"approved_due_on" text,
	"approved_at" text,
	"approved_actor_id" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	CONSTRAINT "growth_ai_briefs_project_id_key" UNIQUE("project_id","id"),
	CONSTRAINT "growth_ai_briefs_project_signal_key" UNIQUE("project_id","signal_id"),
	CONSTRAINT "growth_ai_briefs_approval_check" CHECK (("growth_ai_briefs"."approved_action_id" IS NULL AND "growth_ai_briefs"."approved_version" IS NULL AND "growth_ai_briefs"."approved_due_on" IS NULL AND "growth_ai_briefs"."approved_at" IS NULL AND "growth_ai_briefs"."approved_actor_id" IS NULL) OR ("growth_ai_briefs"."approved_action_id" IS NOT NULL AND "growth_ai_briefs"."approved_version" IS NOT NULL AND "growth_ai_briefs"."approved_due_on" IS NOT NULL AND "growth_ai_briefs"."approved_at" IS NOT NULL AND "growth_ai_briefs"."approved_actor_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "growth_ai_brief_caveats" ADD CONSTRAINT "growth_ai_brief_caveats_project_id_brief_id_growth_ai_briefs_project_id_id_fk" FOREIGN KEY ("project_id","brief_id") REFERENCES "public"."growth_ai_briefs"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_ai_brief_citation_sources" ADD CONSTRAINT "growth_ai_brief_citation_sources_project_id_brief_id_growth_ai_briefs_project_id_id_fk" FOREIGN KEY ("project_id","brief_id") REFERENCES "public"."growth_ai_briefs"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_ai_brief_citations" ADD CONSTRAINT "growth_ai_brief_citations_project_id_brief_id_claim_id_growth_ai_brief_claims_project_id_brief_id_id_fk" FOREIGN KEY ("project_id","brief_id","claim_id") REFERENCES "public"."growth_ai_brief_claims"("project_id","brief_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_ai_brief_citations" ADD CONSTRAINT "growth_ai_brief_citations_project_id_brief_id_citation_id_growth_ai_brief_citation_sources_project_id_brief_id_citation_id_fk" FOREIGN KEY ("project_id","brief_id","citation_id") REFERENCES "public"."growth_ai_brief_citation_sources"("project_id","brief_id","citation_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_ai_brief_claims" ADD CONSTRAINT "growth_ai_brief_claims_project_id_brief_id_growth_ai_briefs_project_id_id_fk" FOREIGN KEY ("project_id","brief_id") REFERENCES "public"."growth_ai_briefs"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_ai_brief_steps" ADD CONSTRAINT "growth_ai_brief_steps_project_id_brief_id_growth_ai_briefs_project_id_id_fk" FOREIGN KEY ("project_id","brief_id") REFERENCES "public"."growth_ai_briefs"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_ai_briefs" ADD CONSTRAINT "growth_ai_briefs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_ai_briefs" ADD CONSTRAINT "growth_ai_briefs_project_id_recommendation_id_growth_recommendations_project_id_id_fk" FOREIGN KEY ("project_id","recommendation_id") REFERENCES "public"."growth_recommendations"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_ai_briefs" ADD CONSTRAINT "growth_ai_briefs_project_id_approved_action_id_growth_actions_project_id_id_fk" FOREIGN KEY ("project_id","approved_action_id") REFERENCES "public"."growth_actions"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "growth_signals_project_id_key" ON "growth_signals" USING btree ("project_id","id");--> statement-breakpoint
ALTER TABLE "growth_ai_briefs" ADD CONSTRAINT "growth_ai_briefs_project_id_signal_id_growth_signals_project_id_id_fk" FOREIGN KEY ("project_id","signal_id") REFERENCES "public"."growth_signals"("project_id","id") ON DELETE cascade ON UPDATE no action;