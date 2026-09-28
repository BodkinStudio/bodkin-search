/* eslint-disable max-lines-per-function -- the provider query contract is clearest as one migrated fixture */
import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type * as RepositoryModule from "./GrowthMonthlyCycleOperatorObservationsRepository";

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));

let client: Client;
let repository: typeof RepositoryModule.GrowthMonthlyCycleOperatorObservationsRepository;

const record = {
  id: "observation_a",
  projectId: "project_1",
  runId: "monthly_complete",
  requestKey: "11111111-1111-4111-8111-111111111111",
  preparation: "none" as const,
  failure: "none_observed" as const,
  duplicateSpam: "not_observed" as const,
  note: null,
  reviewerId: "user_1",
  createdAt: "2026-09-05T12:00:00.000Z",
};

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  const testDb = drizzle(client);
  vi.doMock("@/db", () => ({ db: testDb }));
  type BatchStatement = Parameters<typeof testDb.batch>[0][number];
  vi.doMock("@/db/runBatch", () => ({
    runBatch: async (
      build: (tx: typeof testDb) => readonly Promise<unknown>[],
    ): Promise<void> => {
      const statements = build(testDb);
      if (statements.length === 0) return;
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the length guard proves this tuple is non-empty
      const batch = statements as unknown as [
        BatchStatement,
        ...BatchStatement[],
      ];
      await testDb.batch(batch);
    },
  }));
  await client.executeMultiple(
    [
      "PRAGMA foreign_keys = ON;",
      "CREATE TABLE projects (id text PRIMARY KEY);",
      "INSERT INTO projects (id) VALUES ('project_1'), ('project_2');",
      readFileSync("drizzle/0044_glossy_komodo.sql", "utf8"),
      readFileSync("drizzle/0056_whole_the_professor.sql", "utf8"),
      readFileSync("drizzle/0057_sweet_black_tom.sql", "utf8"),
      `INSERT INTO growth_runs (
        id, project_id, run_type, trigger, status, cadence_slot, period_start,
        period_end, started_at, completed_at, detector_version,
        analysis_version, model, prompt_version, provider_cost_minor,
        failure_code, failure_message
      ) VALUES
        ('monthly_complete', 'project_1', 'monthly_review', 'scheduled', 'completed',
          'monthly:complete', '2026-08-01', '2026-08-31',
          '2026-09-01T00:00:00.000Z', '2026-09-01T00:01:00.000Z', 'growth-monthly-review-v1',
          NULL, NULL, NULL, NULL, NULL, NULL),
        ('monthly_failed', 'project_1', 'monthly_review', 'scheduled', 'failed',
          'monthly:failed', '2026-07-01', '2026-07-31',
          '2026-08-01T00:00:00.000Z', '2026-08-01T00:01:00.000Z', 'growth-monthly-review-v1',
          NULL, NULL, NULL, NULL, 'MONTHLY_REVIEW_FAILED', 'Saved failure'),
        ('monthly_running', 'project_1', 'monthly_review', 'scheduled', 'running',
          'monthly:running', '2026-09-01', '2026-09-30',
          '2026-10-01T00:00:00.000Z', NULL, 'growth-monthly-review-v1',
          NULL, NULL, NULL, NULL, NULL, NULL),
        ('wrong_type', 'project_1', 'weekly_review', 'scheduled', 'completed',
          'weekly:complete', '2026-08-25', '2026-08-31',
          '2026-09-01T00:00:00.000Z', '2026-09-01T00:01:00.000Z', 'growth-monthly-review-v1',
          NULL, NULL, NULL, NULL, NULL, NULL),
        ('wrong_version', 'project_1', 'monthly_review', 'scheduled', 'completed',
          'monthly:wrong-version', '2026-06-01', '2026-06-30',
          '2026-07-01T00:00:00.000Z', '2026-07-01T00:01:00.000Z', 'growth-monthly-review-v2',
          NULL, NULL, NULL, NULL, NULL, NULL),
        ('foreign_monthly', 'project_2', 'monthly_review', 'scheduled', 'completed',
          'monthly:foreign', '2026-08-01', '2026-08-31',
          '2026-09-01T00:00:00.000Z', '2026-09-01T00:01:00.000Z', 'growth-monthly-review-v1',
          NULL, NULL, NULL, NULL, NULL, NULL);`,
    ].join("\n"),
  );
  ({ GrowthMonthlyCycleOperatorObservationsRepository: repository } =
    await import("./GrowthMonthlyCycleOperatorObservationsRepository"));
});

