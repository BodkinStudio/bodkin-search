import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  real,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";
import { projects } from "./app.schema";
import { growthActions } from "./growth-actions.schema";
import { growthChangeEvents } from "./growth-change-events.schema";

export const growthMeasurementPlans = sqliteTable(
  "growth_measurement_plans",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    actionId: text("action_id").notNull(),
    factHash: text("fact_hash").notNull(),
    status: text("status", { enum: ["active", "completed"] })
      .notNull()
      .default("active"),
    actionVersion: integer("action_version").notNull(),
    anchorAt: text("anchor_at").notNull(),
    anchorDate: text("anchor_date").notNull(),
    reportTimezone: text("report_timezone").notNull(),
    baselineStart: text("baseline_start").notNull(),
    baselineEnd: text("baseline_end").notNull(),
    cooldownEnd: text("cooldown_end").notNull(),
    measurementStart: text("measurement_start").notNull(),
    measurementEnd: text("measurement_end").notNull(),
    longMeasurementEnd: text("long_measurement_end"),
    comparisonMode: text("comparison_mode", {
      enum: ["preceding_period", "year_over_year", "custom"],
    }).notNull(),
    completedAt: text("completed_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    unique("growth_measurement_plans_project_id_key").on(
      table.projectId,
      table.id,
    ),
    unique("growth_measurement_plans_project_action_key").on(
      table.projectId,
      table.actionId,
    ),
    index("growth_measurement_plans_project_status_due_idx").on(
      table.projectId,
      table.status,
      table.longMeasurementEnd,
      table.measurementEnd,
    ),
    foreignKey({
      columns: [table.projectId, table.actionId],
      foreignColumns: [growthActions.projectId, growthActions.id],
      name: "growth_measurement_plans_project_action_fk",
    }).onDelete("cascade"),
    check(
      "growth_measurement_plans_vocabulary_check",
      sql`${table.status} IN ('active','completed') AND ${table.comparisonMode} IN ('preceding_period','year_over_year','custom')`,
    ),
    check(
      "growth_measurement_plans_text_bounds_check",
      sql`length(${table.id}) BETWEEN 1 AND 100 AND length(${table.actionId}) BETWEEN 1 AND 100 AND length(${table.factHash}) = 64 AND length(${table.reportTimezone}) BETWEEN 1 AND 100 AND length(${table.anchorAt}) BETWEEN 20 AND 50 AND (${table.completedAt} IS NULL OR length(${table.completedAt}) BETWEEN 20 AND 50)`,
    ),
    check(
      "growth_measurement_plans_action_version_check",
      sql`typeof(${table.actionVersion}) = 'integer' AND ${table.actionVersion} > 0`,
    ),
    check(
      "growth_measurement_plans_dates_check",
      sql`length(${table.anchorDate}) = 10 AND length(${table.baselineStart}) = 10 AND length(${table.baselineEnd}) = 10 AND length(${table.cooldownEnd}) = 10 AND length(${table.measurementStart}) = 10 AND length(${table.measurementEnd}) = 10 AND (${table.longMeasurementEnd} IS NULL OR length(${table.longMeasurementEnd}) = 10) AND ${table.baselineStart} <= ${table.baselineEnd} AND ${table.baselineEnd} < ${table.anchorDate} AND ${table.anchorDate} <= ${table.cooldownEnd} AND ${table.cooldownEnd} < ${table.measurementStart} AND ${table.measurementStart} <= ${table.measurementEnd} AND (${table.longMeasurementEnd} IS NULL OR ${table.measurementEnd} < ${table.longMeasurementEnd})`,
    ),
    check(
      "growth_measurement_plans_lifecycle_check",
      sql`(${table.status} = 'active' AND ${table.completedAt} IS NULL) OR (${table.status} = 'completed' AND ${table.completedAt} IS NOT NULL AND ${table.completedAt} >= ${table.anchorAt})`,
    ),
  ],
);

