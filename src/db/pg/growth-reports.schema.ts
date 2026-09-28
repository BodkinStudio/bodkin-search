import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  unique,
} from "drizzle-orm/pg-core";
import { projects } from "./app.schema";
import { growthActions } from "./growth-actions.schema";
import { growthMeasurementResults } from "./growth-measurements.schema";

const isoNow = sql`to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

// Keep these tables structurally interchangeable with ../growth-reports.schema.ts.
export const growthReports = pgTable(
  "growth_reports",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    factHash: text("fact_hash").notNull(),
    reportType: text("report_type", { enum: ["monthly"] }).notNull(),
    periodStart: text("period_start").notNull(),
    periodEnd: text("period_end").notNull(),
    version: integer("version").notNull(),
    status: text("status", { enum: ["draft", "published"] })
      .notNull()
      .default("draft"),
    reportTimezone: text("report_timezone").notNull(),
    dataCutoffAt: text("data_cutoff_at").notNull(),
    generatedAt: text("generated_at").notNull(),
    builderVersion: text("builder_version").notNull(),
    contentSchemaVersion: integer("content_schema_version").notNull(),
    createdByType: text("created_by_type", {
      enum: ["user", "agent", "system"],
    }).notNull(),
    createdById: text("created_by_id").notNull(),
    publishedAt: text("published_at"),
    publishedByType: text("published_by_type", {
      enum: ["user", "agent", "system"],
    }),
    publishedById: text("published_by_id"),
    createdAt: text("created_at").notNull().default(isoNow),
  },
  (table) => [
    unique("growth_reports_project_id_key").on(table.projectId, table.id),
    unique("growth_reports_family_version_key").on(
      table.projectId,
      table.reportType,
      table.periodStart,
      table.periodEnd,
      table.version,
    ),
    index("growth_reports_project_status_period_idx").on(
      table.projectId,
      table.status,
      table.periodEnd,
      table.version,
    ),
    check(
      "growth_reports_vocabulary_check",
      sql`${table.reportType} = 'monthly' AND ${table.status} IN ('draft','published') AND ${table.createdByType} IN ('user','agent','system') AND (${table.publishedByType} IS NULL OR ${table.publishedByType} IN ('user','agent','system'))`,
    ),
    check(
      "growth_reports_text_bounds_check",
      sql`length(${table.id}) BETWEEN 1 AND 100 AND length(${table.factHash}) = 64 AND length(${table.reportTimezone}) BETWEEN 1 AND 100 AND length(${table.dataCutoffAt}) BETWEEN 20 AND 50 AND length(${table.generatedAt}) BETWEEN 20 AND 50 AND length(${table.builderVersion}) BETWEEN 1 AND 100 AND length(${table.createdById}) BETWEEN 1 AND 200 AND (${table.publishedAt} IS NULL OR length(${table.publishedAt}) BETWEEN 20 AND 50) AND (${table.publishedById} IS NULL OR length(${table.publishedById}) BETWEEN 1 AND 200)`,
    ),
    check(
      "growth_reports_version_check",
      sql`${table.version} > 0 AND ${table.contentSchemaVersion} = 1`,
    ),
    check(
      "growth_reports_period_check",
      sql`length(${table.periodStart}) = 10 AND length(${table.periodEnd}) = 10 AND ${table.periodStart} <= ${table.periodEnd} AND ${table.dataCutoffAt} <= ${table.generatedAt}`,
    ),
    check(
      "growth_reports_lifecycle_check",
      sql`(${table.status} = 'draft' AND ${table.publishedAt} IS NULL AND ${table.publishedByType} IS NULL AND ${table.publishedById} IS NULL) OR (${table.status} = 'published' AND ${table.publishedAt} IS NOT NULL AND ${table.publishedAt} >= ${table.generatedAt} AND ${table.publishedByType} IS NOT NULL AND ${table.publishedById} IS NOT NULL)`,
    ),
  ],
);

export const growthReportSections = pgTable(
  "growth_report_sections",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    reportId: text("report_id").notNull(),
    sectionType: text("section_type", {
      enum: [
        "executive_summary",
        "performance",
        "meaningful_changes",
        "work_completed",
        "results_from_earlier_work",
        "risks",
        "opportunities",
        "next_month",
      ],
    }).notNull(),
    position: integer("position").notNull(),
    structuredContent: text("structured_content").notNull(),
    createdAt: text("created_at").notNull().default(isoNow),
  },
  (table) => [
    unique("growth_report_sections_project_report_id_key").on(
      table.projectId,
      table.reportId,
      table.id,
    ),
    unique("growth_report_sections_project_report_type_key").on(
      table.projectId,
      table.reportId,
      table.sectionType,
    ),
    unique("growth_report_sections_project_report_position_key").on(
      table.projectId,
      table.reportId,
      table.position,
    ),
    foreignKey({
      columns: [table.projectId, table.reportId],
      foreignColumns: [growthReports.projectId, growthReports.id],
      name: "growth_report_sections_project_report_fk",
    }).onDelete("cascade"),
    check(
      "growth_report_sections_vocabulary_check",
      sql`${table.sectionType} IN ('executive_summary','performance','meaningful_changes','work_completed','results_from_earlier_work','risks','opportunities','next_month')`,
    ),
    check(
      "growth_report_sections_position_check",
      sql`(${table.position} = 0 AND ${table.sectionType} = 'executive_summary') OR (${table.position} = 1 AND ${table.sectionType} = 'performance') OR (${table.position} = 2 AND ${table.sectionType} = 'meaningful_changes') OR (${table.position} = 3 AND ${table.sectionType} = 'work_completed') OR (${table.position} = 4 AND ${table.sectionType} = 'results_from_earlier_work') OR (${table.position} = 5 AND ${table.sectionType} = 'risks') OR (${table.position} = 6 AND ${table.sectionType} = 'opportunities') OR (${table.position} = 7 AND ${table.sectionType} = 'next_month')`,
    ),
    check(
      "growth_report_sections_text_bounds_check",
      sql`length(${table.id}) BETWEEN 1 AND 100 AND length(${table.reportId}) BETWEEN 1 AND 100 AND octet_length(${table.structuredContent}) BETWEEN 1 AND 65536`,
    ),
    check(
      "growth_report_sections_content_json_check",
      sql`${table.structuredContent}::jsonb IS NOT NULL`,
    ),
  ],
);

export const growthReportActions = pgTable(
  "growth_report_actions",
  {
    projectId: text("project_id").notNull(),
    reportId: text("report_id").notNull(),
    actionId: text("action_id").notNull(),
  },
  (table) => [
    unique("growth_report_actions_key").on(
      table.projectId,
      table.reportId,
      table.actionId,
    ),
    index("growth_report_actions_project_action_idx").on(
      table.projectId,
      table.actionId,
    ),
    foreignKey({
      columns: [table.projectId, table.reportId],
      foreignColumns: [growthReports.projectId, growthReports.id],
      name: "growth_report_actions_project_report_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.projectId, table.actionId],
      foreignColumns: [growthActions.projectId, growthActions.id],
      name: "growth_report_actions_project_action_fk",
    }).onDelete("cascade"),
    check(
      "growth_report_actions_text_bounds_check",
      sql`length(${table.reportId}) BETWEEN 1 AND 100 AND length(${table.actionId}) BETWEEN 1 AND 100`,
    ),
  ],
);

export const growthReportMeasurementResults = pgTable(
  "growth_report_measurement_results",
  {
    projectId: text("project_id").notNull(),
    reportId: text("report_id").notNull(),
    measurementResultId: text("measurement_result_id").notNull(),
  },
  (table) => [
    unique("growth_report_measurement_results_key").on(
      table.projectId,
      table.reportId,
      table.measurementResultId,
    ),
    index("growth_report_measurement_results_project_result_idx").on(
      table.projectId,
      table.measurementResultId,
    ),
    foreignKey({
      columns: [table.projectId, table.reportId],
      foreignColumns: [growthReports.projectId, growthReports.id],
      name: "growth_report_measurement_results_project_report_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.projectId, table.measurementResultId],
      foreignColumns: [
        growthMeasurementResults.projectId,
        growthMeasurementResults.id,
      ],
      name: "growth_report_measurement_results_project_result_fk",
    }).onDelete("cascade"),
    check(
      "growth_report_measurement_results_text_bounds_check",
      sql`length(${table.reportId}) BETWEEN 1 AND 100 AND length(${table.measurementResultId}) BETWEEN 1 AND 100`,
    ),
  ],
);
