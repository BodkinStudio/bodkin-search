CREATE TABLE "workspace_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"target_id" text NOT NULL,
	"role" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_configuration" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"payer_organization_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_audit" ADD CONSTRAINT "workspace_audit_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_audit" ADD CONSTRAINT "workspace_audit_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_configuration" ADD CONSTRAINT "workspace_configuration_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_configuration" ADD CONSTRAINT "workspace_configuration_payer_organization_id_organization_id_fk" FOREIGN KEY ("payer_organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspace_audit_organization_idx" ON "workspace_audit" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "member_workspace_user_uidx" ON "member" USING btree ("organization_id","user_id");