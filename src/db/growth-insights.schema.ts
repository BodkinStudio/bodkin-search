import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  integer,
  real,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";
import { projects } from "./app.schema";
import { growthRuns, growthSignals } from "./growth.schema";

export const growthInsights = sqliteTable(
  "growth_insights",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    runId: text("run_id").notNull(),
    creationKey: text("creation_key").notNull(),
    factHash: text("fact_hash").notNull(),
    title: text("title").notNull(),
    explanation: text("explanation").notNull(),
    hypothesis: text("hypothesis").notNull(),
    confidence: real("confidence").notNull(),
    model: text("model"),
    promptVersion: text("prompt_version"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    unique("growth_insights_project_run_id_key").on(
      table.projectId,
      table.runId,
      table.id,
    ),
    unique("growth_insights_project_run_creation_key").on(
      table.projectId,
      table.runId,
      table.creationKey,
    ),
    foreignKey({
      columns: [table.projectId, table.runId],
      foreignColumns: [growthRuns.projectId, growthRuns.id],
      name: "growth_insights_project_run_fk",
    }).onDelete("cascade"),
    check(
      "growth_insights_confidence_check",
      sql`${table.confidence} BETWEEN 0 AND 1`,
    ),
    check(
      "growth_insights_model_prompt_check",
      sql`(${table.model} IS NULL) = (${table.promptVersion} IS NULL)`,
    ),
    check(
      "growth_insights_text_bounds_check",
      sql`length(${table.creationKey}) BETWEEN 1 AND 200 AND length(${table.factHash}) = 64 AND length(${table.title}) BETWEEN 1 AND 300 AND length(${table.explanation}) BETWEEN 1 AND 5000 AND length(${table.hypothesis}) BETWEEN 1 AND 5000`,
    ),
  ],
);

export const growthInsightSignals = sqliteTable(
  "growth_insight_signals",
  {
    projectId: text("project_id").notNull(),
    runId: text("run_id").notNull(),
    insightId: text("insight_id").notNull(),
    signalId: text("signal_id").notNull(),
  },
  (table) => [
    unique("growth_insight_signals_key").on(
      table.projectId,
      table.runId,
      table.insightId,
      table.signalId,
    ),
    foreignKey({
      columns: [table.projectId, table.runId, table.insightId],
      foreignColumns: [
        growthInsights.projectId,
        growthInsights.runId,
        growthInsights.id,
      ],
      name: "growth_insight_signals_insight_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.projectId, table.runId, table.signalId],
      foreignColumns: [
        growthSignals.projectId,
        growthSignals.runId,
        growthSignals.id,
      ],
      name: "growth_insight_signals_signal_fk",
    }).onDelete("cascade"),
  ],
);

export const growthRecommendations = sqliteTable(
  "growth_recommendations",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    runId: text("run_id").notNull(),
    creationKey: text("creation_key").notNull(),
    factHash: text("fact_hash").notNull(),
    title: text("title").notNull(),
    rationale: text("rationale").notNull(),
    category: text("category").notNull(),
    impact: integer("impact").notNull(),
    commercialRelevance: integer("commercial_relevance").notNull(),
    effort: integer("effort").notNull(),
    urgency: integer("urgency").notNull(),
    confidence: real("confidence").notNull(),
    priorityScore: real("priority_score").notNull(),
    model: text("model"),
    promptVersion: text("prompt_version"),
    status: text("status", {
      enum: [
        "proposed",
        "accepted",
        "dismissed",
        "snoozed",
        "merged",
        "superseded",
      ],
    })
      .notNull()
      .default("proposed"),
    reviewVersion: integer("review_version").notNull().default(0),
    snoozedUntil: text("snoozed_until"),
    dismissalReason: text("dismissal_reason"),
    resolutionRecommendationId: text("resolution_recommendation_id"),
    reviewedAt: text("reviewed_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    unique("growth_recommendations_project_id_key").on(
      table.projectId,
      table.id,
    ),
    unique("growth_recommendations_project_run_id_key").on(
      table.projectId,
      table.runId,
      table.id,
    ),
    unique("growth_recommendations_project_run_creation_key").on(
      table.projectId,
      table.runId,
      table.creationKey,
    ),
    foreignKey({
      columns: [table.projectId, table.runId],
      foreignColumns: [growthRuns.projectId, growthRuns.id],
      name: "growth_recommendations_project_run_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.projectId, table.runId, table.resolutionRecommendationId],
      foreignColumns: [table.projectId, table.runId, table.id],
      name: "growth_recommendations_resolution_fk",
    }).onDelete("no action"),
    check(
      "growth_recommendations_scores_check",
      sql`typeof(${table.impact}) = 'integer' AND typeof(${table.commercialRelevance}) = 'integer' AND typeof(${table.effort}) = 'integer' AND typeof(${table.urgency}) = 'integer' AND ${table.impact} BETWEEN 1 AND 5 AND ${table.commercialRelevance} BETWEEN 1 AND 5 AND ${table.effort} BETWEEN 1 AND 5 AND ${table.urgency} BETWEEN 1 AND 3 AND ${table.confidence} BETWEEN 0 AND 1 AND ${table.priorityScore} >= 0 AND typeof(${table.reviewVersion}) = 'integer' AND ${table.reviewVersion} >= 0`,
    ),
    check(
      "growth_recommendations_model_prompt_check",
      sql`(${table.model} IS NULL) = (${table.promptVersion} IS NULL)`,
    ),
    check(
      "growth_recommendations_text_bounds_check",
      sql`length(${table.creationKey}) BETWEEN 1 AND 200 AND length(${table.factHash}) = 64 AND length(${table.title}) BETWEEN 1 AND 300 AND length(${table.rationale}) BETWEEN 1 AND 5000 AND length(${table.category}) BETWEEN 1 AND 100`,
    ),
    check(
      "growth_recommendations_review_check",
      sql`(${table.status} = 'proposed' AND ${table.snoozedUntil} IS NULL AND ${table.dismissalReason} IS NULL AND ${table.resolutionRecommendationId} IS NULL) OR (${table.status} = 'accepted' AND ${table.snoozedUntil} IS NULL AND ${table.dismissalReason} IS NULL AND ${table.resolutionRecommendationId} IS NULL) OR (${table.status} = 'dismissed' AND ${table.snoozedUntil} IS NULL AND ${table.dismissalReason} IN ('irrelevant','already_planned','not_commercially_important','insufficient_evidence','wrong_diagnosis','too_much_effort','duplicate','defer') AND ${table.resolutionRecommendationId} IS NULL) OR (${table.status} = 'snoozed' AND ${table.snoozedUntil} IS NOT NULL AND ${table.dismissalReason} IS NULL AND ${table.resolutionRecommendationId} IS NULL) OR (${table.status} IN ('merged','superseded') AND ${table.snoozedUntil} IS NULL AND ${table.dismissalReason} IS NULL AND ${table.resolutionRecommendationId} IS NOT NULL AND ${table.resolutionRecommendationId} <> ${table.id})`,
    ),
  ],
);

