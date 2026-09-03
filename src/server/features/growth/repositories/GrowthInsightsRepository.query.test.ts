/* eslint-disable max-lines -- shared in-memory graph fixture keeps atomic decision coverage auditable */
import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type * as RepositoryModule from "./GrowthInsightsRepository";
import type * as DecisionsModule from "./GrowthOpportunityDecisionsRepository";

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));

let client: Client;
let GrowthInsightsRepository: typeof RepositoryModule.GrowthInsightsRepository;
let GrowthOpportunityDecisionsRepository: typeof DecisionsModule.GrowthOpportunityDecisionsRepository;

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
      "CREATE TABLE user (id text PRIMARY KEY);",
      "CREATE TABLE projects (id text PRIMARY KEY);",
      "INSERT INTO projects (id) VALUES ('project_1');",
      readFileSync("drizzle/0044_glossy_komodo.sql", "utf8"),
      readFileSync("drizzle/0045_mean_retro_girl.sql", "utf8"),
      readFileSync("drizzle/0046_living_misty_knight.sql", "utf8"),
      readFileSync("drizzle/0052_lethal_brother_voodoo.sql", "utf8"),
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
  ({ GrowthOpportunityDecisionsRepository } =
    await import("./GrowthOpportunityDecisionsRepository"));
});

afterAll(() => client.close());

const legacySteps = [
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

async function seedLegacyPriorityPageGraph(input: {
  suffix: string;
  keyPageId: string;
}) {
  const runId = `legacy_run_${input.suffix}`;
  const signalId = `legacy_signal_${input.suffix}`;
  const insightId = `legacy_insight_${input.suffix}`;
  const recommendationId = `legacy_recommendation_${input.suffix}`;
  await client.execute({
    sql: `INSERT INTO growth_runs (
      id, project_id, run_type, trigger, status, cadence_slot, period_start,
      period_end, started_at, completed_at, detector_version, analysis_version
    ) VALUES (?, 'project_1', 'manual_analysis', 'manual', 'completed', ?,
      '2026-07-01', '2026-07-28', '2026-07-29T10:00:00.000Z',
      '2026-07-29T10:01:00.000Z', 'priority-page-click-decline-v1',
      'priority-page-investigation-v1')`,
    args: [runId, `priority-page-check:current:${input.suffix}`],
  });
  await client.execute({
    sql: `INSERT INTO growth_signals (
      id, project_id, run_id, signal_type, entity_type, entity_ref, metric,
      severity, confidence, period_start, period_end, baseline_value,
      current_value, delta_value, evidence_kind, evidence_ref, captured_at
    ) VALUES (?, 'project_1', ?, 'priority_page_click_decline', 'key_page',
      ?, 'gsc_clicks', 'warning', 0.8, '2026-07-01', '2026-07-28', 20,
      10, -10, 'gsc_period', ?, '2026-07-29T10:00:00.000Z')`,
    args: [signalId, runId, input.keyPageId, `gsc:${input.suffix}`],
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
      priority_score, created_at
    ) VALUES (?, 'project_1', ?, ?, ?, 'Investigate decline', 'Cause unknown.',
      'investigation', 1, 1, 1, 1, 0, 0, '2026-07-29T10:00:00.000Z')`,
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
  for (const step of legacySteps) {
    await client.execute({
      sql: `INSERT INTO growth_recommendation_steps
        (project_id, run_id, recommendation_id, position, content)
        VALUES ('project_1', ?, ?, ?, ?)`,
      args: [runId, recommendationId, step.position, step.content],
    });
  }
  return { runId, signalId, insightId, recommendationId };
}

async function seedRunningPriorityPageSignal(input: {
  suffix: string;
  keyPageId: string;
  capturedAt?: string;
}) {
  const runId = `current_run_${input.suffix}`;
  const signalId = `current_signal_${input.suffix}`;
  await client.execute({
    sql: `INSERT INTO growth_runs (
      id, project_id, run_type, trigger, status, cadence_slot, period_start,
      period_end, started_at, detector_version
    ) VALUES (?, 'project_1', 'manual_analysis', 'manual', 'running', ?,
      '2026-08-01', '2026-08-28', '2026-08-29T10:00:00.000Z',
      'priority-page-click-decline-v1')`,
    args: [runId, `priority-page-check:${input.suffix}`],
  });
  await client.execute({
    sql: `INSERT INTO growth_signals (
      id, project_id, run_id, signal_type, entity_type, entity_ref, metric,
      severity, confidence, period_start, period_end, baseline_value,
      current_value, delta_value, evidence_kind, evidence_ref, captured_at
    ) VALUES (?, 'project_1', ?, 'priority_page_click_decline', 'key_page',
      ?, 'gsc_clicks', 'warning', 0.8, '2026-08-01', '2026-08-28', 20,
      10, -10, 'gsc_period', ?, ?)`,
    args: [
      signalId,
      runId,
      input.keyPageId,
      `gsc:${input.suffix}`,
      input.capturedAt ?? "2026-08-29T10:00:00.000Z",
    ],
  });
  return { runId, signalId };
}

function decisionCandidate(input: {
  suffix: string;
  runId: string;
  signalId: string;
  dedupeKey: string;
}) {
  const insightId = `candidate_insight_${input.suffix}`;
  return {
    projectId: "project_1",
    signalRunId: input.runId,
    signalId: input.signalId,
    dedupeKey: input.dedupeKey,
    policyVersion: "priority-page-repeat-suppression-v1",
    insight: {
      id: insightId,
      projectId: "project_1",
      runId: input.runId,
      creationKey: `priority-page-investigation-v1:insight:${input.signalId}`,
      factHash: "c".repeat(64),
      title: "Observed decline",
      explanation: "Clicks fell.",
      hypothesis: "Cause unknown.",
      confidence: 0,
      model: null,
      promptVersion: null,
      signalIds: [input.signalId],
    },
    recommendation: {
      id: `candidate_recommendation_${input.suffix}`,
      projectId: "project_1",
      runId: input.runId,
      creationKey: `priority-page-investigation-v1:recommendation:${input.signalId}`,
      factHash: "d".repeat(64),
      title: "Investigate decline",
      rationale: "Cause unknown.",
      category: "investigation",
      impact: 1,
      commercialRelevance: 1,
      effort: 1,
      urgency: 1,
      confidence: 0,
      priorityScore: 0,
      model: null,
      promptVersion: null,
      insightIds: [insightId],
      targets: [
        {
          targetType: "url" as const,
          targetValue: `https://example.com/${input.suffix}`,
        },
      ],
      steps: legacySteps,
    },
  };
}

