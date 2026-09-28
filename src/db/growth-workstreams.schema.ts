import { sql } from "drizzle-orm";
import {
  check,
  integer,
  real,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";
import { projects } from "./app.schema";

// A Growth Plan is the ordered list of Workstreams for one project. Each
// Workstream states, in plain language, why the work matters commercially and
// owns the plan Actions that carry it out (growth_actions.workstream_id).
export const growthWorkstreams = sqliteTable(
  "growth_workstreams",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // Client-supplied idempotency key, mirroring growth_actions.creation_key.
    creationKey: text("creation_key"),
    position: integer("position").notNull(),
    title: text("title").notNull(),
    commercialReason: text("commercial_reason").notNull(),
    status: text("status", { enum: ["active", "done", "dropped"] })
      .notNull()
      .default("active"),
    targetLabel: text("target_label"),
    targetBaseline: real("target_baseline"),
    targetValue: real("target_value"),
    targetDueOn: text("target_due_on"),
    updatedBy: text("updated_by", { enum: ["user", "agent", "system"] })
      .notNull()
      .default("user"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
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
      sql`${table.status} IN ('active','done','dropped') AND ${table.updatedBy} IN ('user','agent','system') AND typeof(${table.position}) = 'integer' AND ${table.position} >= 1`,
    ),
  ],
);
