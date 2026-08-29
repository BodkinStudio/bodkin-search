import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type * as RepositoryModule from "./GrowthInsightsRepository";

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));

let client: Client;
let GrowthInsightsRepository: typeof RepositoryModule.GrowthInsightsRepository;

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
      // libSQL batch is atomic and accepts the same SQLite builders as D1.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the length guard proves the tuple is non-empty
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
      "INSERT INTO projects (id) VALUES ('project_1');",
      readFileSync("drizzle/0044_glossy_komodo.sql", "utf8"),
      readFileSync("drizzle/0045_mean_retro_girl.sql", "utf8"),
      `INSERT INTO growth_runs (
        id, project_id, run_type, trigger, status, cadence_slot, period_start,
        period_end, started_at, detector_version
      ) VALUES (
        'run_1', 'project_1', 'manual_analysis', 'manual', 'running', 'slot_1',
        '2026-08-01', '2026-08-29', '2026-08-29T10:00:00.000Z', 'v1'
      );`,
      `INSERT INTO growth_signals (
        id, project_id, run_id, signal_type, entity_type, entity_ref, metric,
        severity, confidence, period_start, period_end, baseline_value,
        current_value, delta_value, evidence_kind, evidence_ref, captured_at
      ) VALUES
        ('signal_1', 'project_1', 'run_1', 'page_clicks_down', 'page',
          'https://example.com/pricing', 'clicks', 'warning', 0.8,
          '2026-08-01', '2026-08-29', 20, 10, -10, 'manual_observation',
          'manual:one', '2026-08-29T10:00:00.000Z'),
        ('signal_2', 'project_1', 'run_1', 'page_impressions_down', 'page',
          'https://example.com/pricing', 'impressions', 'warning', 0.7,
          '2026-08-01', '2026-08-29', 200, 100, -100, 'manual_observation',
          'manual:two', '2026-08-29T10:00:00.000Z'),
        ('signal_3', 'project_1', 'run_1', 'page_rank_down', 'page',
          'https://example.com/pricing', 'rank', 'info', 0.6,
          '2026-08-01', '2026-08-29', 3, 7, 4, 'manual_observation',
          'manual:three', '2026-08-29T10:00:00.000Z');`,
    ].join("\n"),
  );

  ({ GrowthInsightsRepository } = await import("./GrowthInsightsRepository"));
});

afterAll(() => client.close());

describe("GrowthInsightsRepository D1 graph writes", () => {
  it("keeps exact retries complete and prevents drift from extending children", async () => {
    const insight = {
      id: "insight_1",
      projectId: "project_1",
      runId: "run_1",
      creationKey: "pricing-loss",
      factHash: "a".repeat(64),
      title: "Pricing traffic declined",
      explanation: "Clicks and impressions fell.",
      hypothesis: "The page lost search visibility.",
      confidence: 0.8,
      model: "test-model",
      promptVersion: "v1",
      signalIds: ["signal_1", "signal_2"],
    };
    await GrowthInsightsRepository.createInsightGraph(insight);
    await GrowthInsightsRepository.createInsightGraph({
      ...insight,
      id: "insight_exact_retry",
    });
    await GrowthInsightsRepository.createInsightGraph({
      ...insight,
      id: "insight_drift",
      factHash: "b".repeat(64),
      signalIds: [...insight.signalIds, "signal_3"],
    });

    const insightGraph = await GrowthInsightsRepository.getInsightGraph(
      "project_1",
      "run_1",
      "insight_1",
    );
    expect(insightGraph?.insight).toMatchObject({
      id: "insight_1",
      factHash: "a".repeat(64),
    });
    expect(insightGraph?.signalIds).toEqual(["signal_1", "signal_2"]);

    const recommendation = {
      id: "recommendation_1",
      projectId: "project_1",
      runId: "run_1",
      creationKey: "repair-pricing",
      factHash: "c".repeat(64),
      title: "Repair pricing visibility",
      rationale: "The page has measurable commercial demand.",
      category: "content",
      impact: 5,
      commercialRelevance: 5,
      effort: 2,
      urgency: 3,
      confidence: 0.75,
      priorityScore: 10,
      model: "test-model",
      promptVersion: "v1",
      insightIds: ["insight_1"],
      targets: [
        {
          targetType: "url" as const,
          targetValue: "https://example.com/pricing",
        },
      ],
      steps: [{ position: 0, content: "Rewrite the introduction" }],
    };
    await GrowthInsightsRepository.createRecommendationGraph(recommendation);
    await GrowthInsightsRepository.createRecommendationGraph({
      ...recommendation,
      id: "recommendation_exact_retry",
    });
    await GrowthInsightsRepository.createRecommendationGraph({
      ...recommendation,
      id: "recommendation_drift",
      factHash: "d".repeat(64),
      targets: [
        ...recommendation.targets,
        { targetType: "keyword", targetValue: "pricing software" },
      ],
      steps: [
        ...recommendation.steps,
        { position: 1, content: "Add customer proof" },
      ],
    });

    const recommendationGraph =
      await GrowthInsightsRepository.getRecommendationGraph(
        "project_1",
        "run_1",
        "recommendation_1",
      );
    expect(recommendationGraph?.recommendation).toMatchObject({
      id: "recommendation_1",
      factHash: "c".repeat(64),
    });
    expect(recommendationGraph?.insightIds).toEqual(["insight_1"]);
    expect(recommendationGraph?.targets).toEqual([
      { targetType: "url", targetValue: "https://example.com/pricing" },
    ]);
    expect(recommendationGraph?.steps).toEqual([
      { position: 0, content: "Rewrite the introduction" },
    ]);
    expect((await client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
  });
});
