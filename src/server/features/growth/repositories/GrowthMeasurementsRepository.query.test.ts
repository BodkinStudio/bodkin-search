/* eslint-disable max-lines, max-lines-per-function -- the full atomic lifecycle fixture is easier to audit sequentially */
import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type * as RunBatchModule from "@/db/runBatch";
import type * as RepositoryModule from "./GrowthMeasurementsRepository";

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));

const hashes = {
  plan: "1".repeat(64),
  startEvent: "2".repeat(64),
  baseline: "3".repeat(64),
  measurement: "4".repeat(64),
  result: "5".repeat(64),
  observations: "6".repeat(64),
  finalEvent: "7".repeat(64),
};

const startInput = {
  id: "plan_1",
  projectId: "project_1",
  actionId: "action_1",
  factHash: hashes.plan,
  expectedActionVersion: 5,
  anchorAt: "2026-08-29T12:00:00.000Z",
  anchorDate: "2026-08-29",
  reportTimezone: "Europe/London",
  baselineStart: "2026-08-01",
  baselineEnd: "2026-08-14",
  cooldownEnd: "2026-08-31",
  measurementStart: "2026-09-01",
  measurementEnd: "2026-09-14",
  longMeasurementEnd: "2026-10-14",
  comparisonMode: "preceding_period" as const,
  metrics: [
    {
      id: "metric_clicks",
      metricType: "search_clicks" as const,
      entityType: "url" as const,
      entityKey: "https://example.com/pricing",
      isPrimary: true,
    },
    {
      id: "metric_impressions",
      metricType: "search_impressions" as const,
      entityType: "site" as const,
      entityKey: "example.com",
      isPrimary: false,
    },
  ],
  eventId: "action_event_6",
  eventFactHash: hashes.startEvent,
  actorType: "agent" as const,
  actorId: "growth-agent",
  note: "Start measurement",
};

let client: Client;
let repo: typeof RepositoryModule.GrowthMeasurementsRepository;

async function countRows(table: string, where = "1 = 1") {
  const [row] = (
    await client.execute(
      `SELECT count(*) AS count FROM ${table} WHERE ${where}`,
    )
  ).rows;
  return Number(row?.count ?? 0);
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
      "INSERT INTO projects (id, domain) VALUES ('project_1', 'example.com'), ('project_2', 'other.example');",
      "INSERT INTO user (id) VALUES ('user_1');",
      migration("drizzle/0044_glossy_komodo.sql"),
      `INSERT INTO growth_runs (
        id, project_id, run_type, trigger, status, cadence_slot, period_start,
        period_end, started_at, detector_version
      ) VALUES
        ('run_1', 'project_1', 'daily_monitor', 'manual', 'running', 'slot_1',
          '2026-08-01', '2026-08-29', '2026-08-29T10:00:00.000Z', 'v1'),
        ('run_2', 'project_2', 'daily_monitor', 'manual', 'running', 'slot_2',
          '2026-08-01', '2026-08-29', '2026-08-29T10:00:00.000Z', 'v1');`,
      migration("drizzle/0045_mean_retro_girl.sql"),
      `INSERT INTO growth_recommendations (
        id, project_id, run_id, creation_key, fact_hash, title, rationale,
        category, impact, commercial_relevance, effort, urgency, confidence,
        priority_score, status, review_version
      ) VALUES
        ('recommendation_1', 'project_1', 'run_1', 'recommendation_1',
          '${"a".repeat(64)}', 'Refresh pricing', 'Lost traffic', 'content',
          5, 5, 2, 3, 0.8, 10, 'accepted', 1),
        ('recommendation_2', 'project_1', 'run_1', 'recommendation_2',
          '${"b".repeat(64)}', 'Repair checkout', 'Lost traffic', 'content',
          5, 5, 2, 3, 0.8, 10, 'accepted', 1),
        ('recommendation_3', 'project_2', 'run_2', 'recommendation_3',
          '${"c".repeat(64)}', 'Refresh other', 'Lost traffic', 'content',
          5, 5, 2, 3, 0.8, 10, 'accepted', 1);`,
      migration("drizzle/0046_living_misty_knight.sql"),
      `INSERT INTO growth_actions (
        id, project_id, recommendation_id, creation_key, fact_hash, title,
        description, category, priority_score, status, state_version, due_at,
        approved_at, started_at, implemented_at
      ) VALUES
        ('action_1', 'project_1', 'recommendation_1', 'action_1',
          '${"d".repeat(64)}', 'Refresh pricing', 'Ship it', 'content', 10,
          'implemented', 5, '2026-09-30T12:00:00.000Z',
          '2026-08-01T12:00:00.000Z', '2026-08-15T12:00:00.000Z',
          '2026-08-29T12:00:00.000Z'),
        ('action_rollback', 'project_1', 'recommendation_2', 'action_rollback',
          '${"e".repeat(64)}', 'Repair checkout', 'Ship it', 'content', 10,
          'implemented', 5, '2026-09-30T12:00:00.000Z',
          '2026-08-01T12:00:00.000Z', '2026-08-15T12:00:00.000Z',
          '2026-08-29T12:00:00.000Z'),
        ('action_3', 'project_2', 'recommendation_3', 'action_3',
          '${"f".repeat(64)}', 'Refresh other', 'Ship it', 'content', 10,
          'implemented', 5, '2026-09-30T12:00:00.000Z',
          '2026-08-01T12:00:00.000Z', '2026-08-15T12:00:00.000Z',
          '2026-08-29T12:00:00.000Z');`,
      migration("drizzle/0047_flaky_felicia_hardy.sql"),
      `INSERT INTO growth_change_events (
        id, project_id, creation_key, fact_hash, source, change_type,
        actor_type, actor_id, description, happened_at
      ) VALUES
        ('change_1', 'project_1', 'change_1', '${"9".repeat(64)}', 'manual',
          'content_updated', 'user', 'user_1', 'Changed pricing',
          '2026-08-29T12:00:00.000Z'),
        ('change_foreign', 'project_2', 'change_foreign', '${"8".repeat(64)}',
          'manual', 'content_updated', 'user', 'user_1', 'Changed other',
          '2026-08-29T12:00:00.000Z');`,
      migration("drizzle/0048_dry_kate_bishop.sql"),
    ].join("\n"),
  );
  ({ GrowthMeasurementsRepository: repo } =
    await import("./GrowthMeasurementsRepository"));
});

