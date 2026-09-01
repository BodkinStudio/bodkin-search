/* eslint-disable max-lines, max-lines-per-function -- the full atomic Report lifecycle is clearest as one fixture */
import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type * as RunBatchModule from "@/db/runBatch";
import {
  GROWTH_REPORT_CONTENT_SCHEMA_VERSION,
  GROWTH_REPORT_SECTION_POSITIONS,
  GROWTH_REPORT_SECTION_TYPES,
  type GrowthReportSection,
} from "@/types/schemas/growth-reports";
import {
  buildGrowthReportSnapshot,
  GROWTH_REPORT_BUILDER_VERSION,
} from "../services/GrowthReportSnapshot";
import type * as MonthlyRepositoryModule from "./GrowthMonthlyReportsRepository";
import type * as RepositoryModule from "./GrowthReportsRepository";

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));

let client: Client;
let repo: typeof RepositoryModule.GrowthReportsRepository;
let monthlyRepo: typeof MonthlyRepositoryModule.GrowthMonthlyReportsRepository;
let batchParameterCounts: number[] = [];

const generatedAt = "2026-08-01T09:00:00.000Z";
const maximumActionCount = 100;
const maximumResultCount = 50;

function maximumActionId(index: number) {
  return `action_max_${String(index).padStart(3, "0")}`;
}

function maximumResultId(index: number) {
  return `result_max_${String(index).padStart(3, "0")}`;
}

function reportSections(): GrowthReportSection[] {
  return GROWTH_REPORT_SECTION_TYPES.map((sectionType) => ({
    sectionType,
    position: GROWTH_REPORT_SECTION_POSITIONS[sectionType],
    content: {
      summary: `${sectionType} summary`,
      items:
        sectionType === "executive_summary"
          ? [
              {
                key: "direct-action",
                position: 0,
                title: "Work completed",
                summary: "The planned work shipped.",
                facts: [],
                evidence: [],
                source: { type: "action", id: "action_direct" },
              },
            ]
          : sectionType === "performance"
            ? [
                {
                  key: "measured-result",
                  position: 0,
                  title: "Measured outcome",
                  summary: "Clicks improved after the measured change.",
                  facts: [
                    {
                      key: "clicks",
                      position: 0,
                      label: "Clicks",
                      value: 125,
                    },
                  ],
                  evidence: [
                    { kind: "gsc_period", ref: "gsc:pricing:measurement" },
                  ],
                  source: {
                    type: "measurement_result",
                    id: "result_1",
                  },
                },
              ]
            : [],
    },
  }));
}

function maximumReportSections(): GrowthReportSection[] {
  return GROWTH_REPORT_SECTION_TYPES.map((sectionType) => ({
    sectionType,
    position: GROWTH_REPORT_SECTION_POSITIONS[sectionType],
    content: {
      summary: `${sectionType} summary`,
      items:
        sectionType === "work_completed"
          ? Array.from({ length: maximumActionCount }, (_, index) => ({
              key: `action-${index}`,
              position: index,
              title: `Completed action ${index}`,
              summary: "The planned work shipped.",
              facts: [],
              evidence: [],
              source: { type: "action" as const, id: maximumActionId(index) },
            }))
          : sectionType === "performance"
            ? Array.from({ length: maximumResultCount }, (_, index) => ({
                key: `result-${index}`,
                position: index,
                title: `Measured result ${index}`,
                summary: "The measured outcome completed.",
                facts: [],
                evidence: [],
                source: {
                  type: "measurement_result" as const,
                  id: maximumResultId(index),
                },
              }))
            : [],
    },
  }));
}

async function reportWrite(
  version = 1,
  overrides: Record<string, unknown> = {},
  sections = reportSections(),
) {
  const snapshot = await buildGrowthReportSnapshot({
    projectId: "project_1",
    reportType: "monthly",
    periodStart: "2026-07-01",
    periodEnd: "2026-07-31",
    version,
    reportTimezone: "Europe/London",
    dataCutoffAt: "2026-08-01T08:00:00.000Z",
    generatedAt,
    builderVersion: GROWTH_REPORT_BUILDER_VERSION,
    contentSchemaVersion: GROWTH_REPORT_CONTENT_SCHEMA_VERSION,
    createdByType: "agent",
    createdById: "growth-reporter",
    sections,
  });
  return {
    id: `report_${version}`,
    projectId: "project_1",
    factHash: snapshot.factHash,
    reportType: "monthly" as const,
    periodStart: "2026-07-01",
    periodEnd: "2026-07-31",
    version,
    reportTimezone: "Europe/London",
    dataCutoffAt: "2026-08-01T08:00:00.000Z",
    generatedAt,
    builderVersion: GROWTH_REPORT_BUILDER_VERSION,
    contentSchemaVersion: GROWTH_REPORT_CONTENT_SCHEMA_VERSION,
    createdByType: "agent" as const,
    createdById: "growth-reporter",
    sections: snapshot.sections.map((section, index) => ({
      id: `section_${version}_${index}`,
      ...section,
    })),
    actionIds: ["action_direct", "action_result"],
    measurementResultIds: ["result_1"],
    ...overrides,
  };
}

