import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
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
