import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  integer,
  real,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";
import { projects } from "./app.schema";
import { user } from "./better-auth-schema";
import { growthRecommendations } from "./growth-insights.schema";
import { growthWorkstreams } from "./growth-workstreams.schema";

export const growthActions = sqliteTable(
  "growth_actions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // NULL for a plan Action authored directly under a Workstream; the
    // composite FK below is simply unenforced for those rows.
    recommendationId: text("recommendation_id"),
    creationKey: text("creation_key").notNull(),
    factHash: text("fact_hash").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    category: text("category").notNull(),
    priorityScore: real("priority_score").notNull(),
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
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    workstreamId: text("workstream_id"),
    workstreamPosition: integer("workstream_position"),
    rationale: text("rationale"),
    successMeasure: text("success_measure"),
  },
  (table) => [
    unique("growth_actions_project_id_key").on(table.projectId, table.id),
    unique("growth_actions_project_creation_key").on(
      table.projectId,
      table.creationKey,
    ),
    // NULLs are distinct on both engines, so this only orders Actions that sit
    // in a Workstream.
    unique("growth_actions_workstream_position_key").on(
      table.projectId,
      table.workstreamId,
      table.workstreamPosition,
    ),
    foreignKey({
      columns: [table.projectId, table.workstreamId],
      foreignColumns: [growthWorkstreams.projectId, growthWorkstreams.id],
      name: "growth_actions_project_workstream_fk",
      // NO ACTION, not RESTRICT: RESTRICT fires per row immediately on Postgres,
      // so a project delete would depend on referential-trigger ordering. The
      // service still refuses to delete a Workstream that owns Actions.
    }).onDelete("no action"),
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
      sql`length(${table.creationKey}) BETWEEN 1 AND 200 AND length(${table.factHash}) = 64 AND length(${table.title}) BETWEEN 1 AND 300 AND length(${table.description}) BETWEEN 1 AND 5000 AND length(${table.category}) BETWEEN 1 AND 100 AND length(${table.dueAt}) BETWEEN 1 AND 50 AND (${table.rationale} IS NULL OR length(${table.rationale}) BETWEEN 1 AND 2000) AND (${table.successMeasure} IS NULL OR length(${table.successMeasure}) BETWEEN 1 AND 300)`,
    ),
    check(
      "growth_actions_state_check",
      sql`${table.status} IN ('approved','ready','in_progress','blocked','implemented','measuring','evaluated','cancelled') AND typeof(${table.stateVersion}) = 'integer' AND ${table.stateVersion} >= 0 AND ${table.priorityScore} >= 0 AND ${table.priorityScore} < 1e999 AND ((${table.stateVersion} = 0 AND ${table.status} = 'approved') OR (${table.stateVersion} > 0 AND ${table.status} <> 'approved'))`,
    ),
    check(
      "growth_actions_origin_check",
      sql`(${table.recommendationId} IS NOT NULL OR ${table.workstreamId} IS NOT NULL) AND (${table.workstreamPosition} IS NULL OR (${table.workstreamId} IS NOT NULL AND ${table.workstreamPosition} >= 1))`,
    ),
    check(
      "growth_actions_milestones_check",
      sql`${table.approvedAt} IS NOT NULL AND ((${table.status} = 'approved' AND ${table.startedAt} IS NULL AND ${table.implementedAt} IS NULL AND ${table.evaluatedAt} IS NULL AND ${table.cancelledAt} IS NULL) OR (${table.status} = 'ready' AND ${table.startedAt} IS NULL AND ${table.implementedAt} IS NULL AND ${table.evaluatedAt} IS NULL AND ${table.cancelledAt} IS NULL) OR (${table.status} IN ('in_progress','blocked') AND ${table.startedAt} IS NOT NULL AND ${table.implementedAt} IS NULL AND ${table.evaluatedAt} IS NULL AND ${table.cancelledAt} IS NULL) OR (${table.status} IN ('implemented','measuring') AND ${table.implementedAt} IS NOT NULL AND ${table.evaluatedAt} IS NULL AND ${table.cancelledAt} IS NULL) OR (${table.status} = 'evaluated' AND ${table.implementedAt} IS NOT NULL AND ${table.evaluatedAt} IS NOT NULL AND ${table.cancelledAt} IS NULL) OR (${table.status} = 'cancelled' AND ${table.implementedAt} IS NULL AND ${table.evaluatedAt} IS NULL AND ${table.cancelledAt} IS NOT NULL))`,
    ),
  ],
);