afterAll(() => client.close());

describe("GrowthMonthlyCycleOperatorObservationsRepository on D1", () => {
  it("qualifies terminal monthly runs and keeps exact request retries idempotent", async () => {
    await expect(repository.append(record)).resolves.toMatchObject(record);
    await expect(
      repository.append({
        ...record,
        id: "ignored_retry_id",
        preparation: "substantial",
      }),
    ).resolves.toMatchObject(record);
    const count = await client.execute(
      "SELECT count(*) AS count FROM growth_monthly_cycle_operator_observations WHERE project_id = 'project_1' AND request_key = '11111111-1111-4111-8111-111111111111'",
    );
    expect(Number(count.rows[0]?.count)).toBe(1);

    for (const [index, runId] of [
      "monthly_running",
      "wrong_type",
      "wrong_version",
      "foreign_monthly",
      "missing",
    ].entries()) {
      await expect(
        repository.append({
          ...record,
          id: `rejected_${index}`,
          runId,
          requestKey: `22222222-2222-4222-8222-22222222222${index}`,
        }),
      ).resolves.toBeNull();
    }
  });

  it("returns one latest project observation per supplied run with stable mixed-time ties", async () => {
    await repository.append({
      ...record,
      id: "observation_z",
      requestKey: "33333333-3333-4333-8333-333333333333",
      preparation: "substantial",
      createdAt: "2026-09-05 12:00:00",
    });
    await repository.append({
      ...record,
      id: "observation_failed",
      runId: "monthly_failed",
      requestKey: "44444444-4444-4444-8444-444444444444",
      failure: "explained",
      createdAt: "2026-08-05T12:00:00.000Z",
    });
    await client.execute({
      sql: `INSERT INTO growth_monthly_cycle_operator_observations
        (id, project_id, run_id, request_key, preparation, failure, duplicate_spam, note, reviewer_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        "foreign_observation",
        "project_2",
        "foreign_monthly",
        "55555555-5555-4555-8555-555555555555",
        "none",
        "none_observed",
        "not_observed",
        null,
        "foreign_user",
        "2026-10-05T12:00:00.000Z",
      ],
    });

    const rows = await repository.listLatestForRuns("project_1", [
      "monthly_complete",
      "monthly_failed",
    ]);
    expect(rows).toHaveLength(2);
    expect(rows).toEqual([
      expect.objectContaining({
        id: "observation_z",
        runId: "monthly_complete",
        preparation: "substantial",
      }),
      expect.objectContaining({
        id: "observation_failed",
        runId: "monthly_failed",
      }),
    ]);
    expect(rows.some(({ id }) => id === "foreign_observation")).toBe(false);
    await expect(
      repository.listLatestForRuns(
        "project_1",
        Array.from({ length: 7 }, (_, index) => `monthly_${index}`),
      ),
    ).rejects.toThrow("exceeds its bound");
  });

  it("enforces observation vocabulary in the migrated database", async () => {
    await expect(
      client.execute({
        sql: `INSERT INTO growth_monthly_cycle_operator_observations
          (id, project_id, run_id, request_key, preparation, failure, duplicate_spam, note, reviewer_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          "invalid_observation",
          "project_1",
          "monthly_complete",
          "66666666-6666-4666-8666-666666666666",
          "acceptable",
          "none_observed",
          "not_observed",
          null,
          "user_1",
          "2026-09-05T12:00:00.000Z",
        ],
      }),
    ).rejects.toThrow();
  });
});
