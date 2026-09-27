CREATE TABLE "growth_page_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"url" text NOT NULL,
	"captured_at" text NOT NULL,
	"status_code" integer NOT NULL,
	"resolved_url" text NOT NULL,
	"title" text,
	"meta_description" text,
	"h1" text,
	"canonical" text,
	"indexable" integer NOT NULL,
	"word_count" integer NOT NULL,
	"content_hash" text
);
--> statement-breakpoint
ALTER TABLE "growth_change_events" DROP CONSTRAINT "growth_change_events_vocabulary_check";--> statement-breakpoint
ALTER TABLE "growth_page_snapshots" ADD CONSTRAINT "growth_page_snapshots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "growth_page_snapshots_page_idx" ON "growth_page_snapshots" USING btree ("project_id","url","captured_at");--> statement-breakpoint
ALTER TABLE "growth_change_events" ADD CONSTRAINT "growth_change_events_vocabulary_check" CHECK ("growth_change_events"."source" IN ('manual','sherpa','cms_webhook','deployment','monitor') AND "growth_change_events"."change_type" IN ('content_updated','title_meta_updated','page_created','page_removed','redirect_changed','internal_links_changed','template_changed','structured_data_changed','technical_fix','design_restructure','migration','unknown','mixed') AND "growth_change_events"."actor_type" IN ('user','agent','system'));