export const growthMeasurementMetrics = sqliteTable(
  "growth_measurement_metrics",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    measurementPlanId: text("measurement_plan_id").notNull(),
    metricType: text("metric_type", {
      enum: [
        "search_clicks",
        "search_impressions",
        "search_ctr",
        "search_average_position",
        "organic_sessions",
        "organic_active_users",
        "organic_engagement_rate",
        "organic_key_events",
        "backlink_count",
        "referring_domain_count",
        "audit_issue_page_count",
      ],
    }).notNull(),
    entityType: text("entity_type", {
      enum: ["site", "url", "keyword", "cluster"],
    }).notNull(),
    entityKey: text("entity_key").notNull(),
    isPrimary: integer("is_primary", { mode: "boolean" }).notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    unique("growth_measurement_metrics_project_plan_id_key").on(
      table.projectId,
      table.measurementPlanId,
      table.id,
    ),
    unique("growth_measurement_metrics_semantic_key").on(
      table.projectId,
      table.measurementPlanId,
      table.metricType,
      table.entityType,
      table.entityKey,
    ),
    foreignKey({
      columns: [table.projectId, table.measurementPlanId],
      foreignColumns: [
        growthMeasurementPlans.projectId,
        growthMeasurementPlans.id,
      ],
      name: "growth_measurement_metrics_project_plan_fk",
    }).onDelete("cascade"),
    check(
      "growth_measurement_metrics_vocabulary_check",
      sql`${table.metricType} IN ('search_clicks','search_impressions','search_ctr','search_average_position','organic_sessions','organic_active_users','organic_engagement_rate','organic_key_events','backlink_count','referring_domain_count','audit_issue_page_count') AND ${table.entityType} IN ('site','url','keyword','cluster')`,
    ),
    check(
      "growth_measurement_metrics_text_bounds_check",
      sql`length(${table.id}) BETWEEN 1 AND 100 AND length(${table.measurementPlanId}) BETWEEN 1 AND 100 AND length(${table.entityKey}) BETWEEN 1 AND 2000`,
    ),
    check(
      "growth_measurement_metrics_primary_check",
      sql`typeof(${table.isPrimary}) = 'integer' AND ${table.isPrimary} IN (0, 1)`,
    ),
  ],
);

export const growthMeasurementObservations = sqliteTable(
  "growth_measurement_observations",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    measurementPlanId: text("measurement_plan_id").notNull(),
    metricId: text("metric_id").notNull(),
    periodType: text("period_type", {
      enum: ["baseline", "measurement", "long_term"],
    }).notNull(),
    factHash: text("fact_hash").notNull(),
    effectiveStart: text("effective_start").notNull(),
    effectiveEnd: text("effective_end").notNull(),
    value: real("value").notNull(),
    completeness: real("completeness").notNull(),
    evidenceKind: text("evidence_kind", {
      enum: [
        "gsc_period",
        "ga4_period",
        "rank_snapshot",
        "audit_result",
        "backlink_snapshot",
        "manual_observation",
      ],
    }).notNull(),
    evidenceRef: text("evidence_ref").notNull(),
    capturedAt: text("captured_at").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    unique("growth_measurement_observations_coordinate_key").on(
      table.projectId,
      table.measurementPlanId,
      table.metricId,
      table.periodType,
    ),
    index("growth_measurement_observations_project_plan_idx").on(
      table.projectId,
      table.measurementPlanId,
      table.capturedAt,
    ),
    foreignKey({
      columns: [table.projectId, table.measurementPlanId, table.metricId],
      foreignColumns: [
        growthMeasurementMetrics.projectId,
        growthMeasurementMetrics.measurementPlanId,
        growthMeasurementMetrics.id,
      ],
      name: "growth_measurement_observations_project_metric_fk",
    }).onDelete("cascade"),
    check(
      "growth_measurement_observations_vocabulary_check",
      sql`${table.periodType} IN ('baseline','measurement','long_term') AND ${table.evidenceKind} IN ('gsc_period','ga4_period','rank_snapshot','audit_result','backlink_snapshot','manual_observation')`,
    ),
    check(
      "growth_measurement_observations_text_bounds_check",
      sql`length(${table.id}) BETWEEN 1 AND 100 AND length(${table.measurementPlanId}) BETWEEN 1 AND 100 AND length(${table.metricId}) BETWEEN 1 AND 100 AND length(${table.factHash}) = 64 AND length(${table.evidenceRef}) BETWEEN 1 AND 500 AND length(${table.capturedAt}) BETWEEN 20 AND 50`,
    ),
    check(
      "growth_measurement_observations_dates_check",
      sql`length(${table.effectiveStart}) = 10 AND length(${table.effectiveEnd}) = 10 AND ${table.effectiveStart} <= ${table.effectiveEnd}`,
    ),
    check(
      "growth_measurement_observations_value_check",
      sql`typeof(${table.value}) IN ('integer','real') AND ${table.value} > -1e999 AND ${table.value} < 1e999`,
    ),
    check(
      "growth_measurement_observations_completeness_check",
      sql`typeof(${table.completeness}) IN ('integer','real') AND ${table.completeness} BETWEEN 0 AND 1`,
    ),
  ],
);

