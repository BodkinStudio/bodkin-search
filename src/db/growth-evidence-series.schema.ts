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
import { growthActionEvidence } from "./growth-actions.schema";

// The numbers behind one evidence statement, stored normalised so the plan can
// chart them and a reader can check them point by point.
export const growthEvidenceSeries = sqliteTable(
  "growth_evidence_series",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    evidenceId: text("evidence_id").notNull(),
    kind: text("kind", { enum: ["monthly", "bars", "matrix"] }).notNull(),
    title: text("title").notNull(),
    unit: text("unit").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    unique("growth_evidence_series_project_id_key").on(
      table.projectId,
      table.id,
    ),
    // One series per evidence item.
    unique("growth_evidence_series_evidence_key").on(
      table.projectId,
      table.evidenceId,
    ),
    foreignKey({
      columns: [table.projectId, table.evidenceId],
      foreignColumns: [growthActionEvidence.projectId, growthActionEvidence.id],
      name: "growth_evidence_series_project_evidence_fk",
    }).onDelete("cascade"),
    check(
      "growth_evidence_series_text_check",
      sql`length(${table.title}) BETWEEN 1 AND 200 AND length(${table.unit}) BETWEEN 1 AND 50`,
    ),
    check(
      "growth_evidence_series_shape_check",
      sql`${table.kind} IN ('monthly','bars','matrix')`,
    ),
  ],
);

export const growthEvidencePoints = sqliteTable(
  "growth_evidence_points",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    seriesId: text("series_id").notNull(),
    position: integer("position").notNull(),
    label: text("label").notNull(),
    groupLabel: text("group_label"),
    value: real("value"),
  },
  (table) => [
    unique("growth_evidence_points_position_key").on(
      table.projectId,
      table.seriesId,
      table.position,
    ),
    foreignKey({
      columns: [table.projectId, table.seriesId],
      foreignColumns: [growthEvidenceSeries.projectId, growthEvidenceSeries.id],
      name: "growth_evidence_points_project_series_fk",
    }).onDelete("cascade"),
    check(
      "growth_evidence_points_text_check",
      sql`length(${table.label}) BETWEEN 1 AND 100 AND (${table.groupLabel} IS NULL OR length(${table.groupLabel}) BETWEEN 1 AND 100)`,
    ),
    check(
      "growth_evidence_points_shape_check",
      sql`typeof(${table.position}) = 'integer' AND ${table.position} >= 1`,
    ),
  ],
);
