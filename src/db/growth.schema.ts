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
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { projects } from "./app.schema";

// One operational Growth settings row per OpenSEO project. Qualitative project
// context, competitors and key pages keep their existing canonical tables.
export const growthProjectSettings = sqliteTable(
  "growth_project_settings",
  {
    projectId: text("project_id")
      .primaryKey()
      .references(() => projects.id, { onDelete: "cascade" }),
    growthEnabled: integer("growth_enabled", { mode: "boolean" })
      .notNull()
      .default(false),
    reportTimezone: text("report_timezone").notNull().default("UTC"),
    reportCadence: text("report_cadence", {
      enum: ["weekly", "monthly"],
    })
      .notNull()
      .default("monthly"),
    reportDay: integer("report_day").notNull().default(1),
    // Internal scheduler cursor. Null is also the lazy-backfill state for
    // Growth settings created before scheduled monthly reviews shipped.
    nextMonthlyReviewAt: text("next_monthly_review_at"),
    // Separate cursor because weekly cadence follows an ISO weekday rather
    // than a day-of-month boundary.
    nextWeeklyReviewAt: text("next_weekly_review_at"),
    // Monotonic scheduler concurrency token. Timestamps are not safe version
    // identifiers because distinct writes can occur in the same millisecond.
    settingsRevision: integer("settings_revision").notNull().default(1),
    defaultBaselineDays: integer("default_baseline_days").notNull().default(28),
    defaultCooldownDays: integer("default_cooldown_days").notNull().default(7),
    defaultPrimaryWindowDays: integer("default_primary_window_days")
      .notNull()
      .default(28),
    // Null disables the optional long measurement window.
    defaultLongWindowDays: integer("default_long_window_days").default(55),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    check(
      "growth_project_settings_report_schedule_check",
      sql`(${table.reportCadence} = 'weekly' AND ${table.reportDay} BETWEEN 1 AND 7) OR (${table.reportCadence} = 'monthly' AND ${table.reportDay} BETWEEN 1 AND 28)`,
    ),
    index("growth_project_settings_monthly_due_idx").on(
      table.growthEnabled,
      table.reportCadence,
      table.nextMonthlyReviewAt,
      table.projectId,
    ),
    index("growth_project_settings_weekly_due_idx").on(
      table.growthEnabled,
      table.reportCadence,
      table.nextWeeklyReviewAt,
      table.projectId,
    ),
    check(
      "growth_project_settings_revision_check",
      sql`${table.settingsRevision} >= 1`,
    ),
    check(
      "growth_project_settings_baseline_days_check",
      sql`${table.defaultBaselineDays} BETWEEN 1 AND 365`,
    ),
    check(
      "growth_project_settings_cooldown_days_check",
      sql`${table.defaultCooldownDays} BETWEEN 0 AND 365`,
    ),
    check(
      "growth_project_settings_primary_window_days_check",
      sql`${table.defaultPrimaryWindowDays} BETWEEN 1 AND 365`,
    ),
    check(
      "growth_project_settings_long_window_days_check",
      sql`${table.defaultLongWindowDays} IS NULL OR ${table.defaultLongWindowDays} BETWEEN 1 AND 365`,
    ),
  ],
);

export const growthRuns = sqliteTable(
  "growth_runs",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    runType: text("run_type", {
      enum: [
        "daily_monitor",
        "weekly_review",
        "monthly_review",
        "measurement_review",
        "manual_analysis",
      ],
    }).notNull(),
    trigger: text("trigger", { enum: ["manual", "scheduled"] }).notNull(),
    status: text("status", {
      enum: ["running", "completed", "completed_with_errors", "failed"],
    }).notNull(),
    cadenceSlot: text("cadence_slot").notNull(),
    periodStart: text("period_start").notNull(),
    periodEnd: text("period_end").notNull(),
    startedAt: text("started_at").notNull(),
    completedAt: text("completed_at"),
    detectorVersion: text("detector_version").notNull(),
    analysisVersion: text("analysis_version"),
    model: text("model"),
    promptVersion: text("prompt_version"),
    providerCostMinor: integer("provider_cost_minor"),
    failureCode: text("failure_code"),
    failureMessage: text("failure_message"),
  },
  (table) => [
    unique("growth_runs_project_id_key").on(table.projectId, table.id),
    uniqueIndex("growth_runs_project_type_slot_idx").on(
      table.projectId,
      table.runType,
      table.cadenceSlot,
    ),
    index("growth_runs_project_started_idx").on(
      table.projectId,
      table.startedAt,
    ),
    check(
      "growth_runs_period_check",
      sql`${table.periodStart} <= ${table.periodEnd} AND length(${table.periodStart}) = 10 AND length(${table.periodEnd}) = 10`,
    ),
    check(
      "growth_runs_vocabulary_check",
      sql`${table.runType} IN ('daily_monitor', 'weekly_review', 'monthly_review', 'measurement_review', 'manual_analysis') AND ${table.trigger} IN ('manual', 'scheduled') AND ${table.status} IN ('running', 'completed', 'completed_with_errors', 'failed')`,
    ),
    check(
      "growth_runs_provider_cost_check",
      sql`${table.providerCostMinor} IS NULL OR (typeof(${table.providerCostMinor}) = 'integer' AND ${table.providerCostMinor} >= 0)`,
    ),
    check(
      "growth_runs_failure_check",
      sql`(${table.status} = 'running' AND ${table.completedAt} IS NULL AND ${table.failureCode} IS NULL AND ${table.failureMessage} IS NULL) OR (${table.status} = 'completed' AND ${table.completedAt} IS NOT NULL AND ${table.failureCode} IS NULL AND ${table.failureMessage} IS NULL) OR (${table.status} IN ('completed_with_errors', 'failed') AND ${table.completedAt} IS NOT NULL AND length(${table.failureCode}) BETWEEN 1 AND 100 AND length(${table.failureMessage}) BETWEEN 1 AND 1000)`,
    ),
    check(
      "growth_runs_completion_time_check",
      sql`${table.completedAt} IS NULL OR ${table.completedAt} >= ${table.startedAt}`,
    ),
  ],
);

