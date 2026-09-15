import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { projects } from "./app.schema";
import { organization } from "./better-auth-schema";

export const linkedinPageConnections = sqliteTable(
  "linkedin_page_connections",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    pageId: text("page_id").notNull(),
    pageName: text("page_name").notNull(),
    connectedByUserId: text("connected_by_user_id").notNull(),
    linkedinAccountId: text("linkedin_account_id").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (t) => [
    uniqueIndex("linkedin_page_connections_project_idx").on(t.projectId),
    index("linkedin_page_connections_organization_idx").on(t.organizationId),
  ],
);

export const linkedinPageOverviewCaches = sqliteTable(
  "linkedin_page_overview_caches",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    pageId: text("page_id").notNull(),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    followerGains: integer("follower_gains"),
    pageViews: integer("page_views"),
    organicImpressions: integer("organic_impressions"),
    uniqueImpressions: integer("unique_impressions"),
    clicks: integer("clicks"),
    likes: integer("likes"),
    comments: integer("comments"),
    reposts: integer("reposts"),
    retrievedAt: text("retrieved_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    apiVersion: text("api_version").notNull(),
    completeness: text("completeness").notNull().default("complete"),
  },
  (t) => [
    uniqueIndex("linkedin_page_overview_caches_period_idx").on(
      t.projectId,
      t.pageId,
      t.startDate,
      t.endDate,
    ),
    index("linkedin_page_overview_caches_retention_idx").on(t.retrievedAt),
  ],
);

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
