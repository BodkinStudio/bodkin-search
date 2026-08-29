import { sql } from "drizzle-orm";
import {
  check,
  doublePrecision,
  foreignKey,
  integer,
  pgTable,
  text,
  unique,
} from "drizzle-orm/pg-core";
import { projects } from "./app.schema";
import { user } from "./better-auth-schema";
import { growthRecommendations } from "./growth-insights.schema";

const isoNow = sql`to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

// Keep these tables structurally interchangeable with ../growth-actions.schema.ts.
export const growthActions = pgTable(
  "growth_actions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    recommendationId: text("recommendation_id").notNull(),
    creationKey: text("creation_key").notNull(),
    factHash: text("fact_hash").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    category: text("category").notNull(),
    priorityScore: doublePrecision("priority_score").notNull(),
    status: text("status", {
      enum: [
        "approved",
        "ready",
        "in_progress",
        "blocked",
        "implemented",
        "measuring",
        "evaluated",
        "cancelled",
      ],
    })
      .notNull()
      .default("approved"),
    stateVersion: integer("state_version").notNull().default(0),
    ownerUserId: text("owner_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    dueAt: text("due_at").notNull(),
    approvedAt: text("approved_at").notNull(),
    startedAt: text("started_at"),
    implementedAt: text("implemented_at"),
    evaluatedAt: text("evaluated_at"),
    cancelledAt: text("cancelled_at"),
    createdAt: text("created_at").notNull().default(isoNow),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [
    unique("growth_actions_project_id_key").on(table.projectId, table.id),
    unique("growth_actions_project_creation_key").on(
      table.projectId,
      table.creationKey,
    ),
    foreignKey({
      columns: [table.projectId, table.recommendationId],
      foreignColumns: [
        growthRecommendations.projectId,
        growthRecommendations.id,
      ],
      name: "growth_actions_project_recommendation_fk",
    }).onDelete("cascade"),
    check(
      "growth_actions_text_bounds_check",
      sql`length(${table.creationKey}) BETWEEN 1 AND 200 AND length(${table.factHash}) = 64 AND length(${table.title}) BETWEEN 1 AND 300 AND length(${table.description}) BETWEEN 1 AND 5000 AND length(${table.category}) BETWEEN 1 AND 100 AND length(${table.dueAt}) BETWEEN 1 AND 50`,
    ),
    check(
      "growth_actions_state_check",
      sql`${table.status} IN ('approved','ready','in_progress','blocked','implemented','measuring','evaluated','cancelled') AND ${table.stateVersion} >= 0 AND ${table.priorityScore} >= 0 AND ${table.priorityScore} NOT IN ('Infinity'::double precision, '-Infinity'::double precision, 'NaN'::double precision) AND ((${table.stateVersion} = 0 AND ${table.status} = 'approved') OR (${table.stateVersion} > 0 AND ${table.status} <> 'approved'))`,
    ),
    check(
      "growth_actions_milestones_check",
      sql`${table.approvedAt} IS NOT NULL AND ((${table.status} = 'approved' AND ${table.startedAt} IS NULL AND ${table.implementedAt} IS NULL AND ${table.evaluatedAt} IS NULL AND ${table.cancelledAt} IS NULL) OR (${table.status} = 'ready' AND ${table.startedAt} IS NULL AND ${table.implementedAt} IS NULL AND ${table.evaluatedAt} IS NULL AND ${table.cancelledAt} IS NULL) OR (${table.status} IN ('in_progress','blocked') AND ${table.startedAt} IS NOT NULL AND ${table.implementedAt} IS NULL AND ${table.evaluatedAt} IS NULL AND ${table.cancelledAt} IS NULL) OR (${table.status} IN ('implemented','measuring') AND ${table.startedAt} IS NOT NULL AND ${table.implementedAt} IS NOT NULL AND ${table.evaluatedAt} IS NULL AND ${table.cancelledAt} IS NULL) OR (${table.status} = 'evaluated' AND ${table.startedAt} IS NOT NULL AND ${table.implementedAt} IS NOT NULL AND ${table.evaluatedAt} IS NOT NULL AND ${table.cancelledAt} IS NULL) OR (${table.status} = 'cancelled' AND ${table.implementedAt} IS NULL AND ${table.evaluatedAt} IS NULL AND ${table.cancelledAt} IS NOT NULL))`,
    ),
  ],
);

export const growthActionTargets = pgTable(
  "growth_action_targets",
  {
    projectId: text("project_id").notNull(),
    actionId: text("action_id").notNull(),
    targetType: text("target_type", {
      enum: ["url", "keyword", "cluster", "site"],
    }).notNull(),
    targetValue: text("target_value").notNull(),
  },
  (table) => [
    unique("growth_action_targets_key").on(
      table.projectId,
      table.actionId,
      table.targetType,
      table.targetValue,
    ),
    foreignKey({
      columns: [table.projectId, table.actionId],
      foreignColumns: [growthActions.projectId, growthActions.id],
      name: "growth_action_targets_project_action_fk",
    }).onDelete("cascade"),
    check(
      "growth_action_targets_text_check",
      sql`${table.targetType} IN ('url', 'keyword', 'cluster', 'site') AND length(${table.targetValue}) BETWEEN 1 AND 2000`,
    ),
  ],
);

export const growthActionEvents = pgTable(
  "growth_action_events",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    actionId: text("action_id").notNull(),
    actionVersion: integer("action_version").notNull(),
    factHash: text("fact_hash").notNull(),
    eventType: text("event_type", {
      enum: ["created", "status_changed"],
    }).notNull(),
    actorType: text("actor_type", {
      enum: ["user", "agent", "system"],
    }).notNull(),
    actorId: text("actor_id").notNull(),
    fromStatus: text("from_status", {
      enum: [
        "approved",
        "ready",
        "in_progress",
        "blocked",
        "implemented",
        "measuring",
        "evaluated",
        "cancelled",
      ],
    }),
    toStatus: text("to_status", {
      enum: [
        "approved",
        "ready",
        "in_progress",
        "blocked",
        "implemented",
        "measuring",
        "evaluated",
        "cancelled",
      ],
    }).notNull(),
    note: text("note"),
    createdAt: text("created_at").notNull().default(isoNow),
  },
  (table) => [
    unique("growth_action_events_project_action_version_key").on(
      table.projectId,
      table.actionId,
      table.actionVersion,
    ),
    foreignKey({
      columns: [table.projectId, table.actionId],
      foreignColumns: [growthActions.projectId, growthActions.id],
      name: "growth_action_events_project_action_fk",
    }).onDelete("cascade"),
    check(
      "growth_action_events_text_check",
      sql`length(${table.factHash}) = 64 AND length(${table.actorId}) BETWEEN 1 AND 200 AND (${table.note} IS NULL OR length(${table.note}) BETWEEN 1 AND 5000)`,
    ),
    check(
      "growth_action_events_shape_check",
      sql`${table.eventType} IN ('created','status_changed') AND ${table.actorType} IN ('user','agent','system') AND ${table.toStatus} IN ('approved','ready','in_progress','blocked','implemented','measuring','evaluated','cancelled') AND (${table.fromStatus} IS NULL OR ${table.fromStatus} IN ('approved','ready','in_progress','blocked','implemented','measuring','evaluated','cancelled')) AND ((${table.eventType} = 'created' AND ${table.actionVersion} = 0 AND ${table.fromStatus} IS NULL AND ${table.toStatus} = 'approved') OR (${table.eventType} = 'status_changed' AND ${table.actionVersion} > 0 AND ${table.fromStatus} IS NOT NULL))`,
    ),
    check(
      "growth_action_events_transition_check",
      sql`${table.eventType} = 'created' OR (${table.fromStatus} = 'approved' AND ${table.toStatus} IN ('ready','cancelled')) OR (${table.fromStatus} = 'ready' AND ${table.toStatus} IN ('in_progress','cancelled')) OR (${table.fromStatus} = 'in_progress' AND ${table.toStatus} IN ('blocked','implemented','cancelled')) OR (${table.fromStatus} = 'blocked' AND ${table.toStatus} IN ('in_progress','implemented','cancelled')) OR (${table.fromStatus} = 'implemented' AND ${table.toStatus} = 'measuring') OR (${table.fromStatus} = 'measuring' AND ${table.toStatus} = 'evaluated')`,
    ),
  ],
);
