import { sql } from "drizzle-orm";
import { index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { projects } from "./app.schema";
import { organization } from "./better-auth-schema";

const isoNow = sql`to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

// Keep this definition structurally identical to ../google-ads.schema.ts.
// Selected Google Ads account per project. OAuth credentials stay in Better
// Auth's account table under the dedicated "google-ads" provider.
export const googleAdsConnections = pgTable(
  "google_ads_connections",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // Ten digits, no dashes. The manager account it is reached through, if any.
    customerId: text("customer_id").notNull(),
    loginCustomerId: text("login_customer_id"),
    customerName: text("customer_name").notNull(),
    currencyCode: text("currency_code").notNull(),
    timeZone: text("time_zone").notNull(),
    connectedByUserId: text("connected_by_user_id").notNull(),
    googleAccountId: text("google_account_id").notNull(),
    connectedAccountEmail: text("connected_account_email"),
    createdAt: text("created_at").notNull().default(isoNow),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [
    uniqueIndex("google_ads_connections_project_idx").on(table.projectId),
    index("google_ads_connections_organization_idx").on(table.organizationId),
    index("google_ads_connections_connector_idx").on(
      table.connectedByUserId,
      table.googleAccountId,
    ),
  ],
);
