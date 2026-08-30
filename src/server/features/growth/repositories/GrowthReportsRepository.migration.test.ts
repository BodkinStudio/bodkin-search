/* eslint-disable max-lines, max-lines-per-function -- exhaustive migration acceptance is clearest in one populated fixture */
import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const previousMigrations = [
  "drizzle/0044_glossy_komodo.sql",
  "drizzle/0045_mean_retro_girl.sql",
  "drizzle/0046_living_misty_knight.sql",
  "drizzle/0047_flaky_felicia_hardy.sql",
  "drizzle/0048_dry_kate_bishop.sql",
].map((path) => readFileSync(path, "utf8"));
const reportMigration = readFileSync(
  "drizzle/0049_gray_hedge_knight.sql",
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

async function insertReport(input: {
  id: string;
  projectId?: string;
  reportType?: string;
  version?: number;
  status?: string;
  periodStart?: string;
  periodEnd?: string;
  dataCutoffAt?: string;
  generatedAt?: string;
  publishedAt?: string | null;
  publishedByType?: string | null;
  publishedById?: string | null;
}) {
  await client.execute({
    sql: `INSERT INTO growth_reports (
      id, project_id, fact_hash, report_type, period_start, period_end,
      version, status, report_timezone, data_cutoff_at, generated_at,
      builder_version, content_schema_version, created_by_type, created_by_id,
      published_at, published_by_type, published_by_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Europe/London', ?, ?, 'builder-v1', 1,
      'agent', 'growth-reporter', ?, ?, ?)`,
    args: [
      input.id,
      input.projectId ?? "project_1",
      hash,
      input.reportType ?? "monthly",
      input.periodStart ?? "2026-07-01",
      input.periodEnd ?? "2026-07-31",
      input.version ?? 1,
      input.status ?? "draft",
      input.dataCutoffAt ?? "2026-08-01T08:00:00.000Z",
      input.generatedAt ?? "2026-08-01T09:00:00.000Z",
      input.publishedAt ?? null,
      input.publishedByType ?? null,
      input.publishedById ?? null,
    ],
  });
}

beforeEach(async () => {
  client = createClient({ url: "file::memory:" });
  await client.executeMultiple(
    [
      "PRAGMA foreign_keys = ON;",
      "CREATE TABLE projects (id text PRIMARY KEY, domain text, archived_at text);",
      "CREATE TABLE user (id text PRIMARY KEY);",
      "INSERT INTO projects (id, domain) VALUES ('project_1', 'example.com'), ('project_2', 'other.example');",
      "INSERT INTO user (id) VALUES ('user_1');",
      previousMigrations[0],
      `INSERT INTO growth_runs (
        id, project_id, run_type, trigger, status, cadence_slot, period_start,
        period_end, started_at, completed_at, detector_version
      ) VALUES
        ('run_1', 'project_1', 'daily_monitor', 'manual', 'completed', 'slot_1',
          '2026-07-01', '2026-07-31', '2026-08-01T07:00:00.000Z',
          '2026-08-01T08:00:00.000Z', 'v1'),
        ('run_2', 'project_2', 'daily_monitor', 'manual', 'completed', 'slot_2',
          '2026-07-01', '2026-07-31', '2026-08-01T07:00:00.000Z',
          '2026-08-01T08:00:00.000Z', 'v1');`,
      previousMigrations[1],
      `INSERT INTO growth_recommendations (
        id, project_id, run_id, creation_key, fact_hash, title, rationale,
        category, impact, commercial_relevance, effort, urgency, confidence,
        priority_score, status, review_version, reviewed_at
      ) VALUES
        ('recommendation_1', 'project_1', 'run_1', 'one', '${hash}',
          'Work one', 'Useful work', 'content', 5, 5, 2, 3, 0.8, 10,
          'accepted', 1, '2026-07-01T08:00:00.000Z'),
        ('recommendation_2', 'project_2', 'run_2', 'two', '${hash}',
          'Work two', 'Useful work', 'content', 5, 5, 2, 3, 0.8, 10,
          'accepted', 1, '2026-07-01T08:00:00.000Z');`,
      previousMigrations[2],
      `INSERT INTO growth_actions (
        id, project_id, recommendation_id, creation_key, fact_hash, title,
        description, category, priority_score, status, state_version, due_at,
        approved_at, started_at, implemented_at, evaluated_at
      ) VALUES
        ('action_1', 'project_1', 'recommendation_1', 'one', '${hash}',
          'Work one', 'Ship it', 'content', 10, 'evaluated', 4,
          '2026-08-31T12:00:00.000Z', '2026-06-01T12:00:00.000Z',
          '2026-06-02T12:00:00.000Z', '2026-06-15T12:00:00.000Z',
          '2026-07-31T12:00:00.000Z'),
        ('action_2', 'project_2', 'recommendation_2', 'two', '${hash}',
          'Work two', 'Ship it', 'content', 10, 'evaluated', 4,
          '2026-08-31T12:00:00.000Z', '2026-06-01T12:00:00.000Z',
          '2026-06-02T12:00:00.000Z', '2026-06-15T12:00:00.000Z',
          '2026-07-31T12:00:00.000Z');`,
      previousMigrations[3],
      previousMigrations[4],
      `INSERT INTO growth_measurement_plans (
        id, project_id, action_id, fact_hash, status, action_version, anchor_at,
        anchor_date, report_timezone, baseline_start, baseline_end,
        cooldown_end, measurement_start, measurement_end, comparison_mode,
        completed_at
      ) VALUES
        ('plan_1', 'project_1', 'action_1', '${hash}', 'completed', 3,
          '2026-06-15T12:00:00.000Z', '2026-06-15', 'Europe/London',
          '2026-06-01', '2026-06-14', '2026-06-15', '2026-06-16',
          '2026-07-30', 'preceding_period', '2026-07-31T12:00:00.000Z'),
        ('plan_2', 'project_2', 'action_2', '${hash}', 'completed', 3,
          '2026-06-15T12:00:00.000Z', '2026-06-15', 'Europe/London',
          '2026-06-01', '2026-06-14', '2026-06-15', '2026-06-16',
          '2026-07-30', 'preceding_period', '2026-07-31T12:00:00.000Z');
       INSERT INTO growth_measurement_results (
         id, project_id, measurement_plan_id, fact_hash, observations_hash,
         outcome, confidence, summary, evaluated_at
       ) VALUES
         ('result_1', 'project_1', 'plan_1', '${hash}', '${hash}', 'positive',
           0.8, 'Clicks improved.', '2026-07-31T12:00:00.000Z'),
         ('result_2', 'project_2', 'plan_2', '${hash}', '${hash}', 'positive',
           0.8, 'Clicks improved.', '2026-07-31T12:00:00.000Z');`,
    ].join("\n"),
  );
});

afterEach(() => client.close());

describe("Growth Report D1 migration", () => {
  it("adds constrained tenant-safe snapshots with source-pruning deletion", async () => {
    expect(
      (
        await client.execute(
          "SELECT name FROM sqlite_master WHERE name = 'growth_reports'",
        )
      ).rows,
    ).toEqual([]);
    await client.executeMultiple(reportMigration);

    expect(
      await indexColumns("growth_reports", "growth_reports_family_version_key"),
    ).toEqual([
      "project_id",
      "report_type",
      "period_start",
      "period_end",
      "version",
    ]);
    expect(
      await indexColumns(
        "growth_report_sections",
        "growth_report_sections_project_report_position_key",
      ),
    ).toEqual(["project_id", "report_id", "position"]);
    expect(
      await indexColumns("growth_report_actions", "growth_report_actions_key"),
    ).toEqual(["project_id", "report_id", "action_id"]);
    expect(
      await indexColumns(
        "growth_report_measurement_results",
        "growth_report_measurement_results_key",
      ),
    ).toEqual(["project_id", "report_id", "measurement_result_id"]);

    for (const [table, checks] of [
      [
        "growth_reports",
        [
          "growth_reports_vocabulary_check",
          "growth_reports_version_check",
          "growth_reports_period_check",
          "growth_reports_lifecycle_check",
        ],
      ],
      [
        "growth_report_sections",
        [
          "growth_report_sections_vocabulary_check",
          "growth_report_sections_position_check",
          "growth_report_sections_content_json_check",
        ],
      ],
    ] as const) {
      const [row] = (
        await client.execute(
          `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = '${table}'`,
        )
      ).rows;
      expect(typeof row?.sql).toBe("string");
      for (const check of checks) expect(row?.sql).toContain(check);
    }

    await insertReport({ id: "report_1" });
    await client.execute(
      `INSERT INTO growth_report_sections
       (id, project_id, report_id, section_type, position, structured_content)
       VALUES ('section_1', 'project_1', 'report_1', 'executive_summary', 0,
         '{"summary":"Summary","items":[]}')`,
    );
    await client.execute(
      "INSERT INTO growth_report_actions VALUES ('project_1', 'report_1', 'action_1')",
    );
    await client.execute(
      "INSERT INTO growth_report_measurement_results VALUES ('project_1', 'report_1', 'result_1')",
    );

    await expect(
      insertReport({ id: "bad_type", reportType: "weekly" }),
    ).rejects.toThrow();
    await expect(
      insertReport({ id: "bad_version", version: 0 }),
    ).rejects.toThrow();
    await expect(
      insertReport({
        id: "bad_cutoff",
        dataCutoffAt: "2026-08-02T00:00:00.000Z",
      }),
    ).rejects.toThrow();
    await expect(
      insertReport({
        id: "bad_publish",
        version: 2,
        status: "published",
      }),
    ).rejects.toThrow();
    await expect(
      client.execute(
        `INSERT INTO growth_report_sections
         (id, project_id, report_id, section_type, position, structured_content)
         VALUES ('bad_position', 'project_1', 'report_1', 'performance', 0,
           '{"summary":"Summary","items":[]}')`,
      ),
    ).rejects.toThrow();
    await expect(
      client.execute(
        `INSERT INTO growth_report_sections
         (id, project_id, report_id, section_type, position, structured_content)
         VALUES ('bad_json', 'project_1', 'report_1', 'performance', 1,
           'not json')`,
      ),
    ).rejects.toThrow();
    await expect(
      client.execute(
        "INSERT INTO growth_report_actions VALUES ('project_1', 'report_1', 'action_2')",
      ),
    ).rejects.toThrow();
    await expect(
      client.execute(
        "INSERT INTO growth_report_measurement_results VALUES ('project_1', 'report_1', 'result_2')",
      ),
    ).rejects.toThrow();

    await client.execute("DELETE FROM growth_actions WHERE id = 'action_1'");
    expect(await countRows("growth_reports", "id = 'report_1'")).toBe(1);
    expect(
      await countRows("growth_report_sections", "report_id = 'report_1'"),
    ).toBe(1);
    expect(
      await countRows("growth_report_actions", "report_id = 'report_1'"),
    ).toBe(0);
    expect(
      await countRows(
        "growth_report_measurement_results",
        "report_id = 'report_1'",
      ),
    ).toBe(0);
    expect((await client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);

    await client.execute("DELETE FROM projects WHERE id = 'project_1'");
    expect(await countRows("growth_reports")).toBe(0);
    expect(await countRows("growth_report_sections")).toBe(0);
    expect(await countRows("projects", "id = 'project_2'")).toBe(1);
  });
});
