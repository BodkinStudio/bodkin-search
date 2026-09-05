import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { projects } from "./app.schema";

const isoNow = sql`to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

// PostgreSQL mirror of the project-keyed Growth settings table. Keep this
// structurally interchangeable with ../growth.schema.ts.
export const growthProjectSettings = pgTable(
  "growth_project_settings",
  {
    projectId: text("project_id")
      .primaryKey()
      .references(() => projects.id, { onDelete: "cascade" }),
    growthEnabled: boolean("growth_enabled").notNull().default(false),
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
    // Monotonic scheduler concurrency token. Timestamps are not safe version
    // identifiers because distinct writes can occur in the same millisecond.
    settingsRevision: integer("settings_revision").notNull().default(1),
    defaultBaselineDays: integer("default_baseline_days").notNull().default(28),
    defaultCooldownDays: integer("default_cooldown_days").notNull().default(7),
    defaultPrimaryWindowDays: integer("default_primary_window_days")
      .notNull()
      .default(28),
    defaultLongWindowDays: integer("default_long_window_days").default(55),
    createdAt: text("created_at").notNull().default(isoNow),
    updatedAt: text("updated_at").notNull().default(isoNow),
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

export const growthRuns = pgTable(
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
      sql`${table.providerCostMinor} IS NULL OR ${table.providerCostMinor} >= 0`,
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

export const growthSignals = pgTable(
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
    confidence: doublePrecision("confidence").notNull(),
    periodStart: text("period_start").notNull(),
    periodEnd: text("period_end").notNull(),
    baselineValue: doublePrecision("baseline_value").notNull(),
    currentValue: doublePrecision("current_value").notNull(),
    deltaValue: doublePrecision("delta_value").notNull(),
    deltaPercent: doublePrecision("delta_percent"),
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
    createdAt: text("created_at").notNull().default(isoNow),
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
    uniqueIndex("growth_signals_project_run_id_key").on(
      table.projectId,
      table.runId,
      table.id,
    ),
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