async function seedStrikingSignals(suffix: string) {
  const runId = `striking_run_${suffix}`;
  const ids = {
    position: `striking_position_${suffix}`,
    impressions: `striking_impressions_${suffix}`,
    clicks: `striking_clicks_${suffix}`,
  };
  await client.execute({
    sql: `INSERT INTO growth_runs (id, project_id, run_type, trigger, status, cadence_slot, period_start, period_end, started_at, detector_version, analysis_version)
      VALUES (?, 'project_1', 'manual_analysis', 'manual', 'running', ?, '2026-07-07', '2026-08-31', '2026-09-01T10:00:00.000Z', 'striking-distance-query-v1', 'striking-distance-investigation-v1')`,
    args: [runId, `striking-distance-check:${suffix}`],
  });
  for (const [metric, id, baseline, current] of [
    ["gsc_average_position", ids.position, 9, 6],
    ["gsc_impressions", ids.impressions, 80, 150],
    ["gsc_clicks", ids.clicks, 2, 1],
  ] as const) {
    await client.execute({
      sql: `INSERT INTO growth_signals (id, project_id, run_id, signal_type, entity_type, entity_ref, metric, severity, confidence, period_start, period_end, baseline_value, current_value, delta_value, evidence_kind, evidence_ref, captured_at)
        VALUES (?, 'project_1', ?, 'striking_distance_query', 'search_query', 'web design bath', ?, 'info', .8, '2026-08-04', '2026-08-31', ?, ?, ?, 'gsc_period', 'gsc_striking_distance_v1:test', '2026-09-01T10:00:00.000Z')`,
      args: [id, runId, metric, baseline, current, current - baseline],
    });
  }
  return { runId, ids };
}