export const growthRecommendationInsights = sqliteTable(
  "growth_recommendation_insights",
  {
    projectId: text("project_id").notNull(),
    runId: text("run_id").notNull(),
    recommendationId: text("recommendation_id").notNull(),
    insightId: text("insight_id").notNull(),
  },
  (table) => [
    unique("growth_recommendation_insights_key").on(
      table.projectId,
      table.runId,
      table.recommendationId,
      table.insightId,
    ),
    foreignKey({
      columns: [table.projectId, table.runId, table.recommendationId],
      foreignColumns: [
        growthRecommendations.projectId,
        growthRecommendations.runId,
        growthRecommendations.id,
      ],
      name: "growth_recommendation_insights_recommendation_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.projectId, table.runId, table.insightId],
      foreignColumns: [
        growthInsights.projectId,
        growthInsights.runId,
        growthInsights.id,
      ],
      name: "growth_recommendation_insights_insight_fk",
    }).onDelete("cascade"),
  ],
);

export const growthRecommendationTargets = sqliteTable(
  "growth_recommendation_targets",
  {
    projectId: text("project_id").notNull(),
    runId: text("run_id").notNull(),
    recommendationId: text("recommendation_id").notNull(),
    targetType: text("target_type", {
      enum: ["url", "keyword", "cluster", "site"],
    }).notNull(),
    targetValue: text("target_value").notNull(),
  },
  (table) => [
    unique("growth_recommendation_targets_key").on(
      table.projectId,
      table.runId,
      table.recommendationId,
      table.targetType,
      table.targetValue,
    ),
    foreignKey({
      columns: [table.projectId, table.runId, table.recommendationId],
      foreignColumns: [
        growthRecommendations.projectId,
        growthRecommendations.runId,
        growthRecommendations.id,
      ],
      name: "growth_recommendation_targets_recommendation_fk",
    }).onDelete("cascade"),
    check(
      "growth_recommendation_targets_text_check",
      sql`${table.targetType} IN ('url', 'keyword', 'cluster', 'site') AND length(${table.targetValue}) BETWEEN 1 AND 2000`,
    ),
  ],
);

export const growthRecommendationSteps = sqliteTable(
  "growth_recommendation_steps",
  {
    projectId: text("project_id").notNull(),
    runId: text("run_id").notNull(),
    recommendationId: text("recommendation_id").notNull(),
    position: integer("position").notNull(),
    content: text("content").notNull(),
  },
  (table) => [
    unique("growth_recommendation_steps_position_key").on(
      table.projectId,
      table.runId,
      table.recommendationId,
      table.position,
    ),
    foreignKey({
      columns: [table.projectId, table.runId, table.recommendationId],
      foreignColumns: [
        growthRecommendations.projectId,
        growthRecommendations.runId,
        growthRecommendations.id,
      ],
      name: "growth_recommendation_steps_recommendation_fk",
    }).onDelete("cascade"),
    check(
      "growth_recommendation_steps_bounds_check",
      sql`typeof(${table.position}) = 'integer' AND ${table.position} >= 0 AND length(${table.content}) BETWEEN 1 AND 2000`,
    ),
  ],
);