export const growthSignals = sqliteTable(
  "growth_signals",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    runId: text("run_id").notNull(),
    signalType: text("signal_type").notNull(),
    entityType: text("entity_type").notNull(),
    entityRef: text("entity_ref").notNull(),
    metric: text("metric").notNull(),
    severity: text("severity", {
      enum: ["info", "warning", "critical"],
    }).notNull(),
    confidence: real("confidence").notNull(),
    periodStart: text("period_start").notNull(),
    periodEnd: text("period_end").notNull(),
    baselineValue: real("baseline_value").notNull(),
    currentValue: real("current_value").notNull(),
    deltaValue: real("delta_value").notNull(),
    deltaPercent: real("delta_percent"),
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
    foreignKey({
      columns: [table.projectId, table.runId],
      foreignColumns: [growthRuns.projectId, growthRuns.id],
      name: "growth_signals_project_run_fk",
    }).onDelete("cascade"),
    index("growth_signals_project_run_created_idx").on(
      table.projectId,
      table.runId,
      table.createdAt,
    ),
    // Added separately from the original Signal table so deployed D1 databases
    // gain the composite FK parent key without a table rebuild.
    uniqueIndex("growth_signals_project_run_id_key").on(
      table.projectId,
      table.runId,
      table.id,
    ),
    uniqueIndex("growth_signals_project_id_key").on(table.projectId, table.id),
    check(
      "growth_signals_period_check",
      sql`${table.periodStart} <= ${table.periodEnd} AND length(${table.periodStart}) = 10 AND length(${table.periodEnd}) = 10`,
    ),
    check(
      "growth_signals_confidence_check",
      sql`${table.confidence} BETWEEN 0 AND 1`,
    ),
    check(
      "growth_signals_severity_check",
      sql`${table.severity} IN ('info', 'warning', 'critical')`,
    ),
    check(
      "growth_signals_evidence_kind_check",
      sql`${table.evidenceKind} IN ('gsc_period', 'ga4_period', 'rank_snapshot', 'audit_result', 'backlink_snapshot', 'manual_observation')`,
    ),
    check(
      "growth_signals_text_bounds_check",
      sql`length(${table.signalType}) BETWEEN 1 AND 100 AND length(${table.entityType}) BETWEEN 1 AND 100 AND length(${table.entityRef}) BETWEEN 1 AND 500 AND length(${table.metric}) BETWEEN 1 AND 200 AND length(${table.evidenceRef}) BETWEEN 1 AND 500`,
    ),
  ],
);

// Immutable, operator-recorded assertions for an exact completed monthly
// review. A project-scoped request key makes network retries idempotent while
// allowing later observations with a fresh key.
export const growthMonthlyCycleOperatorObservations = sqliteTable(
  "growth_monthly_cycle_operator_observations",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    runId: text("run_id").notNull(),
    requestKey: text("request_key").notNull(),
    preparation: text("preparation", {
      enum: ["not_assessed", "none", "minor", "substantial"],
    }).notNull(),
    failure: text("failure", {
      enum: ["not_assessed", "none_observed", "explained", "unexplained"],
    }).notNull(),
    duplicateSpam: text("duplicate_spam", {
      enum: ["not_assessed", "not_observed", "observed"],
    }).notNull(),
    note: text("note"),
    reviewerId: text("reviewer_id").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.projectId, table.runId],
      foreignColumns: [growthRuns.projectId, growthRuns.id],
      name: "growth_monthly_cycle_operator_observations_project_run_fk",
    }).onDelete("cascade"),
    unique("growth_monthly_cycle_operator_observations_project_request_key").on(
      table.projectId,
      table.requestKey,
    ),
    index("growth_monthly_cycle_operator_observations_latest_idx").on(
      table.projectId,
      table.runId,
      table.createdAt,
      table.id,
    ),
    check(
      "growth_monthly_cycle_operator_observations_text_bounds_check",
      sql`length(${table.id}) BETWEEN 1 AND 100 AND length(${table.requestKey}) BETWEEN 1 AND 100 AND length(${table.reviewerId}) BETWEEN 1 AND 200 AND (${table.note} IS NULL OR length(${table.note}) BETWEEN 1 AND 2000)`,
    ),
    check(
      "growth_monthly_cycle_operator_observations_values_check",
      sql`${table.preparation} IN ('not_assessed', 'none', 'minor', 'substantial') AND ${table.failure} IN ('not_assessed', 'none_observed', 'explained', 'unexplained') AND ${table.duplicateSpam} IN ('not_assessed', 'not_observed', 'observed')`,
    ),
  ],
);