function strikingDecisionCandidate(input: {
  suffix: string;
  runId: string;
  ids: { position: string; impressions: string; clicks: string };
  dedupeKey: string;
}) {
  const insightId = `striking_insight_${input.suffix}`;
  return {
    projectId: "project_1",
    signalRunId: input.runId,
    signalId: input.ids.impressions,
    dedupeKey: input.dedupeKey,
    policyVersion: "striking-distance-repeat-suppression-v1",
    actionKeyPrefix: "striking-distance-investigation-v1:action:",
    insight: {
      id: insightId,
      projectId: "project_1",
      runId: input.runId,
      creationKey: `striking-distance-investigation-v1:insight:${input.ids.impressions}`,
      factHash: `a${input.suffix}`.padEnd(64, "a"),
      title: "Observed striking distance",
      explanation: "Observed facts.",
      hypothesis: "Cause unknown.",
      confidence: 0,
      model: null,
      promptVersion: null,
      signalIds: [input.ids.position, input.ids.impressions, input.ids.clicks],
    },
    recommendation: {
      id: `striking_recommendation_${input.suffix}`,
      projectId: "project_1",
      runId: input.runId,
      creationKey: `striking-distance-investigation-v1:recommendation:${input.ids.impressions}`,
      factHash: `b${input.suffix}`.padEnd(64, "b"),
      title: "Investigate query",
      rationale: "Cause unknown.",
      category: "investigation",
      impact: 1,
      commercialRelevance: 1,
      effort: 1,
      urgency: 1,
      confidence: 0,
      priorityScore: 0,
      model: null,
      promptVersion: null,
      insightIds: [insightId],
      targets: [
        { targetType: "keyword" as const, targetValue: "web design bath" },
        {
          targetType: "url" as const,
          targetValue: "https://example.com/web-design-bath",
        },
        { targetType: "site" as const, targetValue: "example.com" },
      ],
      steps: legacySteps,
    },
  };
}

async function seedControllerWithAction(input: {
  suffix: string;
  dedupeKey: string;
  evaluatedAt: string | null;
  actionStatus?: "evaluated" | "measuring";
  actionCreationKey?: string;
}) {
  const source = await seedRunningPriorityPageSignal({
    suffix: `${input.suffix}_source`,
    keyPageId: `key_${input.suffix}`,
  });
  const controller = decisionCandidate({
    suffix: `${input.suffix}_source`,
    runId: source.runId,
    signalId: source.signalId,
    dedupeKey: input.dedupeKey,
  });
  await GrowthOpportunityDecisionsRepository.writeDecision(controller);
  await client.execute({
    sql: `INSERT INTO growth_actions (
      id, project_id, recommendation_id, creation_key, fact_hash, title,
      description, category, priority_score, status, state_version, due_at,
      approved_at, started_at, implemented_at, evaluated_at
    ) VALUES (?, 'project_1', ?, ?, ?, 'Controller Action', 'Saved work.',
      'investigation', 0, ?, 1, '2026-09-30T00:00:00.000Z',
      '2026-08-01T00:00:00.000Z', '2026-08-02T00:00:00.000Z',
      '2026-08-27T00:00:00.000Z', ?)`,
    args: [
      `action_${input.suffix}`,
      controller.recommendation.id,
      input.actionCreationKey ??
        `priority-page-investigation-v1:action:${source.signalId}`,
      "f".repeat(64),
      input.actionStatus ?? "evaluated",
      input.evaluatedAt,
    ],
  });
  return { source, controller };
}

async function attemptControllerRelease(input: {
  suffix: string;
  dedupeKey: string;
  capturedAt: string;
  controller: Awaited<ReturnType<typeof seedControllerWithAction>>;
}) {
  const later = await seedRunningPriorityPageSignal({
    suffix: `${input.suffix}_later`,
    keyPageId: `key_${input.suffix}`,
    capturedAt: input.capturedAt,
  });
  await expect(
    GrowthOpportunityDecisionsRepository.writeDecision({
      ...decisionCandidate({
        suffix: `${input.suffix}_later`,
        runId: later.runId,
        signalId: later.signalId,
        dedupeKey: input.dedupeKey,
      }),
      releaseController: {
        recommendationId: input.controller.controller.recommendation.id,
        signalRunId: input.controller.source.runId,
        signalId: input.controller.source.signalId,
      },
    }),
  ).resolves.toBeUndefined();
  const [oldDecision, laterDecision] = await Promise.all([
    GrowthOpportunityDecisionsRepository.getSignalDecision(
      "project_1",
      input.controller.source.runId,
      input.controller.source.signalId,
    ),
    GrowthOpportunityDecisionsRepository.getSignalDecision(
      "project_1",
      later.runId,
      later.signalId,
    ),
  ]);
  return { oldDecision, laterDecision };
}

