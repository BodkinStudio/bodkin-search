import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type * as RepositoryModule from "./GrowthOpportunityDecisionsRepository";

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));

let client: Client;
let repository: typeof RepositoryModule.GrowthOpportunityDecisionsRepository;

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  vi.doMock("@/db", () => ({ db: drizzle(client) }));
  await client.executeMultiple(
    [
      "CREATE TABLE projects (id text PRIMARY KEY);",
      'CREATE TABLE "user" (id text PRIMARY KEY);',
      "INSERT INTO projects (id) VALUES ('project_1');",
      readFileSync("drizzle/0044_glossy_komodo.sql", "utf8"),
      readFileSync("drizzle/0045_mean_retro_girl.sql", "utf8"),
      readFileSync("drizzle/0046_living_misty_knight.sql", "utf8"),
      `CREATE TABLE growth_recommendation_signal_links (
        project_id text NOT NULL,
        signal_run_id text NOT NULL,
        signal_id text NOT NULL,
        dedupe_key text NOT NULL,
        recommendation_id text NOT NULL,
        relationship text NOT NULL,
        suppression_reason text,
        policy_version text NOT NULL,
        controller_released_at text,
        created_at text NOT NULL
      );`,
      `INSERT INTO growth_recommendation_signal_links VALUES
        ('project_1','run_1','signal_controller','a','rec_controller','controller',NULL,'v1',NULL,'2026-09-01'),
        ('project_1','run_2','signal_released','b','rec_released','controller',NULL,'v1','2026-09-02','2026-09-01'),
        ('project_1','run_3','signal_suppressed','c','rec_suppressed','suppressed','existing_proposal','v1',NULL,'2026-09-01'),
        ('project_2','run_4','signal_foreign','d','rec_foreign','controller',NULL,'v1',NULL,'2026-09-01');`,
    ].join("\n"),
  );
  ({ GrowthOpportunityDecisionsRepository: repository } =
    await import("./GrowthOpportunityDecisionsRepository"));
});

afterAll(() => client.close());

const expectedSteps = [
  {
    position: 0,
    content: "Review saved Search Console page and query evidence.",
  },
  {
    position: 1,
    content: "Inspect known changes and indexing signals for the target page.",
  },
  {
    position: 2,
    content:
      "Decide whether a website change is warranted before proposing one.",
  },
];

