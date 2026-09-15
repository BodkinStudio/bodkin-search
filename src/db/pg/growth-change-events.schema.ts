import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  unique,
} from "drizzle-orm/pg-core";
import { projects } from "./app.schema";
import { growthActions } from "./growth-actions.schema";

const isoNow = sql`to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

// Keep these tables structurally interchangeable with ../growth-change-events.schema.ts.
export const growthChangeEvents = pgTable(
  "growth_change_events",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    creationKey: text("creation_key").notNull(),
    factHash: text("fact_hash").notNull(),
    source: text("source", {
      enum: ["manual", "sherpa", "cms_webhook", "deployment"],
    }).notNull(),
    changeType: text("change_type", {
      enum: [
        "content_updated",
        "title_meta_updated",
        "page_created",
        "page_removed",
        "redirect_changed",
        "internal_links_changed",
        "template_changed",
        "structured_data_changed",
        "technical_fix",
        "design_restructure",
        "migration",
        "unknown",
        "mixed",
      ],
    }).notNull(),
    actorType: text("actor_type", {
      enum: ["user", "agent", "system"],
    }).notNull(),
    actorId: text("actor_id").notNull(),
    description: text("description").notNull(),
    happenedAt: text("happened_at").notNull(),
    externalRef: text("external_ref"),
    createdAt: text("created_at").notNull().default(isoNow),
  },
  (table) => [
    unique("growth_change_events_project_id_key").on(table.projectId, table.id),
    unique("growth_change_events_project_creation_key").on(
      table.projectId,
      table.creationKey,
    ),
    index("growth_change_events_project_happened_idx").on(
      table.projectId,
      table.happenedAt,
    ),
    check(
      "growth_change_events_text_bounds_check",
      sql`length(${table.creationKey}) BETWEEN 1 AND 200 AND length(${table.factHash}) = 64 AND length(${table.actorId}) BETWEEN 1 AND 200 AND length(${table.description}) BETWEEN 1 AND 5000 AND length(${table.happenedAt}) BETWEEN 1 AND 50 AND (${table.externalRef} IS NULL OR length(${table.externalRef}) BETWEEN 1 AND 500)`,
    ),
    check(
      "growth_change_events_vocabulary_check",
      sql`${table.source} IN ('manual','sherpa','cms_webhook','deployment') AND ${table.changeType} IN ('content_updated','title_meta_updated','page_created','page_removed','redirect_changed','internal_links_changed','template_changed','structured_data_changed','technical_fix','design_restructure','migration','unknown','mixed') AND ${table.actorType} IN ('user','agent','system')`,
    ),
  ],
);

export const growthChangeEventUrls = pgTable(
  "growth_change_event_urls",
  {
    projectId: text("project_id").notNull(),
    changeEventId: text("change_event_id").notNull(),
    url: text("url").notNull(),
  },
  (table) => [
    unique("growth_change_event_urls_key").on(
      table.projectId,
      table.changeEventId,
      table.url,
    ),
    index("growth_change_event_urls_project_url_idx").on(
      table.projectId,
      table.url,
    ),
    foreignKey({
      columns: [table.projectId, table.changeEventId],
      foreignColumns: [growthChangeEvents.projectId, growthChangeEvents.id],
      name: "growth_change_event_urls_project_event_fk",
    }).onDelete("cascade"),
    check(
      "growth_change_event_urls_text_check",
      sql`length(${table.url}) BETWEEN 1 AND 2000`,
    ),
  ],
);

export const growthActionChanges = pgTable(
  "growth_action_changes",
  {
    projectId: text("project_id").notNull(),
    actionId: text("action_id").notNull(),
    changeEventId: text("change_event_id").notNull(),
  },
  (table) => [
    unique("growth_action_changes_key").on(
      table.projectId,
      table.actionId,
      table.changeEventId,
    ),
    index("growth_action_changes_project_event_idx").on(
      table.projectId,
      table.changeEventId,
    ),
    foreignKey({
      columns: [table.projectId, table.actionId],
      foreignColumns: [growthActions.projectId, growthActions.id],
      name: "growth_action_changes_project_action_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.projectId, table.changeEventId],
      foreignColumns: [growthChangeEvents.projectId, growthChangeEvents.id],
      name: "growth_action_changes_project_event_fk",
    }).onDelete("cascade"),
  ],
);
