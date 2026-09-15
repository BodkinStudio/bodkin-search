import {
  foreignKey,
  integer,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";
import { projects } from "./app.schema";

export const promptExplorerSnapshots = sqliteTable(
  "prompt_explorer_snapshots",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    prompt: text("prompt").notNull(),
    highlightBrand: text("highlight_brand"),
    webSearch: integer("web_search", { mode: "boolean" }).notNull(),
    webSearchCountryCode: text("web_search_country_code"),
    capturedAt: text("captured_at").notNull(),
  },
  (t) => [
    unique("prompt_explorer_snapshots_project_id_key").on(t.projectId, t.id),
  ],
);

export const promptExplorerSnapshotModels = sqliteTable(
  "prompt_explorer_snapshot_models",
  {
    projectId: text("project_id").notNull(),
    snapshotId: text("snapshot_id").notNull(),
    model: text("model").notNull(),
    status: text("status").notNull(),
    modelName: text("model_name"),
    answer: text("answer"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    outputTokens: integer("output_tokens"),
    responseWebSearch: integer("response_web_search", { mode: "boolean" }),
    brandMentioned: integer("brand_mentioned", { mode: "boolean" }),
    cacheSource: text("cache_source").notNull(),
    generatedAt: text("generated_at"),
  },
  (t) => [
    unique("prompt_explorer_snapshot_models_key").on(
      t.projectId,
      t.snapshotId,
      t.model,
    ),
    foreignKey({
      columns: [t.projectId, t.snapshotId],
      foreignColumns: [
        promptExplorerSnapshots.projectId,
        promptExplorerSnapshots.id,
      ],
    }).onDelete("cascade"),
  ],
);

export const promptExplorerSnapshotCitations = sqliteTable(
  "prompt_explorer_snapshot_citations",
  {
    projectId: text("project_id").notNull(),
    snapshotId: text("snapshot_id").notNull(),
    model: text("model").notNull(),
    ordinal: integer("ordinal").notNull(),
    url: text("url").notNull(),
    domain: text("domain"),
    title: text("title"),
    matchedBrand: integer("matched_brand", { mode: "boolean" }).notNull(),
  },
  (t) => [
    unique("prompt_explorer_snapshot_citations_key").on(
      t.projectId,
      t.snapshotId,
      t.model,
      t.ordinal,
    ),
    foreignKey({
      columns: [t.projectId, t.snapshotId, t.model],
      foreignColumns: [
        promptExplorerSnapshotModels.projectId,
        promptExplorerSnapshotModels.snapshotId,
        promptExplorerSnapshotModels.model,
      ],
    }).onDelete("cascade"),
  ],
);

export const promptExplorerSnapshotFanOutQueries = sqliteTable(
  "prompt_explorer_snapshot_fan_out_queries",
  {
    projectId: text("project_id").notNull(),
    snapshotId: text("snapshot_id").notNull(),
    model: text("model").notNull(),
    ordinal: integer("ordinal").notNull(),
    query: text("query").notNull(),
  },
  (t) => [
    unique("prompt_explorer_snapshot_fan_out_queries_key").on(
      t.projectId,
      t.snapshotId,
      t.model,
      t.ordinal,
    ),
    foreignKey({
      columns: [t.projectId, t.snapshotId, t.model],
      foreignColumns: [
        promptExplorerSnapshotModels.projectId,
        promptExplorerSnapshotModels.snapshotId,
        promptExplorerSnapshotModels.model,
      ],
    }).onDelete("cascade"),
  ],
);
