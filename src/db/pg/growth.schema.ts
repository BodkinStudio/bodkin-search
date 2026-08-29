import { sql } from "drizzle-orm";
import { boolean, check, integer, pgTable, text } from "drizzle-orm/pg-core";
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
