ALTER TABLE "growth_assessment_investigation_findings" DROP CONSTRAINT "growth_assessment_investigation_findings_ordinal_key";--> statement-breakpoint
ALTER TABLE "growth_assessment_investigation_findings" ADD COLUMN "attempt_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "growth_assessment_investigations" ADD COLUMN "attempt_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "growth_assessment_investigation_findings" ADD CONSTRAINT "growth_assessment_investigation_findings_ordinal_key" UNIQUE("project_id","investigation_id","attempt_id","ordinal");