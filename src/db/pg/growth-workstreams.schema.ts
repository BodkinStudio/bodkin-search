import { sql } from "drizzle-orm";
import {
  check,
  doublePrecision,
  integer,
  pgTable,
  text,
  unique,
} from "drizzle-orm/pg-core";
import { projects } from "./app.schema";

const isoNow = sql`to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

// Keep this table structurally interchangeable with ../growth-workstreams.schema.ts.
export const growthWorkstreams = pgTable(
  "growth_workstreams",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    creationKey: text("creation_key"),
    position: integer("position").notNull(),
    title: text("title").notNull(),
    commercialReason: text("commercial_reason").notNull(),
    status: text("status", { enum: ["active", "done", "dropped"] })
      .notNull()
      .default("active"),
    targetLabel: text("target_label"),
    targetBaseline: doublePrecision("target_baseline"),
    targetValue: doublePrecision("target_value"),
    targetDueOn: text("target_due_on"),
    updatedBy: text("updated_by", { enum: ["user", "agent", "system"] })
      .notNull()
      .default("user"),
    createdAt: text("created_at").notNull().default(isoNow),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [
    unique("growth_workstreams_project_id_key").on(table.projectId, table.id),
    unique("growth_workstreams_project_creation_key").on(
      table.projectId,
      table.creationKey,
    ),
    unique("growth_workstreams_project_position_key").on(
      table.projectId,
      table.position,
    ),
    check(
      "growth_workstreams_text_check",
      sql`length(${table.title}) BETWEEN 1 AND 200 AND length(${table.commercialReason}) BETWEEN 1 AND 2000 AND (${table.creationKey} IS NULL OR length(${table.creationKey}) BETWEEN 1 AND 200) AND (${table.targetLabel} IS NULL OR length(${table.targetLabel}) BETWEEN 1 AND 300) AND (${table.targetDueOn} IS NULL OR length(${table.targetDueOn}) = 10)`,
    ),
    check(
      "growth_workstreams_shape_check",
      sql`${table.status} IN ('active','done','dropped') AND ${table.updatedBy} IN ('user','agent','system') AND ${table.position} >= 1`,
    ),
  ],
);
