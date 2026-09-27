import { sql } from "drizzle-orm";
import { sqliteTable, text, index, check } from "drizzle-orm/sqlite-core";
import { organization, user } from "./better-auth-schema";

export const workspaceConfiguration = sqliteTable(
  "workspace_configuration",
  {
    organizationId: text("organization_id")
      .primaryKey()
      .references(() => organization.id, { onDelete: "cascade" }),
    payerOrganizationId: text("payer_organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("active"),
  },
  (t) => [
    check(
      "workspace_status_domain",
      sql`${t.status} in ('active', 'suspended')`,
    ),
  ],
);
export const workspaceAudit = sqliteTable(
  "workspace_audit",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    targetId: text("target_id").notNull(),
    role: text("role"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("workspace_audit_organization_idx").on(t.organizationId, t.createdAt),
  ],
);