export const growthActionTargets = sqliteTable(
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

export const growthActionEvents = sqliteTable(
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
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
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
      sql`${table.eventType} IN ('created','status_changed') AND ${table.actorType} IN ('user','agent','system') AND ${table.toStatus} IN ('approved','ready','in_progress','blocked','implemented','measuring','evaluated','cancelled') AND (${table.fromStatus} IS NULL OR ${table.fromStatus} IN ('approved','ready','in_progress','blocked','implemented','measuring','evaluated','cancelled')) AND typeof(${table.actionVersion}) = 'integer' AND ((${table.eventType} = 'created' AND ${table.actionVersion} = 0 AND ${table.fromStatus} IS NULL AND ${table.toStatus} = 'approved') OR (${table.eventType} = 'status_changed' AND ${table.actionVersion} > 0 AND ${table.fromStatus} IS NOT NULL))`,
    ),
    check(
      "growth_action_events_transition_check",
      sql`${table.eventType} = 'created' OR (${table.fromStatus} = 'approved' AND ${table.toStatus} IN ('ready','implemented','cancelled')) OR (${table.fromStatus} = 'ready' AND ${table.toStatus} IN ('in_progress','implemented','cancelled')) OR (${table.fromStatus} = 'in_progress' AND ${table.toStatus} IN ('blocked','implemented','cancelled')) OR (${table.fromStatus} = 'blocked' AND ${table.toStatus} IN ('in_progress','implemented','cancelled')) OR (${table.fromStatus} = 'implemented' AND ${table.toStatus} = 'measuring') OR (${table.fromStatus} = 'measuring' AND ${table.toStatus} = 'evaluated')`,
    ),
  ],
);

// Tagged evidence behind one Action: what was observed, where it came from, and
// how firmly it is known (kind).
export const growthActionEvidence = sqliteTable(
  "growth_action_evidence",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    actionId: text("action_id").notNull(),
    kind: text("kind", {
      enum: ["measured", "sampled", "estimate", "judgement", "reference"],
    }).notNull(),
    statement: text("statement").notNull(),
    sourceLabel: text("source_label").notNull(),
    sourceUrl: text("source_url"),
    observedOn: text("observed_on"),
    position: integer("position").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    unique("growth_action_evidence_project_id_key").on(
      table.projectId,
      table.id,
    ),
    unique("growth_action_evidence_position_key").on(
      table.projectId,
      table.actionId,
      table.position,
    ),
    foreignKey({
      columns: [table.projectId, table.actionId],
      foreignColumns: [growthActions.projectId, growthActions.id],
      name: "growth_action_evidence_project_action_fk",
    }).onDelete("cascade"),
    check(
      "growth_action_evidence_text_check",
      sql`length(${table.statement}) BETWEEN 1 AND 1000 AND length(${table.sourceLabel}) BETWEEN 1 AND 200 AND (${table.sourceUrl} IS NULL OR length(${table.sourceUrl}) BETWEEN 1 AND 2000) AND (${table.observedOn} IS NULL OR length(${table.observedOn}) = 10)`,
    ),
    check(
      "growth_action_evidence_shape_check",
      sql`${table.kind} IN ('measured','sampled','estimate','judgement','reference') AND typeof(${table.position}) = 'integer' AND ${table.position} >= 1`,
    ),
  ],
);
