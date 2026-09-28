import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  integer,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";
import { projects } from "./app.schema";
import { growthActions } from "./growth-actions.schema";
import { growthRecommendations } from "./growth-insights.schema";
import { growthSignals } from "./growth.schema";

export const growthAiBriefs = sqliteTable(
  "growth_ai_briefs",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    signalId: text("signal_id").notNull(),
    recommendationId: text("recommendation_id").notNull(),
    templateVersion: text("template_version").notNull(),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    generatedAt: text("generated_at").notNull(),
    affectedPageUrl: text("affected_page_url"),
    currentBusinessContext: text("current_business_context").notNull(),
    pageReadStatus: text("page_read_status").notNull(),
    requestedUrl: text("requested_url"),
    resolvedUrl: text("resolved_url"),
    businessRelevance: text("business_relevance").notNull(),
    title: text("title").notNull(),
    generatedMeasurementApproach: text(
      "generated_measurement_approach",
    ).notNull(),
    measurementApproach: text("measurement_approach").notNull(),
    proposalWriteKey: text("proposal_write_key"),
    version: integer("version").notNull().default(0),
    approvedActionId: text("approved_action_id"),
    approvedVersion: integer("approved_version"),
    approvedDueOn: text("approved_due_on"),
    approvedAt: text("approved_at"),
    approvedActorId: text("approved_actor_id"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (t) => [
    unique("growth_ai_briefs_project_id_key").on(t.projectId, t.id),
    unique("growth_ai_briefs_project_signal_key").on(t.projectId, t.signalId),
    foreignKey({
      columns: [t.projectId, t.signalId],
      foreignColumns: [growthSignals.projectId, growthSignals.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.projectId, t.recommendationId],
      foreignColumns: [
        growthRecommendations.projectId,
        growthRecommendations.id,
      ],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.projectId, t.approvedActionId],
      foreignColumns: [growthActions.projectId, growthActions.id],
    }).onDelete("cascade"),
    check(
      "growth_ai_briefs_approval_check",
      sql`(${t.approvedActionId} IS NULL AND ${t.approvedVersion} IS NULL AND ${t.approvedDueOn} IS NULL AND ${t.approvedAt} IS NULL AND ${t.approvedActorId} IS NULL) OR (${t.approvedActionId} IS NOT NULL AND ${t.approvedVersion} IS NOT NULL AND ${t.approvedDueOn} IS NOT NULL AND ${t.approvedAt} IS NOT NULL AND ${t.approvedActorId} IS NOT NULL)`,
    ),
  ],
);
export const growthAiBriefClaims = sqliteTable(
  "growth_ai_brief_claims",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    briefId: text("brief_id").notNull(),
    kind: text("kind").notNull(),
    ordinal: integer("ordinal").notNull(),
    statement: text("statement").notNull(),
    confidence: text("confidence"),
  },
  (t) => [
    unique("growth_ai_brief_claims_project_id_key").on(t.projectId, t.id),
    unique("growth_ai_brief_claims_project_brief_id_key").on(
      t.projectId,
      t.briefId,
      t.id,
    ),
    unique("growth_ai_brief_claims_key").on(
      t.projectId,
      t.briefId,
      t.kind,
      t.ordinal,
    ),
    foreignKey({
      columns: [t.projectId, t.briefId],
      foreignColumns: [growthAiBriefs.projectId, growthAiBriefs.id],
    }).onDelete("cascade"),
  ],
);
export const growthAiBriefCitationSources = sqliteTable(
  "growth_ai_brief_citation_sources",
  {
    projectId: text("project_id").notNull(),
    briefId: text("brief_id").notNull(),
    citationId: text("citation_id").notNull(),
    label: text("label").notNull(),
    source: text("source").notNull(),
    snapshot: text("snapshot"),
  },
  (t) => [
    unique("growth_ai_brief_citation_sources_key").on(
      t.projectId,
      t.briefId,
      t.citationId,
    ),
    foreignKey({
      columns: [t.projectId, t.briefId],
      foreignColumns: [growthAiBriefs.projectId, growthAiBriefs.id],
    }).onDelete("cascade"),
  ],
);
export const growthAiBriefCitations = sqliteTable(
  "growth_ai_brief_citations",
  {
    projectId: text("project_id").notNull(),
    briefId: text("brief_id").notNull(),
    claimId: text("claim_id").notNull(),
    citationId: text("citation_id").notNull(),
  },
  (t) => [
    unique("growth_ai_brief_citations_key").on(
      t.projectId,
      t.claimId,
      t.citationId,
    ),
    foreignKey({
      columns: [t.projectId, t.briefId, t.claimId],
      foreignColumns: [
        growthAiBriefClaims.projectId,
        growthAiBriefClaims.briefId,
        growthAiBriefClaims.id,
      ],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.projectId, t.briefId, t.citationId],
      foreignColumns: [
        growthAiBriefCitationSources.projectId,
        growthAiBriefCitationSources.briefId,
        growthAiBriefCitationSources.citationId,
      ],
    }).onDelete("cascade"),
  ],
);
export const growthAiBriefSteps = sqliteTable(
  "growth_ai_brief_steps",
  {
    projectId: text("project_id").notNull(),
    briefId: text("brief_id").notNull(),
    kind: text("kind").notNull(),
    ordinal: integer("ordinal").notNull(),
    content: text("content").notNull(),
  },
  (t) => [
    unique("growth_ai_brief_steps_key").on(
      t.projectId,
      t.briefId,
      t.kind,
      t.ordinal,
    ),
    foreignKey({
      columns: [t.projectId, t.briefId],
      foreignColumns: [growthAiBriefs.projectId, growthAiBriefs.id],
    }).onDelete("cascade"),
  ],
);
export const growthAiBriefCaveats = sqliteTable(
  "growth_ai_brief_caveats",
  {
    projectId: text("project_id").notNull(),
    briefId: text("brief_id").notNull(),
    ordinal: integer("ordinal").notNull(),
    content: text("content").notNull(),
  },
  (t) => [
    unique("growth_ai_brief_caveats_key").on(t.projectId, t.briefId, t.ordinal),
    foreignKey({
      columns: [t.projectId, t.briefId],
      foreignColumns: [growthAiBriefs.projectId, growthAiBriefs.id],
    }).onDelete("cascade"),
  ],
);
