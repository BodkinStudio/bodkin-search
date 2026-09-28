import { sql } from "drizzle-orm";
import {
  foreignKey,
  integer,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";
import { projects } from "./app.schema";
import { projectKeyPages } from "./project-context.schema";

export const growthAssessments = sqliteTable(
  "growth_assessments",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    status: text("status", { enum: ["draft", "ready"] }).notNull(),
    objective: text("objective").notNull(),
    market: text("market").notNull(),
    audience: text("audience").notNull(),
    successMeasure: text("success_measure").notNull(),
    objectiveConfirmed: integer("objective_confirmed", { mode: "boolean" })
      .notNull()
      .default(false),
    comparisonRationale: text("comparison_rationale").notNull(),
    selectedOptionId: text("selected_option_id"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (t) => [
    unique("growth_assessments_project_version_key").on(t.projectId, t.version),
    unique("growth_assessments_project_id_key").on(t.projectId, t.id),
  ],
);

export const growthAssessmentOptions = sqliteTable(
  "growth_assessment_options",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    assessmentId: text("assessment_id").notNull(),
    ordinal: integer("ordinal").notNull(),
    kind: text("kind", {
      enum: ["page", "measurement", "research", "defer"],
    }).notNull(),
    title: text("title").notNull(),
    businessRelevance: text("business_relevance").notNull(),
    evidenceSource: text("evidence_source").notNull(),
    evidenceDate: text("evidence_date").notNull(),
    evidenceScope: text("evidence_scope").notNull(),
    observation: text("observation").notNull(),
    uncertainty: text("uncertainty").notNull(),
    nextValidation: text("next_validation").notNull(),
    disposition: text("disposition", {
      enum: ["selected", "alternative", "deferred"],
    }).notNull(),
    keyPageId: text("key_page_id"),
  },
  (t) => [
    unique("growth_assessment_options_project_id_key").on(t.projectId, t.id),
    unique("growth_assessment_options_assessment_ordinal_key").on(
      t.projectId,
      t.assessmentId,
      t.ordinal,
    ),
    foreignKey({
      columns: [t.projectId, t.assessmentId],
      foreignColumns: [growthAssessments.projectId, growthAssessments.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.projectId, t.keyPageId],
      foreignColumns: [projectKeyPages.projectId, projectKeyPages.id],
    }).onDelete("no action"),
  ],
);