// eslint-disable-next-line max-lines-per-function -- one shared database makes the sequential graph lifecycle explicit
describe("GrowthInsightsRepository D1 graph writes", () => {
  it("writes exactly three striking evidence links and suppresses repeats without mutating the controller graph", async () => {
    const dedupeKey = "e".repeat(64);
    const first = await seedStrikingSignals("proof_first");
    const firstCandidate = strikingDecisionCandidate({
      suffix: "proof_first",
      ...first,
      dedupeKey,
    });
    await GrowthOpportunityDecisionsRepository.writeDecision(firstCandidate);
    const firstLinks = await client.execute({
      sql: "SELECT count(*) AS count FROM growth_insight_signals WHERE insight_id = ?",
      args: [firstCandidate.insight.id],
    });
    const firstController =
      await GrowthOpportunityDecisionsRepository.getSignalDecision(
        "project_1",
        first.runId,
        first.ids.impressions,
      );
    expect(Number(firstLinks.rows[0]?.count)).toBe(3);
    expect(firstController).toMatchObject({ relationship: "controller" });

    const repeat = await seedStrikingSignals("proof_repeat");
    const repeatCandidate = strikingDecisionCandidate({
      suffix: "proof_repeat",
      ...repeat,
      dedupeKey,
    });
    await GrowthOpportunityDecisionsRepository.writeDecision(repeatCandidate);
    const [repeatDecision, insightCount, recommendationCount, repeatLinks] =
      await Promise.all([
        GrowthOpportunityDecisionsRepository.getSignalDecision(
          "project_1",
          repeat.runId,
          repeat.ids.impressions,
        ),
        client.execute(
          "SELECT count(*) AS count FROM growth_insights WHERE id IN (?, ?)",
          [firstCandidate.insight.id, repeatCandidate.insight.id],
        ),
        client.execute(
          "SELECT count(*) AS count FROM growth_recommendations WHERE id IN (?, ?)",
          [firstCandidate.recommendation.id, repeatCandidate.recommendation.id],
        ),
        client.execute(
          "SELECT count(*) AS count FROM growth_recommendation_signal_links WHERE signal_run_id = ?",
          [repeat.runId],
        ),
      ]);
    expect(repeatDecision).toMatchObject({
      relationship: "suppressed",
      recommendationId: firstCandidate.recommendation.id,
    });
    expect(Number(insightCount.rows[0]?.count)).toBe(1);
    expect(Number(recommendationCount.rows[0]?.count)).toBe(1);
    expect(Number(repeatLinks.rows[0]?.count)).toBe(1);
    await client.executeMultiple(`
      DELETE FROM growth_recommendation_signal_links WHERE signal_run_id IN ('${first.runId}', '${repeat.runId}');
      DELETE FROM growth_recommendation_targets WHERE recommendation_id IN ('${firstCandidate.recommendation.id}', '${repeatCandidate.recommendation.id}');
      DELETE FROM growth_recommendation_steps WHERE recommendation_id IN ('${firstCandidate.recommendation.id}', '${repeatCandidate.recommendation.id}');
      DELETE FROM growth_recommendation_insights WHERE recommendation_id IN ('${firstCandidate.recommendation.id}', '${repeatCandidate.recommendation.id}');
      DELETE FROM growth_insight_signals WHERE insight_id IN ('${firstCandidate.insight.id}', '${repeatCandidate.insight.id}');
      DELETE FROM growth_recommendations WHERE id IN ('${firstCandidate.recommendation.id}', '${repeatCandidate.recommendation.id}');
      DELETE FROM growth_insights WHERE id IN ('${firstCandidate.insight.id}', '${repeatCandidate.insight.id}');
      DELETE FROM growth_signals WHERE run_id IN ('${first.runId}', '${repeat.runId}');
      DELETE FROM growth_runs WHERE id IN ('${first.runId}', '${repeat.runId}');
    `);
  });
  it("atomically records one controller and suppresses a later equivalent Signal", async () => {
    await client.executeMultiple(`INSERT INTO growth_runs (
      id, project_id, run_type, trigger, status, cadence_slot, period_start,
      period_end, started_at, detector_version
    ) VALUES ('run_2', 'project_1', 'manual_analysis', 'manual', 'running',
      'slot_2', '2026-08-01', '2026-08-29', '2026-08-29T10:00:00.000Z', 'v1');
    INSERT INTO growth_signals (
      id, project_id, run_id, signal_type, entity_type, entity_ref, metric,
      severity, confidence, period_start, period_end, baseline_value,
      current_value, delta_value, evidence_kind, evidence_ref, captured_at
    ) VALUES ('signal_4', 'project_1', 'run_2', 'priority_page_click_decline',
      'key_page', 'key_1', 'gsc_clicks', 'warning', 0.8, '2026-08-01',
      '2026-08-29', 20, 10, -10, 'gsc_period', 'gsc:two',
      '2026-08-29T10:00:00.000Z');`);
    const candidate = {
      projectId: "project_1",
      dedupeKey: "d".repeat(64),
      policyVersion: "priority-page-repeat-suppression-v1",
      insight: {
        id: "stable_insight",
        projectId: "project_1",
        runId: "run_1",
        creationKey: "template:insight:signal_1",
        factHash: "a".repeat(64),
        title: "Observed priority-page click decline",
        explanation: "Clicks fell during the period.",
        hypothesis: "The cause is unknown.",
        confidence: 0,
        model: null,
        promptVersion: null,
        signalIds: ["signal_1"],
      },
      recommendation: {
        id: "stable_recommendation",
        projectId: "project_1",
        runId: "run_1",
        creationKey: "template:recommendation:signal_1",
        factHash: "b".repeat(64),
        title: "Investigate a priority-page search click decline",
        rationale: "Cause is unknown; this is a deterministic suggestion.",
        category: "investigation",
        impact: 1,
        commercialRelevance: 1,
        effort: 1,
        urgency: 1,
        confidence: 0,
        priorityScore: 0,
        model: null,
        promptVersion: null,
        insightIds: ["stable_insight"],
        targets: [
          {
            targetType: "url" as const,
            targetValue: "https://example.com/pricing",
          },
        ],
        steps: [
          { position: 0, content: "Review saved Search Console evidence." },
        ],
      },
    };
    await GrowthOpportunityDecisionsRepository.writeDecision({
      ...candidate,
      signalRunId: "run_1",
      signalId: "signal_1",
    });
    await GrowthOpportunityDecisionsRepository.writeDecision({
      ...candidate,
      signalRunId: "run_2",
      signalId: "signal_4",
      insight: {
        ...candidate.insight,
        runId: "run_2",
        creationKey: "template:insight:signal_4",
        signalIds: ["signal_4"],
      },
      recommendation: {
        ...candidate.recommendation,
        runId: "run_2",
        creationKey: "template:recommendation:signal_4",
      },
    });
    expect(
      await GrowthOpportunityDecisionsRepository.getSignalDecision(
        "project_1",
        "run_1",
        "signal_1",
      ),
    ).toMatchObject({
      relationship: "controller",
      recommendationId: "stable_recommendation",
    });
    expect(
      await GrowthOpportunityDecisionsRepository.getSignalDecision(
        "project_1",
        "run_2",
        "signal_4",
      ),
    ).toMatchObject({
      relationship: "suppressed",
      recommendationId: "stable_recommendation",
      suppressionReason: "existing_proposal",
    });
    expect(
      (
        await client.execute(
          "SELECT count(*) AS count FROM growth_recommendations",
        )
      ).rows[0],
    ).toMatchObject({ count: 1 });
  });

  it("adopts one exact legacy graph and records the new Signal as suppressed", async () => {
    const keyPageId = "key_legacy_exact";
    const legacy = await seedLegacyPriorityPageGraph({
      suffix: "exact",
      keyPageId,
    });
    const current = await seedRunningPriorityPageSignal({
      suffix: "exact",
      keyPageId,
    });
    const found =
      await GrowthOpportunityDecisionsRepository.findLegacyPriorityPageController(
        "project_1",
        keyPageId,
        legacySteps,
      );
    expect(found).toEqual({
      recommendationId: legacy.recommendationId,
      signalRunId: legacy.runId,
      signalId: legacy.signalId,
    });
    const candidate = decisionCandidate({
      suffix: "exact",
      runId: current.runId,
      signalId: current.signalId,
      dedupeKey: "e".repeat(64),
    });
    await GrowthOpportunityDecisionsRepository.writeDecision({
      ...candidate,
      legacyController: { ...found, keyPageId },
    });

    await expect(
      GrowthOpportunityDecisionsRepository.getSignalDecision(
        "project_1",
        legacy.runId,
        legacy.signalId,
      ),
    ).resolves.toMatchObject({
      relationship: "controller",
      recommendationId: legacy.recommendationId,
    });
    await expect(
      GrowthOpportunityDecisionsRepository.getSignalDecision(
        "project_1",
        current.runId,
        current.signalId,
      ),
    ).resolves.toMatchObject({
      relationship: "suppressed",
      recommendationId: legacy.recommendationId,
      suppressionReason: "existing_proposal",
    });
    await expect(
      GrowthOpportunityDecisionsRepository.getDecisionControllerSource(
        "project_1",
        current.runId,
        current.signalId,
      ),
    ).resolves.toMatchObject({
      controllerRunId: legacy.runId,
      controllerSignalId: legacy.signalId,
    });
    expect(
      (
        await client.execute({
          sql: "SELECT count(*) AS count FROM growth_recommendations WHERE id = ?",
          args: [candidate.recommendation.id],
        })
      ).rows[0],
    ).toMatchObject({ count: 0 });
  });

  it("rechecks the complete legacy graph atomically and falls back after drift", async () => {
    const keyPageId = "key_legacy_drift";
    const legacy = await seedLegacyPriorityPageGraph({
      suffix: "drift",
      keyPageId,
    });
    const found =
      await GrowthOpportunityDecisionsRepository.findLegacyPriorityPageController(
        "project_1",
        keyPageId,
        legacySteps,
      );
    expect(found?.recommendationId).toBe(legacy.recommendationId);
    await client.execute({
      sql: `UPDATE growth_recommendation_steps SET content = 'Tampered step'
        WHERE project_id = 'project_1' AND run_id = ?
          AND recommendation_id = ? AND position = 1`,
      args: [legacy.runId, legacy.recommendationId],
    });
    await expect(
      GrowthOpportunityDecisionsRepository.findLegacyPriorityPageController(
        "project_1",
        keyPageId,
        legacySteps,
      ),
    ).resolves.toBeNull();

    const current = await seedRunningPriorityPageSignal({
      suffix: "drift",
      keyPageId,
    });
    const candidate = decisionCandidate({
      suffix: "drift",
      runId: current.runId,
      signalId: current.signalId,
      dedupeKey: "f".repeat(64),
    });
    await GrowthOpportunityDecisionsRepository.writeDecision({
      ...candidate,
      legacyController: { ...found, keyPageId },
    });

    await expect(
      GrowthOpportunityDecisionsRepository.getSignalDecision(
        "project_1",
        current.runId,
        current.signalId,
      ),
    ).resolves.toMatchObject({
      relationship: "controller",
      recommendationId: candidate.recommendation.id,
    });
    await expect(
      GrowthOpportunityDecisionsRepository.getSignalDecision(
        "project_1",
        legacy.runId,
        legacy.signalId,
      ),
    ).resolves.toBeNull();
  });

  it("rejects a legacy Insight with more than one source Signal", async () => {
    const keyPageId = "key_legacy_multi_source";
    const legacy = await seedLegacyPriorityPageGraph({
      suffix: "multi_source",
      keyPageId,
    });
    const extraSignalId = "legacy_signal_multi_source_extra";
    await client.execute({
      sql: `INSERT INTO growth_signals (
        id, project_id, run_id, signal_type, entity_type, entity_ref, metric,
        severity, confidence, period_start, period_end, baseline_value,
        current_value, delta_value, evidence_kind, evidence_ref, captured_at
      ) VALUES (?, 'project_1', ?, 'priority_page_click_decline', 'key_page',
        ?, 'gsc_clicks', 'warning', 0.8, '2026-07-01', '2026-07-28', 20,
        10, -10, 'gsc_period', 'gsc:multi-source-extra',
        '2026-07-29T10:00:00.000Z')`,
      args: [extraSignalId, legacy.runId, keyPageId],
    });
    await client.execute({
      sql: `INSERT INTO growth_insight_signals
        (project_id, run_id, insight_id, signal_id)
        VALUES ('project_1', ?, ?, ?)`,
      args: [legacy.runId, legacy.insightId, extraSignalId],
    });
    await expect(
      GrowthOpportunityDecisionsRepository.findLegacyPriorityPageController(
        "project_1",
        keyPageId,
        legacySteps,
      ),
    ).resolves.toBeNull();
  });

  it("ranks only the exact template Action ahead of a proposed legacy graph", async () => {
    const keyPageId = "key_legacy_action_rank";
    const proposed = await seedLegacyPriorityPageGraph({
      suffix: "rank_proposed",
      keyPageId,
    });
    const accepted = await seedLegacyPriorityPageGraph({
      suffix: "rank_accepted",
      keyPageId,
    });
    await client.execute({
      sql: `UPDATE growth_recommendations SET status = 'accepted'
        WHERE project_id = 'project_1' AND id = ?`,
      args: [accepted.recommendationId],
    });
    await client.execute({
      sql: `INSERT INTO growth_actions (
        id, project_id, recommendation_id, creation_key, fact_hash, title,
        description, category, priority_score, due_at, approved_at
      ) VALUES ('legacy_extra_action', 'project_1', ?, 'unrelated:action', ?,
        'Unrelated work', 'Does not qualify the template.', 'investigation',
        0, '2026-09-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z')`,
      args: [accepted.recommendationId, "e".repeat(64)],
    });
    await expect(
      GrowthOpportunityDecisionsRepository.findLegacyPriorityPageController(
        "project_1",
        keyPageId,
        legacySteps,
      ),
    ).resolves.toMatchObject({
      recommendationId: proposed.recommendationId,
    });

    await client.execute({
      sql: `UPDATE growth_actions SET creation_key = ?
        WHERE project_id = 'project_1' AND id = 'legacy_extra_action'`,
      args: [`priority-page-investigation-v1:action:${accepted.signalId}`],
    });
    await expect(
      GrowthOpportunityDecisionsRepository.findLegacyPriorityPageController(
        "project_1",
        keyPageId,
        legacySteps,
      ),
    ).resolves.toMatchObject({
      recommendationId: accepted.recommendationId,
    });
  });

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

  it("releases an exact evaluated controller and retains both cycles", async () => {
    const first = await seedRunningPriorityPageSignal({
      suffix: "release_first",
      keyPageId: "key_release",
    });
    const dedupeKey = "9".repeat(64);
    const firstCandidate = decisionCandidate({
      suffix: "release_first",
      runId: first.runId,
      signalId: first.signalId,
      dedupeKey,
    });
    await GrowthOpportunityDecisionsRepository.writeDecision(firstCandidate);
    await client.execute({
      sql: `INSERT INTO growth_actions (
        id, project_id, recommendation_id, creation_key, fact_hash, title,
        description, category, priority_score, status, state_version, due_at,
        approved_at, started_at, implemented_at, evaluated_at
      ) VALUES ('release_action', 'project_1', ?, ?, ?, 'Evaluate', 'Done.',
        'investigation', 0, 'evaluated', 1, '2026-09-01T00:00:00.000Z',
        '2026-08-01T00:00:00.000Z', '2026-08-02T00:00:00.000Z',
        '2026-08-27T00:00:00.000Z', '2026-08-28T10:00:00.000Z')`,
      args: [
        firstCandidate.recommendation.id,
        `priority-page-investigation-v1:action:${first.signalId}`,
        "f".repeat(64),
      ],
    });
    const later = await seedRunningPriorityPageSignal({
      suffix: "release_later",
      keyPageId: "key_release",
    });
    const laterCandidate = decisionCandidate({
      suffix: "release_later",
      runId: later.runId,
      signalId: later.signalId,
      dedupeKey,
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T12:00:00.000Z"));
    try {
      await GrowthOpportunityDecisionsRepository.writeDecision({
        ...laterCandidate,
        releaseController: {
          recommendationId: firstCandidate.recommendation.id,
          signalRunId: first.runId,
          signalId: first.signalId,
        },
      });
      const sameClock = await seedRunningPriorityPageSignal({
        suffix: "release_same_clock",
        keyPageId: "key_release",
      });
      await GrowthOpportunityDecisionsRepository.writeDecision({
        ...decisionCandidate({
          suffix: "release_same_clock",
          runId: sameClock.runId,
          signalId: sameClock.signalId,
          dedupeKey,
        }),
        releaseController: {
          recommendationId: firstCandidate.recommendation.id,
          signalRunId: first.runId,
          signalId: first.signalId,
        },
      });
      await expect(
        GrowthOpportunityDecisionsRepository.getSignalDecision(
          "project_1",
          sameClock.runId,
          sameClock.signalId,
        ),
      ).resolves.toMatchObject({
        relationship: "suppressed",
        recommendationId: laterCandidate.recommendation.id,
      });
    } finally {
      vi.useRealTimers();
    }
    const released =
      await GrowthOpportunityDecisionsRepository.getSignalDecision(
        "project_1",
        first.runId,
        first.signalId,
      );
    expect(released?.relationship).toBe("controller");
    expect(typeof released?.controllerReleasedAt).toBe("string");
    await expect(
      GrowthOpportunityDecisionsRepository.getSignalDecision(
        "project_1",
        later.runId,
        later.signalId,
      ),
    ).resolves.toMatchObject({
      relationship: "controller",
      recommendationId: laterCandidate.recommendation.id,
      controllerReleasedAt: null,
    });
  });

  it("compares release timestamps as instants and fails closed on D1", async () => {
    const scenarios = [
      {
        suffix: "instant_after_lex_before",
        dedupeKey: "g".repeat(64),
        evaluatedAt: "2026-09-01T10:00:00+02:00",
        capturedAt: "2026-09-01T09:00:00+00:00",
        releases: true,
      },
      {
        suffix: "instant_before_lex_after",
        dedupeKey: "h".repeat(64),
        evaluatedAt: "2026-09-01T09:00:00+00:00",
        capturedAt: "2026-09-01T10:00:00+02:00",
        releases: false,
      },
      {
        suffix: "equal_instant",
        dedupeKey: "i".repeat(64),
        evaluatedAt: "2026-09-01T09:00:00+00:00",
        capturedAt: "2026-09-01T11:00:00+02:00",
        releases: false,
      },
      {
        suffix: "malformed_evaluation",
        dedupeKey: "j".repeat(64),
        evaluatedAt: "not-a-valid-evaluation",
        capturedAt: "2026-09-01T12:00:00+00:00",
        releases: false,
      },
      {
        suffix: "malformed_capture",
        dedupeKey: "k".repeat(64),
        evaluatedAt: "2026-09-01T09:00:00+00:00",
        capturedAt: "not-a-valid-capture",
        releases: false,
      },
    ];
    for (const scenario of scenarios) {
      const controller = await seedControllerWithAction(scenario);
      const outcome = await attemptControllerRelease({
        ...scenario,
        controller,
      });
      if (scenario.releases) {
        expect(outcome.oldDecision?.controllerReleasedAt).toEqual(
          expect.any(String),
        );
        expect(outcome.laterDecision).toMatchObject({
          relationship: "controller",
          controllerReleasedAt: null,
        });
      } else {
        expect(outcome.oldDecision).toMatchObject({
          relationship: "controller",
          controllerReleasedAt: null,
        });
        expect(outcome.laterDecision).toMatchObject({
          relationship: "suppressed",
          recommendationId: controller.controller.recommendation.id,
        });
      }
    }
  });

  it("requires the exact evaluated controller Action on D1", async () => {
    const scenarios = [
      {
        suffix: "unrelated_evaluated_action",
        dedupeKey: "l".repeat(64),
        evaluatedAt: "2026-08-28T10:00:00.000Z",
        actionCreationKey: "unrelated:action",
      },
      {
        suffix: "exact_measuring_action",
        dedupeKey: "m".repeat(64),
        evaluatedAt: null,
        actionStatus: "measuring" as const,
      },
    ];
    for (const scenario of scenarios) {
      const controller = await seedControllerWithAction(scenario);
      const outcome = await attemptControllerRelease({
        suffix: scenario.suffix,
        dedupeKey: scenario.dedupeKey,
        capturedAt: "2026-09-01T12:00:00.000Z",
        controller,
      });
      expect(outcome.oldDecision).toMatchObject({
        relationship: "controller",
        controllerReleasedAt: null,
      });
      expect(outcome.laterDecision).toMatchObject({
        relationship: "suppressed",
        recommendationId: controller.controller.recommendation.id,
      });
    }
  });
});