export const growthMeasurementResults = sqliteTable(
  "growth_measurement_results",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    measurementPlanId: text("measurement_plan_id").notNull(),
    factHash: text("fact_hash").notNull(),
    observationsHash: text("observations_hash").notNull(),
    outcome: text("outcome", {
      enum: [
        "strong_positive",
        "positive",
        "inconclusive",
        "neutral",
        "negative",
        "strong_negative",
        "not_measurable",
      ],
    }).notNull(),
    confidence: real("confidence").notNull(),
    summary: text("summary").notNull(),
    evaluatedAt: text("evaluated_at").notNull(),
    model: text("model"),
    promptVersion: text("prompt_version"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    unique("growth_measurement_results_project_id_key").on(
      table.projectId,
      table.id,
    ),
    unique("growth_measurement_results_project_plan_key").on(
      table.projectId,
      table.measurementPlanId,
    ),
    foreignKey({
      columns: [table.projectId, table.measurementPlanId],
      foreignColumns: [
        growthMeasurementPlans.projectId,
        growthMeasurementPlans.id,
      ],
      name: "growth_measurement_results_project_plan_fk",
    }).onDelete("cascade"),
    check(
      "growth_measurement_results_vocabulary_check",
      sql`${table.outcome} IN ('strong_positive','positive','inconclusive','neutral','negative','strong_negative','not_measurable')`,
    ),
    check(
      "growth_measurement_results_text_bounds_check",
      sql`length(${table.id}) BETWEEN 1 AND 100 AND length(${table.measurementPlanId}) BETWEEN 1 AND 100 AND length(${table.factHash}) = 64 AND length(${table.observationsHash}) = 64 AND length(${table.summary}) BETWEEN 1 AND 5000 AND length(${table.evaluatedAt}) BETWEEN 20 AND 50 AND (${table.model} IS NULL OR length(${table.model}) BETWEEN 1 AND 200) AND (${table.promptVersion} IS NULL OR length(${table.promptVersion}) BETWEEN 1 AND 100)`,
    ),
    check(
      "growth_measurement_results_confidence_check",
      sql`typeof(${table.confidence}) IN ('integer','real') AND ${table.confidence} BETWEEN 0 AND 1`,
    ),
    check(
      "growth_measurement_results_model_prompt_check",
      sql`(${table.model} IS NULL AND ${table.promptVersion} IS NULL) OR (${table.model} IS NOT NULL AND ${table.promptVersion} IS NOT NULL)`,
    ),
  ],
);

export const growthMeasurementResultChanges = sqliteTable(
  "growth_measurement_result_changes",
  {
    projectId: text("project_id").notNull(),
    measurementResultId: text("measurement_result_id").notNull(),
    changeEventId: text("change_event_id").notNull(),
  },
  (table) => [
    unique("growth_measurement_result_changes_key").on(
      table.projectId,
      table.measurementResultId,
      table.changeEventId,
    ),
    index("growth_measurement_result_changes_project_event_idx").on(
      table.projectId,
      table.changeEventId,
    ),
    foreignKey({
      columns: [table.projectId, table.measurementResultId],
      foreignColumns: [
        growthMeasurementResults.projectId,
        growthMeasurementResults.id,
      ],
      name: "growth_measurement_result_changes_project_result_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.projectId, table.changeEventId],
      foreignColumns: [growthChangeEvents.projectId, growthChangeEvents.id],
      name: "growth_measurement_result_changes_project_event_fk",
    }).onDelete("cascade"),
    check(
      "growth_measurement_result_changes_text_bounds_check",
      sql`length(${table.measurementResultId}) BETWEEN 1 AND 100 AND length(${table.changeEventId}) BETWEEN 1 AND 100`,
    ),
  ],
);