async function seedPriorityPageGraph(input: {
  suffix: string;
  detectorVersion: string;
}) {
  const runId = `run_${input.suffix}`;
  const signalId = `signal_${input.suffix}`;
  const insightId = `insight_${input.suffix}`;
  const recommendationId = `recommendation_${input.suffix}`;
  const keyPageId = `key_page_${input.suffix}`;
  await client.execute({
    sql: `INSERT INTO growth_runs (
      id, project_id, run_type, trigger, status, cadence_slot, period_start,
      period_end, started_at, completed_at, detector_version, analysis_version
    ) VALUES (?, 'project_1', 'manual_analysis', 'manual', 'completed', ?,
      '2026-07-01', '2026-07-28', '2026-07-29T10:00:00.000Z',
      '2026-07-29T10:01:00.000Z', ?, 'priority-page-investigation-v1')`,
    args: [runId, `priority-page-check:${input.suffix}`, input.detectorVersion],
  });
  await client.execute({
    sql: `INSERT INTO growth_signals (
      id, project_id, run_id, signal_type, entity_type, entity_ref, metric,
      severity, confidence, period_start, period_end, baseline_value,
      current_value, delta_value, evidence_kind, evidence_ref, captured_at
    ) VALUES (?, 'project_1', ?, 'priority_page_click_decline', 'key_page', ?,
      'gsc_clicks', 'warning', 0.8, '2026-07-01', '2026-07-28', 20, 10, -10,
      'gsc_period', ?, '2026-07-29T10:00:00.000Z')`,
    args: [signalId, runId, keyPageId, `gsc:${input.suffix}`],
  });
  await client.execute({
    sql: `INSERT INTO growth_insights (
      id, project_id, run_id, creation_key, fact_hash, title, explanation,
      hypothesis, confidence
    ) VALUES (?, 'project_1', ?, ?, ?, 'Observed decline', 'Clicks fell.',
      'Cause unknown.', 0)`,
    args: [
      insightId,
      runId,
      `priority-page-investigation-v1:insight:${signalId}`,
      "a".repeat(64),
    ],
  });
  await client.execute({
    sql: `INSERT INTO growth_insight_signals
      (project_id, run_id, insight_id, signal_id)
      VALUES ('project_1', ?, ?, ?)`,
    args: [runId, insightId, signalId],
  });
  await client.execute({
    sql: `INSERT INTO growth_recommendations (
      id, project_id, run_id, creation_key, fact_hash, title, rationale,
      category, impact, commercial_relevance, effort, urgency, confidence,
      priority_score
    ) VALUES (?, 'project_1', ?, ?, ?, 'Investigate decline', 'Cause unknown.',
      'investigation', 1, 1, 1, 1, 0, 0)`,
    args: [
      recommendationId,
      runId,
      `priority-page-investigation-v1:recommendation:${signalId}`,
      "b".repeat(64),
    ],
  });
  await client.execute({
    sql: `INSERT INTO growth_recommendation_insights
      (project_id, run_id, recommendation_id, insight_id)
      VALUES ('project_1', ?, ?, ?)`,
    args: [runId, recommendationId, insightId],
  });
  await client.execute({
    sql: `INSERT INTO growth_recommendation_targets
      (project_id, run_id, recommendation_id, target_type, target_value)
      VALUES ('project_1', ?, ?, 'url', ?)`,
    args: [runId, recommendationId, `https://example.com/${input.suffix}`],
  });
  for (const step of expectedSteps) {
    await client.execute({
      sql: `INSERT INTO growth_recommendation_steps
        (project_id, run_id, recommendation_id, position, content)
        VALUES ('project_1', ?, ?, ?, ?)`,
      args: [runId, recommendationId, step.position, step.content],
    });
  }
  return { keyPageId, recommendationId, runId, signalId };
}

describe("GrowthOpportunityDecisionsRepository active controller sources", () => {
  it("returns only active controller sources from the authorized project and requested page", async () => {
    await expect(
      repository.listActiveControllerSources("project_1", [
        "rec_controller",
        "rec_released",
        "rec_suppressed",
        "rec_foreign",
      ]),
    ).resolves.toEqual([
      { recommendationId: "rec_controller", signalId: "signal_controller" },
    ]);
  });

  it("does not query when the emitted page is empty", async () => {
    await expect(
      repository.listActiveControllerSources("project_1", []),
    ).resolves.toEqual([]);
  });

  it.each(["priority-page-click-decline-v1", "priority-page-click-decline-v2"])(
    "reads a persisted %s graph through the legacy controller guard",
    async (detectorVersion) => {
      const graph = await seedPriorityPageGraph({
        suffix: detectorVersion.endsWith("v1") ? "reader_v1" : "reader_v2",
        detectorVersion,
      });
      await expect(
        repository.findLegacyPriorityPageController(
          "project_1",
          graph.keyPageId,
          expectedSteps,
        ),
      ).resolves.toEqual({
        recommendationId: graph.recommendationId,
        signalRunId: graph.runId,
        signalId: graph.signalId,
      });
    },
  );

  it("rejects a persisted unsupported detector version", async () => {
    const graph = await seedPriorityPageGraph({
      suffix: "reader_v3",
      detectorVersion: "priority-page-click-decline-v3",
    });
    await expect(
      repository.findLegacyPriorityPageController(
        "project_1",
        graph.keyPageId,
        expectedSteps,
      ),
    ).resolves.toBeNull();
  });
});
