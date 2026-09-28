/* eslint-disable max-lines, max-lines-per-function -- exhaustive raw migration acceptance is clearest as one populated fixture */
import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const migrations = [
  "drizzle/0044_glossy_komodo.sql",
  "drizzle/0045_mean_retro_girl.sql",
  "drizzle/0046_living_misty_knight.sql",
  "drizzle/0047_flaky_felicia_hardy.sql",
].map((path) => readFileSync(path, "utf8"));
const measurementMigration = readFileSync(
  "drizzle/0048_dry_kate_bishop.sql",
  "utf8",
);
const hash = "a".repeat(64);

let client: Client;

async function countRows(table: string, where = "1 = 1") {
  const [row] = (
    await client.execute(
      `SELECT count(*) AS count FROM ${table} WHERE ${where}`,
    )
  ).rows;
  return Number(row?.count ?? 0);
}

async function indexColumns(table: string, indexName: string) {
  expect((await client.execute(`PRAGMA index_list('${table}')`)).rows).toEqual(
    expect.arrayContaining([expect.objectContaining({ name: indexName })]),
  );
  return (await client.execute(`PRAGMA index_info('${indexName}')`)).rows.map(
    ({ name }) => name,
  );
}

async function insertPlan(input: {
  id: string;
  projectId?: string;
  actionId?: string;
  status?: string;
  actionVersion?: number;
  anchorDate?: string;
  completedAt?: string | null;
}) {
  const status = input.status ?? "active";
  await client.execute({
    sql: `INSERT INTO growth_measurement_plans (
      id, project_id, action_id, fact_hash, status, action_version, anchor_at,
      anchor_date, report_timezone, baseline_start, baseline_end, cooldown_end,
      measurement_start, measurement_end, long_measurement_end,
      comparison_mode, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, '2026-08-29T12:00:00.000Z', ?, 'Europe/London',
      '2026-08-01', '2026-08-14', '2026-08-31', '2026-09-01',
      '2026-09-14', '2026-10-14', 'preceding_period', ?)`,
    args: [
      input.id,
      input.projectId ?? "project_1",
      input.actionId ?? "action_1",
      hash,
      status,
      input.actionVersion ?? 6,
      input.anchorDate ?? "2026-08-29",
      input.completedAt ??
        (status === "completed" ? "2026-10-15T12:00:00.000Z" : null),
    ],
  });
}

async function insertMetric(input: {
  id: string;
  projectId?: string;
  planId?: string;
  metricType?: string;
  isPrimary?: number;
}) {
  await client.execute({
    sql: `INSERT INTO growth_measurement_metrics (
      id, project_id, measurement_plan_id, metric_type, entity_type,
      entity_key, is_primary
    ) VALUES (?, ?, ?, ?, 'url', 'https://example.com/pricing', ?)`,
    args: [
      input.id,
      input.projectId ?? "project_1",
      input.planId ?? "plan_1",
      input.metricType ?? "search_clicks",
      input.isPrimary ?? 1,
    ],
  });
}

async function insertObservation(input: {
  id: string;
  projectId?: string;
  planId?: string;
  metricId?: string;
  period?: string;
  value?: number;
  completeness?: number;
  evidenceKind?: string;
}) {
  await client.execute({
    sql: `INSERT INTO growth_measurement_observations (
      id, project_id, measurement_plan_id, metric_id, period_type, fact_hash,
      effective_start, effective_end, value, completeness, evidence_kind,
      evidence_ref, captured_at
    ) VALUES (?, ?, ?, ?, ?, ?, '2026-08-01', '2026-08-14', ?, ?, ?,
      'gsc:property:range', '2026-09-15T12:00:00.000Z')`,
    args: [
      input.id,
      input.projectId ?? "project_1",
      input.planId ?? "plan_1",
      input.metricId ?? "metric_1",
      input.period ?? "baseline",
      hash,
      input.value ?? 100,
      input.completeness ?? 1,
      input.evidenceKind ?? "gsc_period",
    ],
  });
}

async function insertResult(input: {
  id: string;
  projectId?: string;
  planId?: string;
  outcome?: string;
  confidence?: number;
  model?: string | null;
  promptVersion?: string | null;
}) {
  await client.execute({
    sql: `INSERT INTO growth_measurement_results (
      id, project_id, measurement_plan_id, fact_hash, observations_hash,
      outcome, confidence, summary, evaluated_at, model, prompt_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Traffic increased after the change.',
      '2026-10-15T12:00:00.000Z', ?, ?)`,
    args: [
      input.id,
      input.projectId ?? "project_1",
      input.planId ?? "plan_1",
      hash,
      "b".repeat(64),
      input.outcome ?? "positive",
      input.confidence ?? 0.8,
      input.model ?? null,
      input.promptVersion ?? null,
    ],
  });
}

