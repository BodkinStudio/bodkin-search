import { sql } from "drizzle-orm";
import {
  foreignKey,
  integer,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";
import { projects } from "./app.schema";
import { growthAssessments } from "./growth-assessments.schema";

export const growthAssessmentInvestigations = sqliteTable(
  "growth_assessment_investigations",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    assessmentId: text("assessment_id").notNull(),
    assessmentVersion: integer("assessment_version").notNull(),
    attemptId: text("attempt_id").notNull(),
    status: text("status", {
      enum: ["running", "completed", "failed"],
    }).notNull(),
    pageStatus: text("page_status", {
      enum: ["pending", "completed", "limited", "failed"],
    }).notNull(),
    analyticsStatus: text("analytics_status", {
      enum: ["pending", "completed", "limited", "failed"],
    }).notNull(),
    findingsStatus: text("findings_status", {
      enum: ["pending", "completed", "limited", "failed"],
    }).notNull(),
    sourceUrl: text("source_url"),
    sourceTitle: text("source_title"),
    sourceObservedAt: text("source_observed_at"),
    decisionVerdict: text("decision_verdict", {
      enum: ["change", "investigate", "deprioritise"],
    }),
    decisionHeadline: text("decision_headline"),
    decisionWhyThisPage: text("decision_why_this_page"),
    decisionRationale: text("decision_rationale"),
    decisionNextAction: text("decision_next_action"),
    decisionExpectedOutcome: text("decision_expected_outcome"),
    decisionMeasurement: text("decision_measurement"),
    decisionCaveat: text("decision_caveat"),
    startedAt: text("started_at").notNull(),
    completedAt: text("completed_at"),
    failedAt: text("failed_at"),
    staleAfter: text("stale_after").notNull(),
    failureMessage: text("failure_message"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (t) => [
    unique("growth_assessment_investigations_project_assessment_key").on(
      t.projectId,
      t.assessmentId,
    ),
    unique("growth_assessment_investigations_project_id_key").on(
      t.projectId,
      t.id,
    ),
    foreignKey({
      columns: [t.projectId, t.assessmentId],
      foreignColumns: [growthAssessments.projectId, growthAssessments.id],
    }).onDelete("cascade"),
  ],
);

export const growthAssessmentInvestigationEvidence = sqliteTable(
  "growth_assessment_investigation_evidence",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    investigationId: text("investigation_id").notNull(),
    attemptId: text("attempt_id").notNull(),
    ordinal: integer("ordinal").notNull(),
    source: text("source").notNull(),
    title: text("title").notNull(),
    evidenceText: text("evidence_text").notNull(),
    sourceUrl: text("source_url"),
    observedAt: text("observed_at").notNull(),
    scope: text("scope").notNull(),
    citedByDecision: integer("cited_by_decision", { mode: "boolean" })
      .notNull()
      .default(false),
  },
  (t) => [
    unique("growth_assessment_investigation_evidence_project_id_key").on(
      t.projectId,
      t.id,
    ),
    unique("growth_assessment_investigation_evidence_ordinal_key").on(
      t.projectId,
      t.investigationId,
      t.attemptId,
      t.ordinal,
    ),
    foreignKey({
      columns: [t.projectId, t.investigationId],
      foreignColumns: [
        growthAssessmentInvestigations.projectId,
        growthAssessmentInvestigations.id,
      ],
    }).onDelete("cascade"),
  ],
);

export const growthAssessmentInvestigationFindings = sqliteTable(
  "growth_assessment_investigation_findings",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    investigationId: text("investigation_id").notNull(),
    attemptId: text("attempt_id").notNull(),
    ordinal: integer("ordinal").notNull(),
    title: text("title").notNull(),
    whyItMatters: text("why_it_matters").notNull(),
    evidence: text("evidence").notNull(),
    sourceUrl: text("source_url").notNull(),
    observedAt: text("observed_at").notNull(),
    recommendedNextStep: text("recommended_next_step").notNull(),
    unverified: text("unverified").notNull(),
  },
  (t) => [
    unique("growth_assessment_investigation_findings_project_id_key").on(
      t.projectId,
      t.id,
    ),
    unique("growth_assessment_investigation_findings_ordinal_key").on(
      t.projectId,
      t.investigationId,
      t.attemptId,
      t.ordinal,
    ),
    foreignKey({
      columns: [t.projectId, t.investigationId],
      foreignColumns: [
        growthAssessmentInvestigations.projectId,
        growthAssessmentInvestigations.id,
      ],
    }).onDelete("cascade"),
  ],
);