async function seedMaximumSources() {
  const recommendations = Array.from(
    { length: maximumActionCount },
    (_, index) => `
      INSERT INTO growth_recommendations (
        id, project_id, run_id, creation_key, fact_hash, title, rationale,
        category, impact, commercial_relevance, effort, urgency, confidence,
        priority_score, status, review_version, reviewed_at
      ) SELECT
        'recommendation_max_${index}', project_id, run_id, 'max_${index}', fact_hash,
        title, rationale, category, impact, commercial_relevance, effort, urgency,
        confidence, priority_score, status, review_version, reviewed_at
      FROM growth_recommendations WHERE id = 'recommendation_result';
      INSERT INTO growth_actions (
        id, project_id, recommendation_id, creation_key, fact_hash, title,
        description, category, priority_score, status, state_version, due_at,
        approved_at, started_at, implemented_at, evaluated_at
      ) SELECT
        '${maximumActionId(index)}', project_id, 'recommendation_max_${index}',
        'max_${index}', fact_hash, title, description, category, priority_score,
        status, state_version, due_at, approved_at, started_at, implemented_at,
        evaluated_at
      FROM growth_actions WHERE id = 'action_result';`,
  );
  const measurements = Array.from(
    { length: maximumResultCount },
    (_, index) => `
      INSERT INTO growth_measurement_plans (
        id, project_id, action_id, fact_hash, status, action_version, anchor_at,
        anchor_date, report_timezone, baseline_start, baseline_end, cooldown_end,
        measurement_start, measurement_end, comparison_mode, completed_at
      ) SELECT
        'plan_max_${index}', project_id, '${maximumActionId(index)}', fact_hash,
        status, action_version, anchor_at, anchor_date, report_timezone,
        baseline_start, baseline_end, cooldown_end, measurement_start,
        measurement_end, comparison_mode, completed_at
      FROM growth_measurement_plans WHERE id = 'plan_1';
      INSERT INTO growth_measurement_results (
        id, project_id, measurement_plan_id, fact_hash, observations_hash,
        outcome, confidence, summary, evaluated_at
      ) SELECT
        '${maximumResultId(index)}', project_id, 'plan_max_${index}', fact_hash,
        observations_hash, outcome, confidence, summary, evaluated_at
      FROM growth_measurement_results WHERE id = 'result_1';`,
  );
  await client.executeMultiple(
    [...recommendations, ...measurements].join("\n"),
  );
}

type MonthlyActionSeed = {
  id: string;
  status:
    | "approved"
    | "ready"
    | "in_progress"
    | "blocked"
    | "implemented"
    | "measuring"
    | "evaluated"
    | "cancelled";
  dueAt: string;
  priorityScore?: number;
  implementedAt?: string | null;
  evaluatedAt?: string | null;
  approvedAt?: string;
  updatedAt?: string;
};

function sqlValue(value: string | null) {
  return value == null ? "NULL" : `'${value.replaceAll("'", "''")}'`;
}

function monthlyActionSql(seed: MonthlyActionSeed) {
  const recommendationId = `recommendation_${seed.id}`;
  const approvedAt = seed.approvedAt ?? "2026-06-01T12:00:00.000Z";
  const startedAt = [
    "in_progress",
    "blocked",
    "implemented",
    "measuring",
    "evaluated",
  ].includes(seed.status)
    ? "2026-06-02T12:00:00.000Z"
    : null;
  const implementedAt = seed.implementedAt ?? null;
  const evaluatedAt = seed.evaluatedAt ?? null;
  const cancelledAt =
    seed.status === "cancelled" ? "2026-07-02T12:00:00.000Z" : null;
  return `
    INSERT INTO growth_recommendations (
      id, project_id, run_id, creation_key, fact_hash, title, rationale,
      category, impact, commercial_relevance, effort, urgency, confidence,
      priority_score, status, review_version, reviewed_at
    ) SELECT
      '${recommendationId}', project_id, run_id, 'monthly_${seed.id}',
      fact_hash, 'Monthly ${seed.id}', rationale, category, impact,
      commercial_relevance, effort, urgency, confidence,
      ${seed.priorityScore ?? 10}, status, review_version, reviewed_at
    FROM growth_recommendations WHERE id = 'recommendation_direct';
    INSERT INTO growth_actions (
      id, project_id, recommendation_id, creation_key, fact_hash, title,
      description, category, priority_score, status, state_version, due_at,
      approved_at, started_at, implemented_at, evaluated_at, cancelled_at,
      created_at, updated_at
    ) VALUES (
      '${seed.id}', 'project_1', '${recommendationId}', 'monthly_${seed.id}',
      '${"9".repeat(64)}', 'Monthly ${seed.id}', 'Monthly source policy',
      'content', ${seed.priorityScore ?? 10}, '${seed.status}',
      ${seed.status === "approved" ? 0 : 1}, '${seed.dueAt}',
      '${approvedAt}', ${sqlValue(startedAt)},
      ${sqlValue(implementedAt)}, ${sqlValue(evaluatedAt)},
      ${sqlValue(cancelledAt)}, '${approvedAt}',
      '${seed.updatedAt ?? "2026-08-01T12:00:00.000Z"}'
    );`;
}