beforeEach(async () => {
  client = createClient({ url: "file::memory:" });
  await client.executeMultiple(
    [
      "PRAGMA foreign_keys = ON;",
      "CREATE TABLE projects (id text PRIMARY KEY);",
      "CREATE TABLE user (id text PRIMARY KEY);",
      "INSERT INTO projects (id) VALUES ('project_1'), ('project_2');",
      "INSERT INTO user (id) VALUES ('user_1');",
      migrations[0],
      `INSERT INTO growth_runs (
        id, project_id, run_type, trigger, status, cadence_slot, period_start,
        period_end, started_at, detector_version
      ) VALUES
        ('run_1', 'project_1', 'daily_monitor', 'manual', 'running', 'slot_1',
          '2026-08-01', '2026-08-29', '2026-08-29T10:00:00.000Z', 'v1'),
        ('run_2', 'project_2', 'daily_monitor', 'manual', 'running', 'slot_2',
          '2026-08-01', '2026-08-29', '2026-08-29T10:00:00.000Z', 'v1');`,
      migrations[1],
      `INSERT INTO growth_recommendations (
        id, project_id, run_id, creation_key, fact_hash, title, rationale,
        category, impact, commercial_relevance, effort, urgency, confidence,
        priority_score, status, review_version
      ) VALUES
        ('recommendation_1', 'project_1', 'run_1', 'recommendation_1', '${hash}',
          'Refresh pricing', 'Lost traffic', 'content', 5, 5, 2, 3, 0.8, 10,
          'accepted', 1),
        ('recommendation_2', 'project_2', 'run_2', 'recommendation_2', '${hash}',
          'Refresh pricing', 'Lost traffic', 'content', 5, 5, 2, 3, 0.8, 10,
          'accepted', 1);`,
      migrations[2],
      `INSERT INTO growth_actions (
        id, project_id, recommendation_id, creation_key, fact_hash, title,
        description, category, priority_score, status, state_version, due_at,
        approved_at, started_at, implemented_at
      ) VALUES
        ('action_1', 'project_1', 'recommendation_1', 'action_1', '${hash}',
          'Refresh pricing', 'Ship it', 'content', 10, 'implemented', 5,
          '2026-09-30T12:00:00.000Z', '2026-08-01T12:00:00.000Z',
          '2026-08-15T12:00:00.000Z', '2026-08-29T12:00:00.000Z'),
        ('action_2', 'project_2', 'recommendation_2', 'action_2', '${hash}',
          'Refresh pricing', 'Ship it', 'content', 10, 'implemented', 5,
          '2026-09-30T12:00:00.000Z', '2026-08-01T12:00:00.000Z',
          '2026-08-15T12:00:00.000Z', '2026-08-29T12:00:00.000Z');`,
      migrations[3],
      `INSERT INTO growth_change_events (
        id, project_id, creation_key, fact_hash, source, change_type,
        actor_type, actor_id, description, happened_at
      ) VALUES
        ('change_1', 'project_1', 'change_1', '${hash}', 'manual',
          'content_updated', 'user', 'user_1', 'Changed pricing',
          '2026-08-29T12:00:00.000Z'),
        ('change_2', 'project_2', 'change_2', '${hash}', 'manual',
          'content_updated', 'user', 'user_1', 'Changed pricing',
          '2026-08-29T12:00:00.000Z');`,
    ].join("\n"),
  );
  expect(await countRows("growth_actions")).toBe(2);
  expect(await countRows("growth_change_events")).toBe(2);
  await client.executeMultiple(measurementMigration);
});

afterEach(() => client.close());

