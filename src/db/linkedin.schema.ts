import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { projects } from "./app.schema";

export const linkedinPageImports = sqliteTable(
  "linkedin_page_imports",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    pageName: text("page_name").notNull(),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    importedAt: text("imported_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    rowCount: integer("row_count").notNull(),
  },
  (t) => [
    uniqueIndex("linkedin_page_imports_project_period_idx").on(
      t.projectId,
      t.startDate,
      t.endDate,
    ),
    index("linkedin_page_imports_project_imported_idx").on(
      t.projectId,
      t.importedAt,
    ),
  ],
);

export const linkedinPagePostMetrics = sqliteTable(
  "linkedin_page_post_metrics",
  {
    id: text("id").primaryKey(),
    importId: text("import_id")
      .notNull()
      .references(() => linkedinPageImports.id, { onDelete: "cascade" }),
    postKey: text("post_key").notNull(),
    postUrl: text("post_url"),
    postText: text("post_text"),
    publishedAt: text("published_at"),
    impressions: integer("impressions"),
    membersReached: integer("members_reached"),
    clicks: integer("clicks"),
    reactions: integer("reactions"),
    comments: integer("comments"),
    reposts: integer("reposts"),
    videoViews: integer("video_views"),
    follows: integer("follows"),
    providerClickThroughRate: integer(
      "provider_click_through_rate_basis_points",
    ),
    providerEngagementRate: integer("provider_engagement_rate_basis_points"),
  },
  (t) => [
    index("linkedin_page_post_metrics_import_idx").on(t.importId),
    uniqueIndex("linkedin_page_post_metrics_import_post_key_idx").on(
      t.importId,
      t.postKey,
    ),
  ],
);
