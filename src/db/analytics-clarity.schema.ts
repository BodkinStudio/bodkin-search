import {
  sqliteTable,
  text,
  integer,
  real,
  unique,
} from "drizzle-orm/sqlite-core";
import { projects } from "./app.schema";

// A project's Microsoft Clarity project and its Data Export token. The token
// is encrypted with a key derived for this project and is never returned.
export const analyticsClarityConnections = sqliteTable(
  "analytics_clarity_connections",
  {
    projectId: text("project_id")
      .primaryKey()
      .references(() => projects.id, { onDelete: "cascade" }),
    clarityProjectId: text("clarity_project_id").notNull(),
    encryptedToken: text("encrypted_token").notNull(),
    connectedByUserId: text("connected_by_user_id").notNull(),
    lastSyncedAt: text("last_synced_at"),
    lastSyncError: text("last_sync_error"),
    updatedAt: text("updated_at").notNull(),
  },
  () => [],
);

// What Clarity measured on a page in a day. Aggregate only; no visitor or
// session values belong here. Sessions and bot sessions are counts; every
// other measure is an average over that day's sessions on the page, and is
// null when Clarity had none to give.
export const analyticsClarityPages = sqliteTable(
  "analytics_clarity_pages",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    day: text("day").notNull(),
    pagePath: text("page_path").notNull(),
    sessions: integer("sessions").notNull(),
    botSessions: integer("bot_sessions"),
    scrollDepth: real("scroll_depth"),
    activeTime: real("active_time"),
    deadClickPct: real("dead_click_pct"),
    rageClickPct: real("rage_click_pct"),
    quickBackPct: real("quick_back_pct"),
    excessiveScrollPct: real("excessive_scroll_pct"),
    errorClickPct: real("error_click_pct"),
    scriptErrorPct: real("script_error_pct"),
  },
  (t) => [
    unique("analytics_clarity_page_day").on(t.projectId, t.day, t.pagePath),
  ],
);