async function countRows(table: string, where = "1 = 1") {
  const [row] = (
    await client.execute(
      `SELECT count(*) AS count FROM ${table} WHERE ${where}`,
    )
  ).rows;
  return Number(row?.count ?? 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSqlCompiler(
  value: unknown,
): value is (this: Record<string, unknown>) => unknown {
  return typeof value === "function";
}

function parameterCount(statement: unknown): number {
  if (!isRecord(statement))
    throw new TypeError("Expected a Drizzle batch statement");
  const toSQL = statement.toSQL;
  if (!isSqlCompiler(toSQL))
    throw new TypeError("Expected a Drizzle batch statement with toSQL");
  const compiled = toSQL.call(statement);
  if (!isRecord(compiled)) throw new TypeError("Expected compiled Drizzle SQL");
  const params = compiled.params;
  if (!Array.isArray(params))
    throw new TypeError("Expected compiled Drizzle SQL parameters");
  return params.length;
}

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  const testDb = drizzle(client);
  vi.doMock("@/db", () => ({ db: testDb }));
  type BatchStatement = Parameters<typeof testDb.batch>[0][number];
  vi.doMock("@/db/runBatch", async (loadOriginal) => {
    const original = await loadOriginal<typeof RunBatchModule>();
    return {
      ...original,
      runBatch: async (
        build: (tx: typeof testDb) => readonly Promise<unknown>[],
      ): Promise<void> => {
        const statements = build(testDb);
        if (statements.length === 0) return;
        batchParameterCounts.push(...statements.map(parameterCount));
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the length guard proves this tuple is non-empty
        const batch = statements as unknown as [
          BatchStatement,
          ...BatchStatement[],
        ];
        await testDb.batch(batch);
      },
    };
  });

  const migration = (path: string) => readFileSync(path, "utf8");
  await client.executeMultiple(
    [
      "PRAGMA foreign_keys = ON;",
      "CREATE TABLE projects (id text PRIMARY KEY, domain text, archived_at text);",
      "CREATE TABLE user (id text PRIMARY KEY);",
      `CREATE TABLE project_key_pages (
        id text PRIMARY KEY, project_id text NOT NULL, url text NOT NULL,
        role text NOT NULL, topic text, notes text, updated_at text NOT NULL,
        updated_by text NOT NULL
      );`,
      "INSERT INTO projects (id, domain) VALUES ('project_1', 'example.com'), ('project_2', 'other.example');",
      "INSERT INTO user (id) VALUES ('user_1');",
      migration("drizzle/0043_wild_proteus.sql"),
      migration("drizzle/0044_glossy_komodo.sql"),
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
      migration("drizzle/0045_mean_retro_girl.sql"),
      `INSERT INTO growth_recommendations (
        id, project_id, run_id, creation_key, fact_hash, title, rationale,
        category, impact, commercial_relevance, effort, urgency, confidence,
        priority_score, status, review_version, reviewed_at
      ) VALUES
        ('recommendation_direct', 'project_1', 'run_1', 'direct',
          '${"a".repeat(64)}', 'Direct work', 'Useful work', 'content',
          5, 5, 2, 3, 0.8, 10, 'accepted', 1, '2026-07-01T08:00:00.000Z'),
        ('recommendation_result', 'project_1', 'run_1', 'result',
          '${"b".repeat(64)}', 'Measured work', 'Useful work', 'content',
          5, 5, 2, 3, 0.8, 10, 'accepted', 1, '2026-07-01T08:00:00.000Z'),
        ('recommendation_foreign', 'project_2', 'run_2', 'foreign',
          '${"c".repeat(64)}', 'Foreign work', 'Useful work', 'content',
          5, 5, 2, 3, 0.8, 10, 'accepted', 1, '2026-07-01T08:00:00.000Z');`,
      migration("drizzle/0046_living_misty_knight.sql"),
      `INSERT INTO growth_actions (
        id, project_id, recommendation_id, creation_key, fact_hash, title,
        description, category, priority_score, status, state_version, due_at,
        approved_at, started_at, implemented_at, evaluated_at
      ) VALUES
        ('action_direct', 'project_1', 'recommendation_direct', 'direct',
          '${"d".repeat(64)}', 'Direct work', 'Ship it', 'content', 10,
          'implemented', 2, '2026-08-31T12:00:00.000Z',
          '2026-07-01T12:00:00.000Z', '2026-07-02T12:00:00.000Z',
          '2026-07-15T12:00:00.000Z', NULL),
        ('action_result', 'project_1', 'recommendation_result', 'result',
          '${"e".repeat(64)}', 'Measured work', 'Ship it', 'content', 10,
          'evaluated', 4, '2026-08-31T12:00:00.000Z',
          '2026-06-01T12:00:00.000Z', '2026-06-02T12:00:00.000Z',
          '2026-06-15T12:00:00.000Z', '2026-07-31T12:00:00.000Z'),
        ('action_foreign', 'project_2', 'recommendation_foreign', 'foreign',
          '${"f".repeat(64)}', 'Foreign work', 'Ship it', 'content', 10,
          'evaluated', 4, '2026-08-31T12:00:00.000Z',
          '2026-06-01T12:00:00.000Z', '2026-06-02T12:00:00.000Z',
          '2026-06-15T12:00:00.000Z', '2026-07-31T12:00:00.000Z');`,
      migration("drizzle/0047_flaky_felicia_hardy.sql"),
      migration("drizzle/0048_dry_kate_bishop.sql"),
      `INSERT INTO growth_measurement_plans (
        id, project_id, action_id, fact_hash, status, action_version, anchor_at,
        anchor_date, report_timezone, baseline_start, baseline_end,
        cooldown_end, measurement_start, measurement_end, comparison_mode,
        completed_at
      ) VALUES
        ('plan_1', 'project_1', 'action_result', '${"1".repeat(64)}',
          'completed', 3, '2026-06-15T12:00:00.000Z', '2026-06-15',
          'Europe/London', '2026-06-01', '2026-06-14', '2026-06-15',
          '2026-06-16', '2026-07-30', 'preceding_period',
          '2026-07-31T12:00:00.000Z'),
        ('plan_foreign', 'project_2', 'action_foreign', '${"2".repeat(64)}',
          'completed', 3, '2026-06-15T12:00:00.000Z', '2026-06-15',
          'Europe/London', '2026-06-01', '2026-06-14', '2026-06-15',
          '2026-06-16', '2026-07-30', 'preceding_period',
          '2026-07-31T12:00:00.000Z');
       INSERT INTO growth_measurement_results (
         id, project_id, measurement_plan_id, fact_hash, observations_hash,
         outcome, confidence, summary, evaluated_at
       ) VALUES
         ('result_1', 'project_1', 'plan_1', '${"3".repeat(64)}',
           '${"4".repeat(64)}', 'positive', 0.8, 'Clicks improved.',
           '2026-07-31T12:00:00.000Z'),
         ('result_foreign', 'project_2', 'plan_foreign', '${"5".repeat(64)}',
           '${"6".repeat(64)}', 'positive', 0.8, 'Clicks improved.',
           '2026-07-31T12:00:00.000Z');`,
      migration("drizzle/0049_gray_hedge_knight.sql"),
    ].join("\n"),
  );
  ({ GrowthReportsRepository: repo } =
    await import("./GrowthReportsRepository"));
  ({ GrowthMonthlyReportsRepository: monthlyRepo } =
    await import("./GrowthMonthlyReportsRepository"));
});