afterAll(() => client.close());

describe.sequential("GrowthMeasurementsRepository D1 lifecycle", () => {
  it("atomically starts one winner graph and leaves no half-state on failure", async () => {
    await repo.startMeasurementGraph(startInput);
    await repo.startMeasurementGraph({
      ...startInput,
      id: "plan_exact_retry",
      eventId: "event_exact_retry",
      metrics: startInput.metrics.map((metric) => ({
        ...metric,
        id: `${metric.id}_retry`,
      })),
    });
    await repo.startMeasurementGraph({
      ...startInput,
      id: "plan_drift",
      factHash: "0".repeat(64),
      eventId: "event_drift",
      eventFactHash: "f".repeat(64),
      metrics: [
        ...startInput.metrics,
        {
          id: "metric_loser",
          metricType: "backlink_count",
          entityType: "site",
          entityKey: "example.com",
          isPrimary: true,
        },
      ],
    });

    const graph = await repo.getGraph("project_1", "plan_1");
    expect(graph?.plan).toMatchObject({
      id: "plan_1",
      actionId: "action_1",
      factHash: hashes.plan,
      status: "active",
      actionVersion: 6,
      anchorAt: startInput.anchorAt,
      anchorDate: startInput.anchorDate,
      reportTimezone: "Europe/London",
    });
    expect(graph?.metrics).toEqual([
      expect.objectContaining({
        id: "metric_clicks",
        metricType: "search_clicks",
        entityType: "url",
        isPrimary: true,
      }),
      expect.objectContaining({
        id: "metric_impressions",
        metricType: "search_impressions",
        entityType: "site",
        isPrimary: false,
      }),
    ]);
    expect(graph?.actionEvents).toEqual([
      expect.objectContaining({
        id: "action_event_6",
        actionVersion: 6,
        factHash: hashes.startEvent,
        fromStatus: "implemented",
        toStatus: "measuring",
      }),
    ]);
    expect(await repo.getAction("project_1", "action_1")).toMatchObject({
      status: "measuring",
      stateVersion: 6,
      implementedAt: startInput.anchorAt,
    });
    expect(await repo.getPlanByAction("project_2", "action_1")).toBeNull();
    expect(await repo.listMetrics("project_1", "plan_1")).toHaveLength(2);

    await expect(
      repo.startMeasurementGraph({
        ...startInput,
        id: "plan_rollback",
        actionId: "action_rollback",
        factHash: "e".repeat(64),
        eventId: "rollback_event",
        metrics: [
          {
            ...startInput.metrics[0],
            id: "rollback_metric",
            entityKey: "x".repeat(2001),
          },
        ],
      }),
    ).rejects.toThrow();
    expect(
      await repo.getPlanByAction("project_1", "action_rollback"),
    ).toBeNull();
    expect(await repo.getAction("project_1", "action_rollback")).toMatchObject({
      status: "implemented",
      stateVersion: 5,
    });
    expect((await client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
  });

  it("freezes observations and finalizes the Result, Plan and Action together", async () => {
    const baseline = {
      id: "observation_baseline",
      projectId: "project_1",
      measurementPlanId: "plan_1",
      metricId: "metric_clicks",
      periodType: "baseline" as const,
      factHash: hashes.baseline,
      effectiveStart: "2026-08-01",
      effectiveEnd: "2026-08-14",
      value: 100,
      completeness: 1,
      evidenceKind: "gsc_period" as const,
      evidenceRef: "gsc:pricing:baseline",
      capturedAt: "2026-09-15T12:00:00.000Z",
    };
    const measurement = {
      ...baseline,
      id: "observation_measurement",
      periodType: "measurement" as const,
      factHash: hashes.measurement,
      effectiveStart: "2026-09-01",
      effectiveEnd: "2026-09-14",
      value: 125,
      evidenceRef: "gsc:pricing:measurement",
    };
    const longTerm = {
      ...measurement,
      id: "observation_long_term",
      metricId: "metric_impressions",
      periodType: "long_term" as const,
      factHash: "a".repeat(64),
      effectiveStart: "2026-09-15",
      effectiveEnd: "2026-10-14",
      value: 140,
      evidenceRef: "gsc:site:long-term",
    };
    await repo.recordMeasurementObservation(baseline);
    await repo.recordMeasurementObservation({
      ...baseline,
      id: "observation_retry",
    });
    await repo.recordMeasurementObservation({
      ...baseline,
      id: "observation_drift",
      factHash: "0".repeat(64),
      value: 999,
    });
    await repo.recordMeasurementObservation(measurement);
    await repo.recordMeasurementObservation({
      ...measurement,
      id: "observation_bad_dates",
      metricId: "metric_impressions",
      effectiveStart: "2026-09-02",
    });
    await repo.recordMeasurementObservation({
      ...longTerm,
      id: "observation_bad_long_start",
      effectiveStart: "2026-09-14",
    });
    await repo.recordMeasurementObservation(longTerm);
    expect(await repo.listObservations("project_1", "plan_1")).toEqual([
      expect.objectContaining({
        id: "observation_baseline",
        periodType: "baseline",
        value: 100,
      }),
      expect.objectContaining({
        id: "observation_measurement",
        periodType: "measurement",
        value: 125,
      }),
      expect.objectContaining({
        id: "observation_long_term",
        periodType: "long_term",
        effectiveStart: "2026-09-15",
        effectiveEnd: "2026-10-14",
        value: 140,
      }),
    ]);

    const finalizeInput = {
      id: "result_1",
      projectId: "project_1",
      measurementPlanId: "plan_1",
      measurementPlanFactHash: hashes.plan,
      actionId: "action_1",
      expectedActionVersion: 6,
      factHash: hashes.result,
      observationsHash: hashes.observations,
      observations: [
        { id: baseline.id, factHash: baseline.factHash },
        { id: measurement.id, factHash: measurement.factHash },
        { id: longTerm.id, factHash: longTerm.factHash },
      ],
      outcome: "positive" as const,
      confidence: 0.8,
      summary: "Clicks increased after implementation.",
      evaluatedAt: "2026-10-15T12:00:00.000Z",
      model: null,
      promptVersion: null,
      confoundingChangeEventIds: ["change_1"],
      eventId: "action_event_7",
      eventFactHash: hashes.finalEvent,
      actorType: "agent" as const,
      actorId: "growth-agent",
      note: "Finalize measurement",
    };
    await repo.finalizeMeasurementGraph(finalizeInput);
    await repo.finalizeMeasurementGraph({
      ...finalizeInput,
      eventId: "action_event_exact_retry",
    });
    await repo.finalizeMeasurementGraph({
      ...finalizeInput,
      id: "result_drift",
      factHash: "0".repeat(64),
      observationsHash: "f".repeat(64),
      outcome: "negative",
      confoundingChangeEventIds: ["change_foreign"],
      eventId: "action_event_drift",
      eventFactHash: "e".repeat(64),
    });

    const graph = await repo.getGraph("project_1", "plan_1");
    expect(graph?.plan).toMatchObject({
      status: "completed",
      completedAt: finalizeInput.evaluatedAt,
    });
    expect(graph?.result).toMatchObject({
      id: "result_1",
      factHash: hashes.result,
      observationsHash: hashes.observations,
      outcome: "positive",
      confidence: 0.8,
    });
    expect(graph?.confoundingChangeEventIds).toEqual(["change_1"]);
    expect(graph?.actionEvents.at(-1)).toMatchObject({
      id: "action_event_7",
      actionVersion: 7,
      factHash: hashes.finalEvent,
      fromStatus: "measuring",
      toStatus: "evaluated",
    });
    expect(await repo.getAction("project_1", "action_1")).toMatchObject({
      status: "evaluated",
      stateVersion: 7,
      evaluatedAt: finalizeInput.evaluatedAt,
    });

    await repo.recordMeasurementObservation({
      ...measurement,
      id: "late_observation",
      metricId: "metric_impressions",
    });
    expect(await repo.listObservations("project_1", "plan_1")).toHaveLength(3);

    await client.execute(
      "DELETE FROM growth_change_events WHERE id = 'change_1'",
    );
    expect(await repo.getResultByPlan("project_1", "plan_1")).toMatchObject({
      id: "result_1",
    });
    expect(await repo.listResultChangeIds("project_1", "result_1")).toEqual([]);

    await client.execute("DELETE FROM growth_runs WHERE id = 'run_1'");
    expect(await repo.getPlan("project_1", "plan_1")).toBeNull();
    expect(await countRows("growth_measurement_results")).toBe(0);
    expect(
      await countRows("growth_change_events", "id = 'change_foreign'"),
    ).toBe(1);
    expect((await client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
  });
});
