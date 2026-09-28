import {
  sqliteTable,
  text,
  integer,
  unique,
  index,
} from "drizzle-orm/sqlite-core";
import { projects } from "./app.schema";
export const analyticsReportingSettings = sqliteTable(
  "analytics_reporting_settings",
  {
    projectId: text("project_id")
      .primaryKey()
      .references(() => projects.id, { onDelete: "cascade" }),
    timezone: text("timezone").notNull().default("UTC"),
    completionWindowDays: integer("completion_window_days")
      .notNull()
      .default(7),
    onboardingEvent: text("onboarding_event")
      .notNull()
      .default("activation_achieved"),
    onboardingInstrumented: integer("onboarding_instrumented", {
      mode: "boolean",
    })
      .notNull()
      .default(false),
    onboardingWaitDays: integer("onboarding_wait_days").notNull().default(7),
  },
);
export const analyticsFunnelStages = sqliteTable(
  "analytics_funnel_stages",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    template: text("template").notNull(),
    position: integer("position").notNull(),
    label: text("label").notNull(),
    event: text("event").notNull(),
    action: text("action"),
    instrumented: integer("instrumented", { mode: "boolean" })
      .notNull()
      .default(false),
  },
  (t) => [
    unique("analytics_funnel_stage_position").on(
      t.projectId,
      t.template,
      t.position,
    ),
  ],
);
export const analyticsAudit = sqliteTable(
  "analytics_audit",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    actorId: text("actor_id").notNull(),
    entity: text("entity").notNull(),
    field: text("field").notNull(),
    previousValue: text("previous_value"),
    nextValue: text("next_value"),
    reason: text("reason"),
    occurredAt: text("occurred_at").notNull(),
  },
  (t) => [index("analytics_audit_project_time").on(t.projectId, t.occurredAt)],
);
export const analyticsExcludedPaths = sqliteTable(
  "analytics_excluded_paths",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    prefix: text("prefix").notNull(),
  },
  (t) => [unique("analytics_excluded_path").on(t.projectId, t.prefix)],
);