afterAll(() => client.close());

describe.sequential("GrowthReportsRepository D1 lifecycle", () => {
  it("publishes the maximum source graph within D1's statement parameter budget", async () => {
    await seedMaximumSources();
    const write = await reportWrite(
      10,
      {
        actionIds: Array.from({ length: maximumActionCount }, (_, index) =>
          maximumActionId(index),
        ),
        measurementResultIds: Array.from(
          { length: maximumResultCount },
          (_, index) => maximumResultId(index),
        ),
      },
      maximumReportSections(),
    );
    expect(write.actionIds).toHaveLength(maximumActionCount);
    expect(write.measurementResultIds).toHaveLength(maximumResultCount);

    batchParameterCounts = [];
    await repo.createGrowthReportGraph(write);

    const publish = (overrides: Partial<typeof write> = {}) =>
      repo.publishGrowthReportGraph({
        projectId: write.projectId,
        reportId: write.id,
        factHash: write.factHash,
        publishedAt: "2026-08-01T10:00:00.000Z",
        publishedByType: "user",
        publishedById: "user_1",
        sections: write.sections,
        actionIds: write.actionIds,
        measurementResultIds: write.measurementResultIds,
        ...overrides,
      });

    await publish({
      actionIds: ["action_direct", ...write.actionIds.slice(1)],
    });
    expect(await repo.getReport("project_1", write.id)).toMatchObject({
      status: "draft",
    });

    await publish({
      actionIds: [
        maximumActionId(0),
        maximumActionId(0),
        ...write.actionIds.slice(2),
      ],
    });
    expect(await repo.getReport("project_1", write.id)).toMatchObject({
      status: "draft",
    });

    await publish({
      measurementResultIds: [
        "result_1",
        ...write.measurementResultIds.slice(1),
      ],
    });
    expect(await repo.getReport("project_1", write.id)).toMatchObject({
      status: "draft",
    });

    await publish({
      measurementResultIds: [
        maximumResultId(0),
        maximumResultId(0),
        ...write.measurementResultIds.slice(2),
      ],
    });
    expect(await repo.getReport("project_1", write.id)).toMatchObject({
      status: "draft",
    });

    await publish();
    expect(await repo.getReport("project_1", write.id)).toMatchObject({
      status: "published",
    });
    expect(batchParameterCounts).not.toHaveLength(0);
    expect(batchParameterCounts.every((count) => count <= 100)).toBe(true);

    await client.execute(`DELETE FROM growth_reports WHERE id = '${write.id}'`);
    expect(await countRows("growth_reports", "id = 'report_10'")).toBe(0);
  });

  it("guards report creation against persisted and newly-created settings drift", async () => {
    const firstUpdatedAt = "2026-08-01T08:00:00.000Z";
    await client.execute({
      sql: `INSERT INTO growth_project_settings (
        project_id, growth_enabled, report_timezone, report_cadence,
        report_day, created_at, updated_at
      ) VALUES (?, 1, 'Europe/London', 'monthly', 1, ?, ?)`,
      args: ["project_1", firstUpdatedAt, firstUpdatedAt],
    });

    const matchingPersisted = {
      ...(await reportWrite(11)),
      expectedSettings: {
        reportTimezone: "Europe/London",
        updatedAt: firstUpdatedAt,
        persisted: true,
      },
    } as const;
    await repo.createGrowthReportGraph(matchingPersisted);
    expect(await countRows("growth_reports", "id = 'report_11'")).toBe(1);
    await client.execute("DELETE FROM growth_reports WHERE id = 'report_11'");

    await client.execute(
      `UPDATE growth_project_settings
       SET report_timezone = 'UTC', updated_at = '2026-08-01T09:00:00.000Z'
       WHERE project_id = 'project_1'`,
    );
    await repo.createGrowthReportGraph({
      ...(await reportWrite(12)),
      expectedSettings: matchingPersisted.expectedSettings,
    });
    expect(await countRows("growth_reports", "id = 'report_12'")).toBe(0);
    expect(
      await countRows("growth_report_sections", "report_id = 'report_12'"),
    ).toBe(0);

    await repo.createGrowthReportGraph({
      ...(await reportWrite(13)),
      expectedSettings: {
        reportTimezone: "UTC",
        updatedAt: "2026-08-01T09:00:00.000Z",
        persisted: true,
      },
    });
    expect(await countRows("growth_reports", "id = 'report_13'")).toBe(0);

    await client.execute(
      "DELETE FROM growth_project_settings WHERE project_id = 'project_1'",
    );
    const matchingAbsent = {
      ...(await reportWrite(14)),
      expectedSettings: {
        reportTimezone: "Europe/London",
        updatedAt: null,
        persisted: false,
      },
    } as const;
    await repo.createGrowthReportGraph(matchingAbsent);
    expect(await countRows("growth_reports", "id = 'report_14'")).toBe(1);
    await client.execute("DELETE FROM growth_reports WHERE id = 'report_14'");

    await client.execute({
      sql: `INSERT INTO growth_project_settings (
        project_id, growth_enabled, report_timezone, report_cadence,
        report_day, created_at, updated_at
      ) VALUES (?, 1, 'Europe/London', 'monthly', 1, ?, ?)`,
      args: ["project_1", firstUpdatedAt, firstUpdatedAt],
    });
    await repo.createGrowthReportGraph({
      ...(await reportWrite(15)),
      expectedSettings: matchingAbsent.expectedSettings,
    });
    expect(await countRows("growth_reports", "id = 'report_15'")).toBe(0);
    expect(
      await countRows("growth_report_sections", "report_id = 'report_15'"),
    ).toBe(0);
    await client.execute(
      "DELETE FROM growth_project_settings WHERE project_id = 'project_1'",
    );
  });

  it("selects bounded monthly sources with stable caps and disjoint queues", async () => {
    await client.executeMultiple(`
      DELETE FROM growth_measurement_results WHERE id LIKE 'result_max_%';
      DELETE FROM growth_measurement_plans WHERE id LIKE 'plan_max_%';
      DELETE FROM growth_actions WHERE id LIKE 'action_max_%';
      DELETE FROM growth_recommendations WHERE id LIKE 'recommendation_max_%';
      UPDATE growth_actions
      SET updated_at = '2026-08-01T12:00:00.000Z'
      WHERE id IN ('action_direct', 'action_result');
      UPDATE growth_measurement_results
      SET created_at = '2026-08-01T12:00:00.000Z'
      WHERE id = 'result_1';
    `);
    const bounds = {
      dataCutoffAt: "2026-08-02T00:00:00.000Z",
      periodStartAt: "2026-07-01T00:00:00.000Z",
      periodEndExclusiveAt: "2026-08-01T00:00:00.000Z",
      cutoffStartAt: "2026-08-02T00:00:00.000Z",
      nextMonthStartAt: "2026-08-01T00:00:00.000Z",
      nextMonthEndExclusiveAt: "2026-09-01T00:00:00.000Z",
    };
    const capIds = [
      "monthly_cap_f",
      "monthly_cap_A",
      "monthly_cap_c",
      "monthly_cap_B",
      "monthly_cap_e",
      "monthly_cap_C",
      "monthly_cap_a",
      "monthly_cap_D",
      "monthly_cap_b",
      "monthly_cap_E",
      "monthly_cap_d",
      "monthly_cap_F",
      "monthly_cap_0",
      "monthly_cap_z",
    ];
    await client.executeMultiple(
      capIds
        .map((id) =>
          monthlyActionSql({
            id,
            status: "blocked",
            dueAt: "2026-10-01T12:00:00.000Z",
          }),
        )
        .join("\n"),
    );
    const expectedRiskIds = capIds.toSorted().slice(0, 13);
    const lastReturnedId = expectedRiskIds.at(-1)!;
    await client.execute({
      sql: `INSERT INTO growth_action_targets (
        project_id, action_id, target_type, target_value
      ) VALUES ('project_1', ?, 'url', 'https://example.com/cap-boundary')`,
      args: [lastReturnedId],
    });

    const capped = await monthlyRepo.listMonthlySourceFacts(
      "project_1",
      bounds,
    );
    expect(capped.risks.map(({ id }) => id)).toEqual(expectedRiskIds);
    expect(capped.risks).toHaveLength(13);
    expect(capped.actionUrls).toContainEqual({
      actionId: lastReturnedId,
      url: "https://example.com/cap-boundary",
    });

    await client.execute(
      "DELETE FROM growth_actions WHERE id LIKE 'monthly_cap_%'",
    );
    await client.execute(
      "DELETE FROM growth_recommendations WHERE id LIKE 'recommendation_monthly_cap_%'",
    );

    const policyActions: MonthlyActionSeed[] = [
      {
        id: "monthly_blocked",
        status: "blocked",
        dueAt: "2026-10-01T12:00:00.000Z",
      },
      {
        id: "monthly_overdue",
        status: "ready",
        dueAt: "2026-08-01T23:59:59.999Z",
      },
      {
        id: "monthly_due_cutoff",
        status: "ready",
        dueAt: "2026-08-02T00:00:00.000Z",
      },
      {
        id: "monthly_next",
        status: "in_progress",
        dueAt: "2026-08-15T12:00:00.000Z",
      },
      {
        id: "monthly_opportunity",
        status: "approved",
        dueAt: "2026-10-01T12:00:00.000Z",
      },
      {
        id: "monthly_after_cutoff",
        status: "ready",
        dueAt: "2026-10-02T12:00:00.000Z",
        updatedAt: "2026-08-03T00:00:00.000Z",
      },
      {
        id: "monthly_cancelled",
        status: "cancelled",
        dueAt: "2026-08-20T12:00:00.000Z",
      },
      {
        id: "monthly_complete_start",
        status: "implemented",
        dueAt: "2026-07-20T12:00:00.000Z",
        implementedAt: "2026-07-01T00:00:00.000Z",
      },
      {
        id: "monthly_complete_end",
        status: "implemented",
        dueAt: "2026-08-20T12:00:00.000Z",
        implementedAt: "2026-08-01T00:00:00.000Z",
      },
      {
        id: "monthly_same_period_result",
        status: "evaluated",
        dueAt: "2026-07-20T12:00:00.000Z",
        implementedAt: "2026-07-10T12:00:00.000Z",
        evaluatedAt: "2026-07-20T12:00:00.000Z",
      },
    ];
    for (const seed of policyActions) {
      try {
        await client.executeMultiple(monthlyActionSql(seed));
      } catch (error) {
        throw new Error(`Failed to seed ${seed.id}`, { cause: error });
      }
    }
    await client.executeMultiple(`
      INSERT INTO growth_measurement_plans (
        id, project_id, action_id, fact_hash, status, action_version, anchor_at,
        anchor_date, report_timezone, baseline_start, baseline_end,
        cooldown_end, measurement_start, measurement_end, comparison_mode,
        completed_at
      ) VALUES (
        'monthly_same_period_plan', 'project_1',
        'monthly_same_period_result', '${"7".repeat(64)}', 'completed', 1,
        '2026-07-10T12:00:00.000Z', '2026-07-10', 'UTC', '2026-06-01',
        '2026-06-30', '2026-07-10', '2026-07-11', '2026-07-19',
        'preceding_period', '2026-07-20T12:00:00.000Z'
      );
      INSERT INTO growth_measurement_results (
        id, project_id, measurement_plan_id, fact_hash, observations_hash,
        outcome, confidence, summary, evaluated_at, created_at
      ) VALUES (
        'monthly_same_period_result_row', 'project_1',
        'monthly_same_period_plan', '${"6".repeat(64)}', '${"5".repeat(64)}',
        'positive', 0.8, 'Same-period result',
        '2026-07-20T12:00:00.000Z', '2026-08-01T12:00:00.000Z'
      );
      INSERT INTO growth_change_events (
        id, project_id, creation_key, fact_hash, source, change_type,
        actor_type, actor_id, description, happened_at, created_at
      ) VALUES
        ('monthly_change_zero', 'project_1', 'monthly_change_zero',
          '${"1".repeat(64)}', 'manual', 'content_updated', 'user', 'user_1',
          'Zero links', '2026-07-12T12:00:00.000Z',
          '2026-08-01T12:00:00.000Z'),
        ('monthly_change_one', 'project_1', 'monthly_change_one',
          '${"2".repeat(64)}', 'manual', 'content_updated', 'user', 'user_1',
          'One link', '2026-07-11T12:00:00.000Z',
          '2026-08-01T12:00:00.000Z'),
        ('monthly_change_multi', 'project_1', 'monthly_change_multi',
          '${"3".repeat(64)}', 'manual', 'content_updated', 'user', 'user_1',
          'Multiple links', '2026-07-10T12:00:00.000Z',
          '2026-08-01T12:00:00.000Z'),
        ('monthly_change_late', 'project_1', 'monthly_change_late',
          '${"4".repeat(64)}', 'manual', 'content_updated', 'user', 'user_1',
          'Created after cutoff', '2026-07-09T12:00:00.000Z',
          '2026-08-03T12:00:00.000Z');
      INSERT INTO growth_action_changes (project_id, action_id, change_event_id)
      VALUES
        ('project_1', 'monthly_opportunity', 'monthly_change_one'),
        ('project_1', 'monthly_next', 'monthly_change_multi'),
        ('project_1', 'monthly_due_cutoff', 'monthly_change_multi');
    `);

    const selected = await monthlyRepo.listMonthlySourceFacts(
      "project_1",
      bounds,
    );
    expect(selected.performance.map(({ id }) => id)).toEqual([
      "result_1",
      "monthly_same_period_result_row",
    ]);
    expect(selected.earlierResults.map(({ id }) => id)).toEqual(["result_1"]);
    expect(selected.completed.map(({ id }) => id)).toEqual(
      expect.arrayContaining([
        "action_direct",
        "monthly_complete_start",
        "monthly_same_period_result",
      ]),
    );
    expect(selected.completed.map(({ id }) => id)).not.toContain(
      "monthly_complete_end",
    );
    expect(selected.risks.map(({ id }) => id)).toEqual(
      expect.arrayContaining(["monthly_blocked", "monthly_overdue"]),
    );
    expect(selected.risks.map(({ id }) => id)).not.toContain(
      "monthly_due_cutoff",
    );
    expect(selected.next.map(({ id }) => id)).toEqual([
      "monthly_due_cutoff",
      "monthly_next",
    ]);
    expect(selected.opportunities.map(({ id }) => id)).toEqual(
      expect.arrayContaining(["monthly_opportunity"]),
    );
    expect(selected.opportunities.map(({ id }) => id)).not.toContain(
      "monthly_due_cutoff",
    );
    const queues = [selected.risks, selected.next, selected.opportunities].map(
      (rows) => new Set(rows.map(({ id }) => id)),
    );
    expect(
      [...queues[0]].filter((id) => queues[1].has(id) || queues[2].has(id)),
    ).toEqual([]);
    expect([...queues[1]].filter((id) => queues[2].has(id))).toEqual([]);
    const queuedIds = [...queues[0], ...queues[1], ...queues[2]];
    expect(queuedIds).not.toContain("monthly_after_cutoff");
    expect(queuedIds).not.toContain("monthly_cancelled");
    expect(selected.changes.map(({ id }) => id)).toEqual([
      "monthly_change_zero",
      "monthly_change_one",
      "monthly_change_multi",
    ]);
    const linkCounts = new Map<string, number>();
    for (const link of selected.links)
      linkCounts.set(
        link.changeEventId,
        (linkCounts.get(link.changeEventId) ?? 0) + 1,
      );
    expect(linkCounts.get("monthly_change_zero") ?? 0).toBe(0);
    expect(linkCounts.get("monthly_change_one")).toBe(1);
    expect(linkCounts.get("monthly_change_multi")).toBe(2);
    expect(JSON.stringify(selected)).not.toContain("action_foreign");
    expect(JSON.stringify(selected)).not.toContain("result_foreign");

    await client.executeMultiple(
      [
        monthlyActionSql({
          id: "monthly_cairo_previous_date",
          status: "ready",
          dueAt: "2026-04-23T21:59:59.999Z",
          approvedAt: "2026-03-01T12:00:00.000Z",
          updatedAt: "2026-04-24T08:00:00.000Z",
        }),
        monthlyActionSql({
          id: "monthly_cairo_cutoff",
          status: "ready",
          dueAt: "2026-04-23T22:00:00.000Z",
          approvedAt: "2026-03-01T12:00:00.000Z",
          updatedAt: "2026-04-24T08:00:00.000Z",
        }),
      ].join("\n"),
    );
    const cairoCutoff = await monthlyRepo.listMonthlySourceFacts("project_1", {
      dataCutoffAt: "2026-04-24T12:00:00.000Z",
      periodStartAt: "2026-03-31T22:00:00.000Z",
      periodEndExclusiveAt: "2026-04-30T21:00:00.000Z",
      cutoffStartAt: "2026-04-23T22:00:00.000Z",
      nextMonthStartAt: "2026-04-30T21:00:00.000Z",
      nextMonthEndExclusiveAt: "2026-05-31T21:00:00.000Z",
    });
    expect(cairoCutoff.risks.map(({ id }) => id)).toContain(
      "monthly_cairo_previous_date",
    );
    expect(cairoCutoff.risks.map(({ id }) => id)).not.toContain(
      "monthly_cairo_cutoff",
    );
  });

  it("bounds monthly URL facts at the canonical per-source cap", async () => {
    const actionUrls = Array.from(
      { length: 101 },
      (_, index) =>
        `('project_2', 'action_foreign', 'url', 'https://other.example/action-${String(index).padStart(3, "0")}')`,
    );
    const changeUrls = Array.from(
      { length: 101 },
      (_, index) =>
        `('project_2', 'monthly_foreign_change', 'https://other.example/change-${String(index).padStart(3, "0")}')`,
    );
    await client.executeMultiple(`
      INSERT INTO growth_action_targets (
        project_id, action_id, target_type, target_value
      ) VALUES ${actionUrls.join(",\n")};
      INSERT INTO growth_change_events (
        id, project_id, creation_key, fact_hash, source, change_type,
        actor_type, actor_id, description, happened_at
      ) VALUES (
        'monthly_foreign_change', 'project_2', 'monthly_foreign_change',
        '${"8".repeat(64)}', 'manual', 'content_updated', 'user', 'user_1',
        'Bound the URL source read', '2026-07-15T12:00:00.000Z'
      );
      INSERT INTO growth_change_event_urls (
        project_id, change_event_id, url
      ) VALUES ${changeUrls.join(",\n")};
    `);
    const selected = await monthlyRepo.listMonthlySourceFacts("project_2", {
      dataCutoffAt: "9999-12-31T23:59:59.999Z",
      periodStartAt: "2026-07-01T00:00:00.000Z",
      periodEndExclusiveAt: "2026-08-01T00:00:00.000Z",
      cutoffStartAt: "2026-08-01T00:00:00.000Z",
      nextMonthStartAt: "2026-08-01T00:00:00.000Z",
      nextMonthEndExclusiveAt: "2026-09-01T00:00:00.000Z",
    });
    expect(selected.actionUrls).toHaveLength(100);
    expect(selected.changeUrls).toHaveLength(100);
    expect(selected.actionUrls.at(-1)?.url).toBe(
      "https://other.example/action-099",
    );
    expect(selected.changeUrls.at(-1)?.url).toBe(
      "https://other.example/change-099",
    );
  });

  it("creates, isolates, publishes and preserves one frozen graph", async () => {
    const write = await reportWrite();
    await repo.createGrowthReportGraph(write);
    await repo.createGrowthReportGraph({
      ...write,
      id: "report_retry",
      sections: write.sections.map((section) => ({
        ...section,
        id: `${section.id}_retry`,
      })),
    });
    await repo.createGrowthReportGraph({
      ...write,
      id: "report_drift",
      factHash: "0".repeat(64),
      sections: write.sections.map((section) => ({
        ...section,
        id: `${section.id}_drift`,
      })),
    });

    const graph = await repo.getReportGraph("project_1", "report_1");
    expect(graph?.report).toMatchObject({
      id: "report_1",
      factHash: write.factHash,
      status: "draft",
      reportTimezone: "Europe/London",
      createdAt: generatedAt,
    });
    expect(graph?.sections).toHaveLength(8);
    expect(graph?.sections.map(({ position }) => position)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7,
    ]);
    expect(graph?.actionIds).toEqual(["action_direct", "action_result"]);
    expect(graph?.measurementResultIds).toEqual(["result_1"]);
    expect(await repo.getReportGraph("project_2", "report_1")).toBeNull();
    expect(await countRows("growth_reports")).toBe(1);

    await expect(
      repo.createGrowthReportGraph(
        await reportWrite(2, { actionIds: ["missing_action"] }),
      ),
    ).rejects.toThrow();
    expect(await countRows("growth_reports", "version = 2")).toBe(0);
    await expect(
      repo.createGrowthReportGraph(
        await reportWrite(3, { actionIds: ["action_foreign"] }),
      ),
    ).rejects.toThrow();
    expect(await countRows("growth_reports", "version = 3")).toBe(0);

    await repo.publishGrowthReportGraph({
      projectId: "project_1",
      reportId: "report_1",
      factHash: write.factHash,
      publishedAt: "2026-08-01T10:00:00.000Z",
      publishedByType: "user",
      publishedById: "user_1",
      sections: write.sections,
      actionIds: write.actionIds,
      measurementResultIds: write.measurementResultIds,
    });
    await repo.publishGrowthReportGraph({
      projectId: "project_1",
      reportId: "report_1",
      factHash: write.factHash,
      publishedAt: "2026-08-01T11:00:00.000Z",
      publishedByType: "agent",
      publishedById: "late-agent",
      sections: write.sections,
      actionIds: write.actionIds,
      measurementResultIds: write.measurementResultIds,
    });
    expect(await repo.getReport("project_1", "report_1")).toMatchObject({
      status: "published",
      publishedAt: "2026-08-01T10:00:00.000Z",
      publishedByType: "user",
      publishedById: "user_1",
    });

    await client.execute(
      "DELETE FROM growth_measurement_results WHERE id = 'result_1'",
    );
    const afterResultSourceDeletion = await repo.getReportGraph(
      "project_1",
      "report_1",
    );
    expect(afterResultSourceDeletion?.sections).toHaveLength(8);
    expect(afterResultSourceDeletion?.actionIds).toEqual([
      "action_direct",
      "action_result",
    ]);
    expect(afterResultSourceDeletion?.measurementResultIds).toEqual([]);
    expect(await countRows("growth_reports")).toBe(1);

    await client.execute(
      "DELETE FROM growth_actions WHERE id = 'action_result'",
    );
    expect(await repo.listActionIds("project_1", "report_1")).toEqual([
      "action_direct",
    ]);

    await client.execute(
      "DELETE FROM growth_actions WHERE id = 'action_direct'",
    );
    expect(await repo.listActionIds("project_1", "report_1")).toEqual([]);
    expect(await countRows("growth_report_sections")).toBe(8);
    expect((await client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);

    await client.execute("DELETE FROM projects WHERE id = 'project_1'");
    expect(await countRows("growth_reports")).toBe(0);
    expect(await countRows("growth_report_sections")).toBe(0);
    expect(await countRows("projects", "id = 'project_2'")).toBe(1);
  });
});