describe("Growth Measurements D1 migration", () => {
  it("adds the exact project-leading keys, checks and query indexes after 0047", async () => {
    const planFks = (
      await client.execute(
        "PRAGMA foreign_key_list('growth_measurement_plans')",
      )
    ).rows;
    expect(planFks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "growth_actions",
          seq: 0,
          from: "project_id",
          to: "project_id",
          on_delete: "CASCADE",
        }),
        expect.objectContaining({
          table: "growth_actions",
          seq: 1,
          from: "action_id",
          to: "id",
          on_delete: "CASCADE",
        }),
      ]),
    );
    for (const [table, parent, columns] of [
      [
        "growth_measurement_metrics",
        "growth_measurement_plans",
        ["project_id", "measurement_plan_id"],
      ],
      [
        "growth_measurement_observations",
        "growth_measurement_metrics",
        ["project_id", "measurement_plan_id", "metric_id"],
      ],
      [
        "growth_measurement_results",
        "growth_measurement_plans",
        ["project_id", "measurement_plan_id"],
      ],
    ] as const) {
      const rows = (await client.execute(`PRAGMA foreign_key_list('${table}')`))
        .rows;
      expect(
        rows.filter((row) => row.table === parent).map((row) => row.from),
      ).toEqual(expect.arrayContaining([...columns]));
      expect(rows.filter((row) => row.table === parent)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ on_delete: "CASCADE" }),
        ]),
      );
    }
    const resultChangeFks = (
      await client.execute(
        "PRAGMA foreign_key_list('growth_measurement_result_changes')",
      )
    ).rows;
    expect(new Set(resultChangeFks.map(({ table }) => table))).toEqual(
      new Set(["growth_measurement_results", "growth_change_events"]),
    );
    expect(
      resultChangeFks.every(({ on_delete }) => on_delete === "CASCADE"),
    ).toBe(true);

    expect(
      await indexColumns(
        "growth_measurement_plans",
        "growth_measurement_plans_project_id_key",
      ),
    ).toEqual(["project_id", "id"]);
    expect(
      await indexColumns(
        "growth_measurement_plans",
        "growth_measurement_plans_project_action_key",
      ),
    ).toEqual(["project_id", "action_id"]);
    expect(
      await indexColumns(
        "growth_measurement_plans",
        "growth_measurement_plans_project_status_due_idx",
      ),
    ).toEqual([
      "project_id",
      "status",
      "long_measurement_end",
      "measurement_end",
    ]);
    expect(
      await indexColumns(
        "growth_measurement_metrics",
        "growth_measurement_metrics_project_plan_id_key",
      ),
    ).toEqual(["project_id", "measurement_plan_id", "id"]);
    expect(
      await indexColumns(
        "growth_measurement_metrics",
        "growth_measurement_metrics_semantic_key",
      ),
    ).toEqual([
      "project_id",
      "measurement_plan_id",
      "metric_type",
      "entity_type",
      "entity_key",
    ]);
    expect(
      await indexColumns(
        "growth_measurement_observations",
        "growth_measurement_observations_coordinate_key",
      ),
    ).toEqual([
      "project_id",
      "measurement_plan_id",
      "metric_id",
      "period_type",
    ]);
    expect(
      await indexColumns(
        "growth_measurement_observations",
        "growth_measurement_observations_project_plan_idx",
      ),
    ).toEqual(["project_id", "measurement_plan_id", "captured_at"]);
    expect(
      await indexColumns(
        "growth_measurement_results",
        "growth_measurement_results_project_id_key",
      ),
    ).toEqual(["project_id", "id"]);
    expect(
      await indexColumns(
        "growth_measurement_results",
        "growth_measurement_results_project_plan_key",
      ),
    ).toEqual(["project_id", "measurement_plan_id"]);
    expect(
      await indexColumns(
        "growth_measurement_result_changes",
        "growth_measurement_result_changes_key",
      ),
    ).toEqual(["project_id", "measurement_result_id", "change_event_id"]);
    expect(
      await indexColumns(
        "growth_measurement_result_changes",
        "growth_measurement_result_changes_project_event_idx",
      ),
    ).toEqual(["project_id", "change_event_id"]);

    for (const [table, checks] of [
      [
        "growth_measurement_plans",
        [
          "growth_measurement_plans_vocabulary_check",
          "growth_measurement_plans_dates_check",
          "growth_measurement_plans_lifecycle_check",
        ],
      ],
      [
        "growth_measurement_metrics",
        [
          "growth_measurement_metrics_vocabulary_check",
          "growth_measurement_metrics_primary_check",
        ],
      ],
      [
        "growth_measurement_observations",
        [
          "growth_measurement_observations_vocabulary_check",
          "growth_measurement_observations_value_check",
          "growth_measurement_observations_completeness_check",
        ],
      ],
      [
        "growth_measurement_results",
        [
          "growth_measurement_results_vocabulary_check",
          "growth_measurement_results_confidence_check",
          "growth_measurement_results_model_prompt_check",
        ],
      ],
      [
        "growth_measurement_result_changes",
        ["growth_measurement_result_changes_text_bounds_check"],
      ],
    ] as const) {
      const [row] = (
        await client.execute(
          `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = '${table}'`,
        )
      ).rows;
      const tableSql = row?.sql;
      expect(typeof tableSql).toBe("string");
      if (typeof tableSql !== "string")
        throw new Error(`Expected SQL definition for ${table}`);
      for (const check of checks) expect(tableSql).toContain(check);
    }
    expect((await client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
  });

  it("rejects raw lifecycle, vocabulary, scalar and cross-project violations", async () => {
    await insertPlan({ id: "plan_1" });
    await insertMetric({ id: "metric_1" });
    await insertObservation({ id: "observation_1" });
    await insertResult({ id: "result_1" });

    await expect(
      insertPlan({ id: "duplicate", actionId: "action_1" }),
    ).rejects.toThrow();
    await expect(
      insertPlan({
        id: "foreign",
        projectId: "project_1",
        actionId: "action_2",
      }),
    ).rejects.toThrow();
    await expect(
      insertPlan({ id: "bad_status", status: "cancelled" }),
    ).rejects.toThrow();
    await expect(
      insertPlan({ id: "fractional", actionVersion: 1.5 }),
    ).rejects.toThrow();
    await expect(
      insertPlan({
        id: "bad_date",
        actionId: "action_2",
        anchorDate: "2026-07-31",
      }),
    ).rejects.toThrow();
    await expect(
      insertMetric({ id: "bad_metric", metricType: "rank" }),
    ).rejects.toThrow();
    await expect(
      insertMetric({ id: "bad_primary", isPrimary: 2 }),
    ).rejects.toThrow();
    await expect(
      insertMetric({ id: "foreign_metric", projectId: "project_2" }),
    ).rejects.toThrow();
    await expect(
      insertObservation({ id: "bad_period", period: "comparison" }),
    ).rejects.toThrow();
    await expect(
      insertObservation({ id: "bad_evidence", evidenceKind: "api" }),
    ).rejects.toThrow();
    await expect(
      insertObservation({ id: "bad_completeness", completeness: 2 }),
    ).rejects.toThrow();
    await expect(
      insertObservation({ id: "foreign_observation", projectId: "project_2" }),
    ).rejects.toThrow();
    await expect(
      insertResult({ id: "bad_outcome", outcome: "great" }),
    ).rejects.toThrow();
    await expect(
      insertResult({ id: "bad_confidence", confidence: 2 }),
    ).rejects.toThrow();
    await expect(
      insertResult({ id: "bad_model", model: "gpt", promptVersion: null }),
    ).rejects.toThrow();
    await expect(
      client.execute(`INSERT INTO growth_measurement_result_changes
        (project_id, measurement_result_id, change_event_id)
        VALUES ('project_1', 'result_1', 'change_2')`),
    ).rejects.toThrow();
    expect((await client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
  });

  it("cascades the Action graph while preserving independent Change Events", async () => {
    await insertPlan({ id: "plan_1", status: "completed" });
    await insertMetric({ id: "metric_1" });
    await insertObservation({ id: "observation_1" });
    await insertResult({ id: "result_1" });
    await client.execute(`INSERT INTO growth_measurement_result_changes
      (project_id, measurement_result_id, change_event_id)
      VALUES ('project_1', 'result_1', 'change_1')`);
    await insertPlan({
      id: "plan_2",
      projectId: "project_2",
      actionId: "action_2",
      status: "completed",
    });
    await insertMetric({
      id: "metric_2",
      projectId: "project_2",
      planId: "plan_2",
    });
    await insertObservation({
      id: "observation_2",
      projectId: "project_2",
      planId: "plan_2",
      metricId: "metric_2",
    });
    await insertResult({
      id: "result_2",
      projectId: "project_2",
      planId: "plan_2",
    });
    await client.execute(`INSERT INTO growth_measurement_result_changes
      (project_id, measurement_result_id, change_event_id)
      VALUES ('project_2', 'result_2', 'change_2')`);

    await client.execute(
      "DELETE FROM growth_change_events WHERE id = 'change_1'",
    );
    expect(await countRows("growth_measurement_result_changes")).toBe(1);
    expect(await countRows("growth_measurement_results")).toBe(2);
    expect(await countRows("growth_measurement_plans")).toBe(2);

    await client.execute("DELETE FROM growth_runs WHERE id = 'run_1'");
    for (const table of [
      "growth_measurement_result_changes",
      "growth_measurement_results",
      "growth_measurement_observations",
      "growth_measurement_metrics",
      "growth_measurement_plans",
    ]) {
      expect(await countRows(table, "project_id = 'project_1'")).toBe(0);
    }
    expect(await countRows("growth_measurement_plans", "id = 'plan_2'")).toBe(
      1,
    );
    expect(await countRows("growth_change_events", "id = 'change_2'")).toBe(1);
    expect(await countRows("growth_actions", "id = 'action_2'")).toBe(1);

    await client.execute("DELETE FROM projects WHERE id = 'project_2'");
    for (const table of [
      "growth_measurement_result_changes",
      "growth_measurement_results",
      "growth_measurement_observations",
      "growth_measurement_metrics",
      "growth_measurement_plans",
    ]) {
      expect(await countRows(table, "project_id = 'project_2'")).toBe(0);
    }
    expect(await countRows("growth_change_events", "id = 'change_2'")).toBe(0);
    expect((await client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
  });
});
