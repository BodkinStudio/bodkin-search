/* eslint-disable max-lines -- exhaustive live-provider acceptance is easier to audit as one sequential fixture */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { withPgClient as withPgClientExport } from "@/db";
import type { GrowthInsightsRepository as RepositoryExport } from "./GrowthInsightsRepository";
import type { GrowthOpportunityDecisionsRepository as DecisionsExport } from "./GrowthOpportunityDecisionsRepository";
import type { GrowthOpportunityDecisionsService as DecisionsServiceExport } from "../services/GrowthOpportunityDecisionsService";

const testUrl = process.env.TEST_POSTGRES_DATABASE_URL;

vi.mock("cloudflare:workers", () => ({
  env: {
    DATABASE_PROVIDER: "postgres",
    HYPERDRIVE: { connectionString: testUrl },
  },
}));

type Repository = typeof RepositoryExport;
type Decisions = typeof DecisionsExport;
type DecisionsService = typeof DecisionsServiceExport;
type WithPgClient = typeof withPgClientExport;

let sql: ReturnType<typeof postgres>;
let GrowthInsightsRepository: Repository;
let GrowthOpportunityDecisionsRepository: Decisions;
let GrowthOpportunityDecisionsService: DecisionsService;
let withPgClient: WithPgClient;

const describePostgres = testUrl ? describe : describe.skip;
const noop = () => {};

async function waitForBlockedGrowthRunLock(runId: string) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const [result] = await sql<[{ blocked: boolean }]>`
      SELECT EXISTS (
        SELECT 1
        FROM pg_locks waiting
        JOIN pg_locks holding
          ON waiting.locktype = holding.locktype
          AND waiting.database IS NOT DISTINCT FROM holding.database
          AND waiting.relation IS NOT DISTINCT FROM holding.relation
          AND waiting.page IS NOT DISTINCT FROM holding.page
          AND waiting.tuple IS NOT DISTINCT FROM holding.tuple
          AND waiting.transactionid IS NOT DISTINCT FROM holding.transactionid
          AND waiting.classid IS NOT DISTINCT FROM holding.classid
          AND waiting.objid IS NOT DISTINCT FROM holding.objid
          AND waiting.objsubid IS NOT DISTINCT FROM holding.objsubid
          AND waiting.pid <> holding.pid
        WHERE NOT waiting.granted
          AND holding.granted
      ) AS blocked
    `;
    if (result?.blocked) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Insight insert did not block on Growth run ${runId}`);
}

async function seedProject(
  projectId: string,
  organizationId: string,
  suffix: string,
) {
  await sql`
    INSERT INTO organization (id, name, slug, created_at)
    VALUES (${organizationId}, 'Growth Insights test', ${`growth-insights-${suffix}`}, now())
  `;
  await sql`
    INSERT INTO projects (id, organization_id, name, domain)
    VALUES (${projectId}, ${organizationId}, 'Growth Insights test', 'example.com')
  `;
}

async function seedRunAndSignal(input: {
  projectId: string;
  runId: string;
  signalId: string;
  suffix: string;
}) {
  await sql`
    INSERT INTO growth_runs (
      id, project_id, run_type, trigger, status, cadence_slot, period_start,
      period_end, started_at, detector_version
    ) VALUES (
      ${input.runId}, ${input.projectId}, 'manual_analysis', 'manual', 'running',
      ${input.suffix}, '2026-08-01', '2026-08-29',
      '2026-08-29T10:00:00.000Z', 'v1'
    )
  `;
  await sql`
    INSERT INTO growth_signals (
      id, project_id, run_id, signal_type, entity_type, entity_ref, metric,
      severity, confidence, period_start, period_end, baseline_value,
      current_value, delta_value, evidence_kind, evidence_ref, captured_at
    ) VALUES (
      ${input.signalId}, ${input.projectId}, ${input.runId},
      'page_clicks_down', 'page', 'https://example.com/pricing', 'clicks',
      'warning', 0.75, '2026-08-01', '2026-08-29', 20, 10, -10,
      'manual_observation', ${`postgres:${input.suffix}`},
      '2026-08-29T10:00:00.000Z'
    )
  `;
}

function eligiblePriorityPageSignal(input: {
  projectId: string;
  runId: string;
  signalId: string;
  keyPageId: string;
  capturedAt: string;
  suffix: string;
}) {
  return {
    id: input.signalId,
    projectId: input.projectId,
    runId: input.runId,
    signalType: "priority_page_click_decline" as const,
    entityType: "key_page" as const,
    entityRef: input.keyPageId,
    metric: "gsc_clicks",
    severity: "warning" as const,
    confidence: 0.8,
    periodStart: "2026-08-01",
    periodEnd: "2026-08-28",
    baselineValue: 20,
    currentValue: 10,
    deltaValue: -10,
    deltaPercent: -50,
    evidenceKind: "gsc_period" as const,
    evidenceRef: `gsc:${input.suffix}`,
    capturedAt: input.capturedAt,
  };
}

async function seedEligiblePriorityPageSignal(input: {
  projectId: string;
  runId: string;
  signalId: string;
  keyPageId: string;
  capturedAt: string;
  suffix: string;
}) {
  const signal = eligiblePriorityPageSignal(input);
  await sql`
    INSERT INTO growth_runs (
      id, project_id, run_type, trigger, status, cadence_slot, period_start,
      period_end, started_at, detector_version
    ) VALUES (
      ${input.runId}, ${input.projectId}, 'manual_analysis', 'manual', 'running',
      ${`priority-page-check:${input.suffix}`}, '2026-08-01', '2026-08-28',
      '2026-08-29T10:00:00.000Z', 'priority-page-click-decline-v1'
    )
  `;
  await sql`
    INSERT INTO growth_signals (
      id, project_id, run_id, signal_type, entity_type, entity_ref, metric,
      severity, confidence, period_start, period_end, baseline_value,
      current_value, delta_value, delta_percent, evidence_kind, evidence_ref,
      captured_at
    ) VALUES (
      ${signal.id}, ${signal.projectId}, ${signal.runId}, ${signal.signalType},
      ${signal.entityType}, ${signal.entityRef}, ${signal.metric},
      ${signal.severity}, ${signal.confidence}, ${signal.periodStart},
      ${signal.periodEnd}, ${signal.baselineValue}, ${signal.currentValue},
      ${signal.deltaValue}, ${signal.deltaPercent}, ${signal.evidenceKind},
      ${signal.evidenceRef}, ${signal.capturedAt}
    )
  `;
  return signal;
}

async function seedRecommendation(input: {
  projectId: string;
  runId: string;
  recommendationId: string;
}) {
  await sql`
    INSERT INTO growth_recommendations (
      id, project_id, run_id, creation_key, fact_hash, title, rationale,
      category, impact, commercial_relevance, effort, urgency, confidence,
      priority_score
    ) VALUES (
      ${input.recommendationId}, ${input.projectId}, ${input.runId},
      ${input.recommendationId}, ${"e".repeat(64)}, 'Test Recommendation',
      'Verifies same-run resolution integrity.', 'content', 4, 5, 2, 3,
      0.75, 10
    )
  `;
}

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
  projectId: string;
  runId: string;
  signalId: string;
  insightId: string;
  recommendationId: string;
  keyPageId: string;
  suffix: string;
}) {
  await sql`
    INSERT INTO growth_runs (
      id, project_id, run_type, trigger, status, cadence_slot, period_start,
      period_end, started_at, completed_at, detector_version, analysis_version
    ) VALUES (
      ${input.runId}, ${input.projectId}, 'manual_analysis', 'manual',
      'completed', ${`priority-page-check:legacy:${input.suffix}`},
      '2026-07-01', '2026-07-28', '2026-07-29T10:00:00.000Z',
      '2026-07-29T10:01:00.000Z', 'priority-page-click-decline-v1',
      'priority-page-investigation-v1'
    )
  `;
  await sql`
    INSERT INTO growth_signals (
      id, project_id, run_id, signal_type, entity_type, entity_ref, metric,
      severity, confidence, period_start, period_end, baseline_value,
      current_value, delta_value, evidence_kind, evidence_ref, captured_at
    ) VALUES (
      ${input.signalId}, ${input.projectId}, ${input.runId},
      'priority_page_click_decline', 'key_page', ${input.keyPageId},
      'gsc_clicks', 'warning', 0.8, '2026-07-01', '2026-07-28', 20, 10,
      -10, 'gsc_period', ${`gsc:legacy:${input.suffix}`},
      '2026-07-29T10:00:00.000Z'
    )
  `;
  await sql`
    INSERT INTO growth_insights (
      id, project_id, run_id, creation_key, fact_hash, title, explanation,
      hypothesis, confidence
    ) VALUES (
      ${input.insightId}, ${input.projectId}, ${input.runId},
      ${`priority-page-investigation-v1:insight:${input.signalId}`},
      ${"a".repeat(64)}, 'Observed decline', 'Clicks fell.', 'Cause unknown.', 0
    )
  `;
  await sql`
    INSERT INTO growth_insight_signals
      (project_id, run_id, insight_id, signal_id)
    VALUES (${input.projectId}, ${input.runId}, ${input.insightId}, ${input.signalId})
  `;
  await sql`
    INSERT INTO growth_recommendations (
      id, project_id, run_id, creation_key, fact_hash, title, rationale,
      category, impact, commercial_relevance, effort, urgency, confidence,
      priority_score, created_at
    ) VALUES (
      ${input.recommendationId}, ${input.projectId}, ${input.runId},
      ${`priority-page-investigation-v1:recommendation:${input.signalId}`},
      ${"b".repeat(64)}, 'Investigate decline', 'Cause unknown.',
      'investigation', 1, 1, 1, 1, 0, 0, '2026-07-29T10:00:00.000Z'
    )
  `;
  await sql`
    INSERT INTO growth_recommendation_insights
      (project_id, run_id, recommendation_id, insight_id)
    VALUES (${input.projectId}, ${input.runId}, ${input.recommendationId}, ${input.insightId})
  `;
  await sql`
    INSERT INTO growth_recommendation_targets
      (project_id, run_id, recommendation_id, target_type, target_value)
    VALUES (
      ${input.projectId}, ${input.runId}, ${input.recommendationId}, 'url',
      ${`https://example.com/${input.suffix}`}
    )
  `;
  for (const step of legacySteps) {
    await sql`
      INSERT INTO growth_recommendation_steps
        (project_id, run_id, recommendation_id, position, content)
      VALUES (
        ${input.projectId}, ${input.runId}, ${input.recommendationId},
        ${step.position}, ${step.content}
      )
    `;
  }
}

function priorityDecisionCandidate(input: {
  projectId: string;
  runId: string;
  signalId: string;
  suffix: string;
  dedupeKey: string;
}) {
  const insightId = `decision_insight_${input.suffix}`;
  return {
    projectId: input.projectId,
    signalRunId: input.runId,
    signalId: input.signalId,
    dedupeKey: input.dedupeKey,
    policyVersion: "priority-page-repeat-suppression-v1",
    insight: {
      id: insightId,
      projectId: input.projectId,
      runId: input.runId,
      creationKey: `template:insight:${input.signalId}`,
      factHash: "a".repeat(64),
      title: "Priority decline",
      explanation: "Clicks fell.",
      hypothesis: "Unknown cause.",
      confidence: 0,
      model: null,
      promptVersion: null,
      signalIds: [input.signalId],
    },
    recommendation: {
      id: `decision_recommendation_${input.suffix}`,
      projectId: input.projectId,
      runId: input.runId,
      creationKey: `template:recommendation:${input.signalId}`,
      factHash: "b".repeat(64),
      title: "Investigate decline",
      rationale: "This deterministic investigation needs review.",
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
          targetValue: "https://example.com/pricing",
        },
      ],
      steps: [{ position: 0, content: "Review saved evidence." }],
    },
  };
}

async function seedPostgresStrikingSignals(projectId: string, suffix: string) {
  const runId = `striking_run_${suffix}`;
  const ids = {
    position: `striking_position_${suffix}`,
    impressions: `striking_impressions_${suffix}`,
    clicks: `striking_clicks_${suffix}`,
  };
  await sql`
    INSERT INTO growth_runs (id, project_id, run_type, trigger, status, cadence_slot, period_start, period_end, started_at, detector_version, analysis_version)
    VALUES (${runId}, ${projectId}, 'manual_analysis', 'manual', 'running', ${`striking-distance-check:${suffix}`}, '2026-07-07', '2026-08-31', '2026-09-01T10:00:00.000Z', 'striking-distance-query-v1', 'striking-distance-investigation-v1')
  `;
  for (const [metric, id, baseline, current] of [
    ["gsc_average_position", ids.position, 9, 6],
    ["gsc_impressions", ids.impressions, 80, 150],
    ["gsc_clicks", ids.clicks, 2, 1],
  ] as const) {
    await sql`
      INSERT INTO growth_signals (id, project_id, run_id, signal_type, entity_type, entity_ref, metric, severity, confidence, period_start, period_end, baseline_value, current_value, delta_value, evidence_kind, evidence_ref, captured_at)
      VALUES (${id}, ${projectId}, ${runId}, 'striking_distance_query', 'search_query', 'web design bath', ${metric}, 'info', .8, '2026-08-04', '2026-08-31', ${baseline}, ${current}, ${current - baseline}, 'gsc_period', 'gsc_striking_distance_v1:test', '2026-09-01T10:00:00.000Z')
    `;
  }
  return { runId, ids };
}

function strikingDecisionCandidate(input: {
  projectId: string;
  suffix: string;
  runId: string;
  ids: { position: string; impressions: string; clicks: string };
  dedupeKey: string;
}) {
  const insightId = `striking_insight_${input.suffix}`;
  return {
    projectId: input.projectId,
    signalRunId: input.runId,
    signalId: input.ids.impressions,
    dedupeKey: input.dedupeKey,
    policyVersion: "striking-distance-repeat-suppression-v1",
    actionKeyPrefix: "striking-distance-investigation-v1:action:",
    insight: {
      id: insightId,
      projectId: input.projectId,
      runId: input.runId,
      creationKey: `striking-distance-investigation-v1:insight:${input.ids.impressions}`,
      factHash: `a${input.suffix}`.padEnd(64, "a"),
      title: "Observed striking distance",
      explanation: "Observed facts.",
      hypothesis: "Unknown cause.",
      confidence: 0,
      model: null,
      promptVersion: null,
      signalIds: [input.ids.position, input.ids.impressions, input.ids.clicks],
    },
    recommendation: {
      id: `striking_recommendation_${input.suffix}`,
      projectId: input.projectId,
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
      steps: [{ position: 0, content: "Review saved evidence." }],
    },
  };
}

async function seedPostgresControllerWithAction(input: {
  projectId: string;
  suffix: string;
  dedupeKey: string;
  evaluatedAt: string | null;
  actionStatus?: "evaluated" | "measuring";
  exactAction?: boolean;
}) {
  const runId = `release_source_run_${input.suffix}`;
  const signalId = `release_source_signal_${input.suffix}`;
  await seedEligiblePriorityPageSignal({
    projectId: input.projectId,
    runId,
    signalId,
    keyPageId: `release_key_page_${input.suffix}`,
    capturedAt: "2026-08-27T10:00:00.000Z",
    suffix: `release-source-${input.suffix}`,
  });
  const controller = priorityDecisionCandidate({
    projectId: input.projectId,
    runId,
    signalId,
    suffix: input.suffix,
    dedupeKey: input.dedupeKey,
  });
  await withPgClient(() =>
    GrowthOpportunityDecisionsRepository.writeDecision(controller),
  );
  await sql`
    INSERT INTO growth_actions (
      id, project_id, recommendation_id, creation_key, fact_hash, title,
      description, category, priority_score, status, state_version, due_at,
      approved_at, started_at, implemented_at, evaluated_at
    ) VALUES (
      ${`release_action_${input.suffix}`}, ${input.projectId},
      ${controller.recommendation.id},
      ${input.exactAction === false ? `unrelated:action:${signalId}` : `priority-page-investigation-v1:action:${signalId}`},
      ${"f".repeat(64)}, 'Controller Action', 'Saved work.', 'investigation',
      0, ${input.actionStatus ?? "evaluated"}, 1,
      '2026-09-30T00:00:00.000Z', '2026-08-01T00:00:00.000Z',
      '2026-08-02T00:00:00.000Z', '2026-08-27T00:00:00.000Z',
      ${input.evaluatedAt}
    )
  `;
  return { runId, signalId, controller };
}

async function attemptPostgresControllerRelease(input: {
  projectId: string;
  suffix: string;
  dedupeKey: string;
  capturedAt: string;
  controller: Awaited<ReturnType<typeof seedPostgresControllerWithAction>>;
}) {
  const runId = `release_later_run_${input.suffix}`;
  const signalId = `release_later_signal_${input.suffix}`;
  await seedEligiblePriorityPageSignal({
    projectId: input.projectId,
    runId,
    signalId,
    keyPageId: `release_key_page_${input.suffix}`,
    capturedAt: input.capturedAt,
    suffix: `release-later-${input.suffix}`,
  });
  await expect(
    withPgClient(() =>
      GrowthOpportunityDecisionsRepository.writeDecision({
        ...priorityDecisionCandidate({
          projectId: input.projectId,
          runId,
          signalId,
          suffix: `later_${input.suffix}`,
          dedupeKey: input.dedupeKey,
        }),
        releaseController: {
          recommendationId: input.controller.controller.recommendation.id,
          signalRunId: input.controller.runId,
          signalId: input.controller.signalId,
        },
      }),
    ),
  ).resolves.toBeUndefined();
  const [oldDecision, laterDecision] = await Promise.all([
    withPgClient(() =>
      GrowthOpportunityDecisionsRepository.getSignalDecision(
        input.projectId,
        input.controller.runId,
        input.controller.signalId,
      ),
    ),
    withPgClient(() =>
      GrowthOpportunityDecisionsRepository.getSignalDecision(
        input.projectId,
        runId,
        signalId,
      ),
    ),
  ]);
  return { oldDecision, laterDecision };
}

// This live-provider suite deliberately shares one migrated database connection
// and sequential cleanup lifecycle so each dialect invariant remains visible.
// eslint-disable-next-line max-lines-per-function
describePostgres("GrowthInsightsRepository Postgres", () => {
  beforeAll(async () => {
    // TEST_POSTGRES_DATABASE_URL explicitly opts into a disposable migrated
    // OpenSEO database. This test never creates, drops, or migrates databases.
    sql = postgres(testUrl!, { max: 5 });
    ({ GrowthInsightsRepository } = await import("./GrowthInsightsRepository"));
    ({ GrowthOpportunityDecisionsRepository } =
      await import("./GrowthOpportunityDecisionsRepository"));
    ({ GrowthOpportunityDecisionsService } =
      await import("../services/GrowthOpportunityDecisionsService"));
    ({ withPgClient } = await import("@/db"));
  });

  afterAll(async () => {
    if (testUrl) await sql.end({ timeout: 5 });
  });

  it("rejects a suppressed decision without its closed reason", async () => {
    const suffix = crypto.randomUUID();
    const organizationId = `growth_null_reason_org_${suffix}`;
    const projectId = `growth_null_reason_project_${suffix}`;
    const runId = `growth_null_reason_run_${suffix}`;
    const signalId = `growth_null_reason_signal_${suffix}`;
    const recommendationId = `growth_null_reason_recommendation_${suffix}`;
    await seedProject(projectId, organizationId, suffix);
    await seedRunAndSignal({ projectId, runId, signalId, suffix });
    await seedRecommendation({ projectId, runId, recommendationId });
    try {
      await expect(sql`
        INSERT INTO growth_recommendation_signal_links (
          project_id, signal_run_id, signal_id, dedupe_key,
          recommendation_id, relationship, suppression_reason, policy_version
        ) VALUES (
          ${projectId}, ${runId}, ${signalId}, ${"f".repeat(64)},
          ${recommendationId}, 'suppressed', NULL,
          'priority-page-repeat-suppression-v1'
        )
      `).rejects.toThrow();
    } finally {
      await sql`DELETE FROM projects WHERE id = ${projectId}`;
      await sql`DELETE FROM organization WHERE id = ${organizationId}`;
    }
  });

  it("keeps a striking controller's three facts immutable when a repeat is suppressed", async () => {
    const suffix = crypto.randomUUID();
    const organizationId = `growth_striking_org_${suffix}`;
    const projectId = `growth_striking_project_${suffix}`;
    await seedProject(projectId, organizationId, suffix);
    try {
      const dedupeKey = "e".repeat(64);
      const first = await seedPostgresStrikingSignals(
        projectId,
        `${suffix}_first`,
      );
      const firstCandidate = strikingDecisionCandidate({
        projectId,
        suffix: `${suffix}_first`,
        ...first,
        dedupeKey,
      });
      await withPgClient(() =>
        GrowthOpportunityDecisionsRepository.writeDecision(firstCandidate),
      );
      const repeat = await seedPostgresStrikingSignals(
        projectId,
        `${suffix}_repeat`,
      );
      const repeatCandidate = strikingDecisionCandidate({
        projectId,
        suffix: `${suffix}_repeat`,
        ...repeat,
        dedupeKey,
      });
      await withPgClient(() =>
        GrowthOpportunityDecisionsRepository.writeDecision(repeatCandidate),
      );
      const [counts] = await sql<
        [
          {
            insightSignals: string;
            controllers: string;
            repeats: string;
            insights: string;
            recommendations: string;
          },
        ]
      >`
        SELECT
          (SELECT count(*)::text FROM growth_insight_signals WHERE project_id = ${projectId} AND insight_id = ${firstCandidate.insight.id}) AS "insightSignals",
          (SELECT count(*)::text FROM growth_recommendation_signal_links WHERE project_id = ${projectId} AND relationship = 'controller') AS controllers,
          (SELECT count(*)::text FROM growth_recommendation_signal_links WHERE project_id = ${projectId} AND signal_run_id = ${repeat.runId} AND signal_id = ${repeat.ids.impressions} AND relationship = 'suppressed') AS repeats,
          (SELECT count(*)::text FROM growth_insights WHERE project_id = ${projectId}) AS insights,
          (SELECT count(*)::text FROM growth_recommendations WHERE project_id = ${projectId}) AS recommendations
      `;
      expect(counts).toEqual({
        insightSignals: "3",
        controllers: "1",
        repeats: "1",
        insights: "1",
        recommendations: "1",
      });
      const repeatDecision = await withPgClient(() =>
        GrowthOpportunityDecisionsRepository.getSignalDecision(
          projectId,
          repeat.runId,
          repeat.ids.impressions,
        ),
      );
      expect(repeatDecision).toMatchObject({
        relationship: "suppressed",
        recommendationId: firstCandidate.recommendation.id,
      });
    } finally {
      await sql`DELETE FROM projects WHERE id = ${projectId}`;
      await sql`DELETE FROM organization WHERE id = ${organizationId}`;
    }
  });

  it("races two Signal decisions to one controller without an orphan graph", async () => {
    const suffix = crypto.randomUUID();
    const organizationId = `growth_decision_org_${suffix}`;
    const projectId = `growth_decision_project_${suffix}`;
    const runA = `growth_decision_run_a_${suffix}`;
    const runB = `growth_decision_run_b_${suffix}`;
    const signalA = `growth_decision_signal_a_${suffix}`;
    const signalB = `growth_decision_signal_b_${suffix}`;
    await seedProject(projectId, organizationId, suffix);
    await seedRunAndSignal({
      projectId,
      runId: runA,
      signalId: signalA,
      suffix: `${suffix}-a`,
    });
    await seedRunAndSignal({
      projectId,
      runId: runB,
      signalId: signalB,
      suffix: `${suffix}-b`,
    });
    const dedupeKey = "d".repeat(64);
    const candidate = (runId: string, signalId: string) =>
      priorityDecisionCandidate({
        projectId,
        runId,
        signalId,
        suffix,
        dedupeKey,
      });
    try {
      await Promise.all([
        withPgClient(() =>
          GrowthOpportunityDecisionsRepository.writeDecision(
            candidate(runA, signalA),
          ),
        ),
        withPgClient(() =>
          GrowthOpportunityDecisionsRepository.writeDecision(
            candidate(runB, signalB),
          ),
        ),
      ]);
      const [counts] = await sql<
        [{ decisions: string; controllers: string; recommendations: string }]
      >`
        SELECT (SELECT count(*)::text FROM growth_recommendation_signal_links WHERE project_id = ${projectId}) AS decisions,
          (SELECT count(*)::text FROM growth_recommendation_signal_links WHERE project_id = ${projectId} AND relationship = 'controller') AS controllers,
          (SELECT count(*)::text FROM growth_recommendations WHERE project_id = ${projectId}) AS recommendations
      `;
      expect(counts).toEqual({
        decisions: "2",
        controllers: "1",
        recommendations: "1",
      });
      const decisions = await sql<
        {
          runId: string;
          signalId: string;
          relationship: "controller" | "suppressed";
        }[]
      >`
        SELECT signal_run_id AS "runId", signal_id AS "signalId", relationship
        FROM growth_recommendation_signal_links
        WHERE project_id = ${projectId}
      `;
      const controller = decisions.find(
        ({ relationship }) => relationship === "controller",
      );
      const suppressed = decisions.find(
        ({ relationship }) => relationship === "suppressed",
      );
      expect(controller).toBeDefined();
      expect(suppressed).toBeDefined();
      await expect(sql`
          DELETE FROM growth_recommendations
          WHERE project_id = ${projectId}
            AND id = ${`decision_recommendation_${suffix}`}
        `).rejects.toThrow();
      await expect(sql`
          DELETE FROM growth_runs
          WHERE project_id = ${projectId} AND id = ${controller!.runId}
        `).rejects.toThrow();
      await sql`
          DELETE FROM growth_signals
          WHERE project_id = ${projectId}
            AND run_id = ${suppressed!.runId}
            AND id = ${suppressed!.signalId}
        `;
      const [afterSuppressedDelete] = await sql<
        [{ decisions: string; recommendations: string }]
      >`
          SELECT
            (SELECT count(*)::text FROM growth_recommendation_signal_links WHERE project_id = ${projectId}) AS decisions,
            (SELECT count(*)::text FROM growth_recommendations WHERE project_id = ${projectId}) AS recommendations
        `;
      expect(afterSuppressedDelete).toEqual({
        decisions: "1",
        recommendations: "1",
      });
      await sql`DELETE FROM projects WHERE id = ${projectId}`;
      const [afterProjectDelete] = await sql<{ decisions: string }[]>`
          SELECT count(*)::text AS decisions
          FROM growth_recommendation_signal_links
          WHERE project_id = ${projectId}
        `;
      expect(afterProjectDelete?.decisions).toBe("0");
    } finally {
      await sql`DELETE FROM projects WHERE id = ${projectId}`;
      await sql`DELETE FROM organization WHERE id = ${organizationId}`;
    }
  });

  it("lets a terminal Run win without leaving an orphan decision graph", async () => {
    const suffix = crypto.randomUUID();
    const organizationId = `growth_terminal_decision_org_${suffix}`;
    const projectId = `growth_terminal_decision_project_${suffix}`;
    const runId = `growth_terminal_decision_run_${suffix}`;
    const signalId = `growth_terminal_decision_signal_${suffix}`;
    await seedProject(projectId, organizationId, suffix);
    await seedRunAndSignal({ projectId, runId, signalId, suffix });

    let releaseTerminal = noop;
    try {
      const terminalReleased = new Promise<void>((resolve) => {
        releaseTerminal = resolve;
      });
      let terminalLocked!: () => void;
      const terminalHasLock = new Promise<void>((resolve) => {
        terminalLocked = resolve;
      });
      const terminal = sql.begin(async (tx) => {
        await tx`
          UPDATE growth_runs
          SET status = 'completed', completed_at = '2026-08-29T10:01:00.000Z'
          WHERE id = ${runId} AND project_id = ${projectId} AND status = 'running'
        `;
        terminalLocked();
        await terminalReleased;
      });
      await terminalHasLock;
      const decision = withPgClient(() =>
        GrowthOpportunityDecisionsRepository.writeDecision(
          priorityDecisionCandidate({
            projectId,
            runId,
            signalId,
            suffix,
            dedupeKey: "c".repeat(64),
          }),
        ),
      );
      void decision.catch(noop);
      await waitForBlockedGrowthRunLock(runId);
      releaseTerminal();
      await terminal;
      await decision;

      const [counts] = await sql<
        [{ insights: string; recommendations: string; decisions: string }]
      >`
        SELECT
          (SELECT count(*)::text FROM growth_insights WHERE project_id = ${projectId}) AS insights,
          (SELECT count(*)::text FROM growth_recommendations WHERE project_id = ${projectId}) AS recommendations,
          (SELECT count(*)::text FROM growth_recommendation_signal_links WHERE project_id = ${projectId}) AS decisions
      `;
      expect(counts).toEqual({
        insights: "0",
        recommendations: "0",
        decisions: "0",
      });
    } finally {
      releaseTerminal();
      await sql`DELETE FROM projects WHERE id = ${projectId}`;
      await sql`DELETE FROM organization WHERE id = ${organizationId}`;
    }
  }, 15_000);

  it("adopts and replays an exact legacy controller on PostgreSQL", async () => {
    const suffix = crypto.randomUUID();
    const organizationId = `growth_legacy_org_${suffix}`;
    const projectId = `growth_legacy_project_${suffix}`;
    const legacyRunId = `growth_legacy_run_${suffix}`;
    const legacySignalId = `growth_legacy_signal_${suffix}`;
    const legacyInsightId = `growth_legacy_insight_${suffix}`;
    const legacyRecommendationId = `growth_legacy_recommendation_${suffix}`;
    const currentRunId = `growth_legacy_current_run_${suffix}`;
    const currentSignalId = `growth_legacy_current_signal_${suffix}`;
    const keyPageId = `growth_legacy_key_page_${suffix}`;
    await seedProject(projectId, organizationId, suffix);
    await seedLegacyPriorityPageGraph({
      projectId,
      runId: legacyRunId,
      signalId: legacySignalId,
      insightId: legacyInsightId,
      recommendationId: legacyRecommendationId,
      keyPageId,
      suffix,
    });
    await seedRunAndSignal({
      projectId,
      runId: currentRunId,
      signalId: currentSignalId,
      suffix: `current-${suffix}`,
    });
    try {
      const legacy = await withPgClient(() =>
        GrowthOpportunityDecisionsRepository.findLegacyPriorityPageController(
          projectId,
          keyPageId,
          legacySteps,
        ),
      );
      expect(legacy).toEqual({
        recommendationId: legacyRecommendationId,
        signalRunId: legacyRunId,
        signalId: legacySignalId,
      });
      const candidateInsightId = `growth_legacy_candidate_insight_${suffix}`;
      await withPgClient(() =>
        GrowthOpportunityDecisionsRepository.writeDecision({
          projectId,
          signalRunId: currentRunId,
          signalId: currentSignalId,
          dedupeKey: "e".repeat(64),
          policyVersion: "priority-page-repeat-suppression-v1",
          legacyController: { ...legacy, keyPageId },
          insight: {
            id: candidateInsightId,
            projectId,
            runId: currentRunId,
            creationKey: `priority-page-investigation-v1:insight:${currentSignalId}`,
            factHash: "c".repeat(64),
            title: "Observed decline",
            explanation: "Clicks fell.",
            hypothesis: "Cause unknown.",
            confidence: 0,
            model: null,
            promptVersion: null,
            signalIds: [currentSignalId],
          },
          recommendation: {
            id: `growth_legacy_candidate_recommendation_${suffix}`,
            projectId,
            runId: currentRunId,
            creationKey: `priority-page-investigation-v1:recommendation:${currentSignalId}`,
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
            insightIds: [candidateInsightId],
            targets: [
              {
                targetType: "url",
                targetValue: `https://example.com/${suffix}`,
              },
            ],
            steps: legacySteps,
          },
        }),
      );
      await expect(
        withPgClient(() =>
          GrowthOpportunityDecisionsRepository.getDecisionControllerSource(
            projectId,
            currentRunId,
            currentSignalId,
          ),
        ),
      ).resolves.toMatchObject({
        relationship: "suppressed",
        recommendationId: legacyRecommendationId,
        controllerRunId: legacyRunId,
        controllerSignalId: legacySignalId,
      });
    } finally {
      await sql`DELETE FROM projects WHERE id = ${projectId}`;
      await sql`DELETE FROM organization WHERE id = ${organizationId}`;
    }
  });

  it("creates complete normalized graphs and keeps concurrent drift out of the winner", async () => {
    const [tables] = await sql<
      [
        {
          insights: string | null;
          recommendations: string | null;
          targets: string | null;
        },
      ]
    >`
      SELECT to_regclass('public.growth_insights') AS insights,
             to_regclass('public.growth_recommendations') AS recommendations,
             to_regclass('public.growth_recommendation_targets') AS targets
    `;
    expect(tables).toEqual({
      insights: "growth_insights",
      recommendations: "growth_recommendations",
      targets: "growth_recommendation_targets",
    });

    const suffix = crypto.randomUUID();
    const organizationId = `growth_graph_org_${suffix}`;
    const projectId = `growth_graph_project_${suffix}`;
    const runId = `growth_graph_run_${suffix}`;
    const signalId = `growth_graph_signal_${suffix}`;
    const insightId = `growth_graph_insight_${suffix}`;
    const recommendationKey = `growth-graph-recommendation-${suffix}`;
    await seedProject(projectId, organizationId, suffix);
    await seedRunAndSignal({ projectId, runId, signalId, suffix });

    try {
      await withPgClient(() =>
        GrowthInsightsRepository.createInsightGraph({
          id: insightId,
          projectId,
          runId,
          creationKey: `growth-graph-insight-${suffix}`,
          factHash: "a".repeat(64),
          title: "Pricing traffic declined",
          explanation: "Clicks fell against the comparison period.",
          hypothesis: "The pricing page lost search visibility.",
          confidence: 0.8,
          model: "test-model",
          promptVersion: "v1",
          signalIds: [signalId],
        }),
      );
      const insightGraph = await withPgClient(() =>
        GrowthInsightsRepository.getInsightGraph(projectId, runId, insightId),
      );
      expect(insightGraph?.insight).toMatchObject({
        id: insightId,
        projectId,
        runId,
        factHash: "a".repeat(64),
      });
      expect(insightGraph?.signalIds).toEqual([signalId]);

      const writes = [
        {
          id: `growth_graph_recommendation_a_${suffix}`,
          factHash: "b".repeat(64),
          title: "Winner A",
          targetValue: "pricing page",
          step: "Rewrite the page",
        },
        {
          id: `growth_graph_recommendation_b_${suffix}`,
          factHash: "c".repeat(64),
          title: "Winner B",
          targetValue: "commercial page",
          step: "Add proof points",
        },
      ] as const;
      await Promise.all(
        writes.map((write) =>
          withPgClient(() =>
            GrowthInsightsRepository.createRecommendationGraph({
              id: write.id,
              projectId,
              runId,
              creationKey: recommendationKey,
              factHash: write.factHash,
              title: write.title,
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
              insightIds: [insightId],
              targets: [
                { targetType: "keyword", targetValue: write.targetValue },
              ],
              steps: [{ position: 0, content: write.step }],
            }),
          ),
        ),
      );

      const [winner] = await sql<
        { id: string; fact_hash: string; title: string }[]
      >`
        SELECT id, fact_hash, title
        FROM growth_recommendations
        WHERE project_id = ${projectId}
          AND run_id = ${runId}
          AND creation_key = ${recommendationKey}
      `;
      expect(winner).toBeDefined();
      if (!winner) throw new Error("Concurrent Recommendation had no winner");
      const expected = writes.find(
        (write) => write.factHash === winner.fact_hash,
      );
      expect(expected).toBeDefined();
      if (!expected)
        throw new Error("Concurrent Recommendation winner had an unknown fact");
      const recommendationGraph = await withPgClient(() =>
        GrowthInsightsRepository.getRecommendationGraph(
          projectId,
          runId,
          winner.id,
        ),
      );
      expect(recommendationGraph?.recommendation).toMatchObject({
        id: expected.id,
        factHash: expected.factHash,
        title: expected.title,
      });
      expect(recommendationGraph?.insightIds).toEqual([insightId]);
      expect(recommendationGraph?.targets).toEqual([
        { targetType: "keyword", targetValue: expected.targetValue },
      ]);
      expect(recommendationGraph?.steps).toEqual([
        { position: 0, content: expected.step },
      ]);
    } finally {
      await sql`DELETE FROM projects WHERE id = ${projectId}`;
      await sql`DELETE FROM organization WHERE id = ${organizationId}`;
    }
  }, 15_000);

  it("makes terminal-first Insight creation wait and then insert nothing", async () => {
    const suffix = crypto.randomUUID();
    const organizationId = `growth_lock_org_${suffix}`;
    const projectId = `growth_lock_project_${suffix}`;
    const runId = `growth_lock_run_${suffix}`;
    const signalId = `growth_lock_signal_${suffix}`;
    const insightId = `growth_lock_insight_${suffix}`;
    await seedProject(projectId, organizationId, suffix);
    await seedRunAndSignal({ projectId, runId, signalId, suffix });

    let releaseTerminal = noop;
    try {
      const terminalReleased = new Promise<void>((resolve) => {
        releaseTerminal = resolve;
      });
      let terminalLocked!: () => void;
      const terminalHasLock = new Promise<void>((resolve) => {
        terminalLocked = resolve;
      });
      const terminal = sql.begin(async (tx) => {
        await tx`
          UPDATE growth_runs
          SET status = 'completed', completed_at = '2026-08-29T10:01:00.000Z'
          WHERE id = ${runId}
            AND project_id = ${projectId}
            AND status = 'running'
        `;
        terminalLocked();
        await terminalReleased;
      });
      await terminalHasLock;
      const creation = withPgClient(() =>
        GrowthInsightsRepository.createInsightGraph({
          id: insightId,
          projectId,
          runId,
          creationKey: `terminal-first-${suffix}`,
          factHash: "d".repeat(64),
          title: "Must not be inserted",
          explanation: "The terminal transition owns the run first.",
          hypothesis: "No graph can attach after completion.",
          confidence: 0.5,
          model: null,
          promptVersion: null,
          signalIds: [signalId],
        }),
      );
      // If a regression rejects before reaching the lock, attach a handler
      // immediately so the held terminal transaction can still be released.
      void creation.catch(noop);
      await waitForBlockedGrowthRunLock(runId);
      releaseTerminal();
      await terminal;
      await creation;

      const [run] = await sql<{ status: string }[]>`
        SELECT status FROM growth_runs WHERE id = ${runId}
      `;
      const [insights] = await sql<{ count: string }[]>`
        SELECT count(*)::text AS count
        FROM growth_insights
        WHERE id = ${insightId}
      `;
      expect(run?.status).toBe("completed");
      expect(insights?.count).toBe("0");
    } finally {
      // Always release the lock before cleanup if the block probe regresses.
      releaseTerminal();
      await sql`DELETE FROM projects WHERE id = ${projectId}`;
      await sql`DELETE FROM organization WHERE id = ${organizationId}`;
    }
  }, 15_000);

  it("rejects cross-run resolution and deletes a valid same-run resolution graph with its run", async () => {
    const suffix = crypto.randomUUID();
    const organizationId = `growth_resolution_org_${suffix}`;
    const projectId = `growth_resolution_project_${suffix}`;
    const runId = `growth_resolution_run_${suffix}`;
    const otherRunId = `growth_resolution_other_run_${suffix}`;
    const sourceId = `growth_resolution_source_${suffix}`;
    const destinationId = `growth_resolution_destination_${suffix}`;
    const crossRunDestinationId = `growth_resolution_cross_run_${suffix}`;
    await seedProject(projectId, organizationId, suffix);
    await seedRunAndSignal({
      projectId,
      runId,
      signalId: `growth_resolution_signal_${suffix}`,
      suffix: `resolution-${suffix}`,
    });
    await seedRunAndSignal({
      projectId,
      runId: otherRunId,
      signalId: `growth_resolution_other_signal_${suffix}`,
      suffix: `resolution-other-${suffix}`,
    });

    try {
      await seedRecommendation({
        projectId,
        runId,
        recommendationId: sourceId,
      });
      await seedRecommendation({
        projectId,
        runId,
        recommendationId: destinationId,
      });
      await seedRecommendation({
        projectId,
        runId: otherRunId,
        recommendationId: crossRunDestinationId,
      });

      await expect(
        withPgClient(() =>
          GrowthInsightsRepository.recommendationDestination(
            projectId,
            runId,
            crossRunDestinationId,
          ),
        ),
      ).resolves.toBeNull();
      await expect(
        withPgClient(() =>
          GrowthInsightsRepository.recommendationDestination(
            projectId,
            runId,
            destinationId,
          ),
        ),
      ).resolves.toMatchObject({ id: destinationId, runId });

      await expect(sql`
        UPDATE growth_recommendations
        SET status = 'merged',
            resolution_recommendation_id = ${crossRunDestinationId}
        WHERE project_id = ${projectId}
          AND run_id = ${runId}
          AND id = ${sourceId}
      `).rejects.toThrow();

      await sql`
        UPDATE growth_recommendations
        SET status = 'merged', resolution_recommendation_id = ${destinationId}
        WHERE project_id = ${projectId}
          AND run_id = ${runId}
          AND id = ${sourceId}
      `;
      await sql`
        DELETE FROM growth_runs
        WHERE project_id = ${projectId} AND id = ${runId}
      `;

      const [deletedRunRecommendations] = await sql<{ count: string }[]>`
        SELECT count(*)::text AS count
        FROM growth_recommendations
        WHERE project_id = ${projectId} AND run_id = ${runId}
      `;
      const [otherRunRecommendation] = await sql<{ count: string }[]>`
        SELECT count(*)::text AS count
        FROM growth_recommendations
        WHERE project_id = ${projectId} AND id = ${crossRunDestinationId}
      `;
      expect(deletedRunRecommendations?.count).toBe("0");
      expect(otherRunRecommendation?.count).toBe("1");
    } finally {
      await sql`DELETE FROM projects WHERE id = ${projectId}`;
      await sql`DELETE FROM organization WHERE id = ${organizationId}`;
    }
  });

  it("races two later Signals through one evaluated controller release", async () => {
    const suffix = crypto.randomUUID();
    const organizationId = `growth_release_org_${suffix}`;
    const projectId = `growth_release_project_${suffix}`;
    const firstRunId = `growth_release_first_run_${suffix}`;
    const firstSignalId = `growth_release_first_signal_${suffix}`;
    const laterRunA = `growth_release_later_run_a_${suffix}`;
    const laterRunB = `growth_release_later_run_b_${suffix}`;
    const laterSignalA = `growth_release_later_signal_a_${suffix}`;
    const laterSignalB = `growth_release_later_signal_b_${suffix}`;
    const keyPage = {
      id: `growth_release_key_page_${suffix}`,
      url: "https://example.com/pricing",
      commercialWeight: 5,
    };
    await seedProject(projectId, organizationId, suffix);
    const firstSignal = await seedEligiblePriorityPageSignal({
      projectId,
      runId: firstRunId,
      signalId: firstSignalId,
      keyPageId: keyPage.id,
      capturedAt: "2026-08-27T10:00:00.000Z",
      suffix: `release-first-${suffix}`,
    });
    try {
      const firstDecision = await withPgClient(() =>
        GrowthOpportunityDecisionsService.recordPriorityPageInvestigation({
          projectId,
          runId: firstRunId,
          signal: firstSignal,
          keyPage,
        }),
      );
      expect(firstDecision).toMatchObject({
        relationship: "controller",
        policyVersion: "priority-page-repeat-suppression-v2",
        controllerReleasedAt: null,
      });
      await sql`
        INSERT INTO growth_actions (
          id, project_id, recommendation_id, creation_key, fact_hash, title,
          description, category, priority_score, status, state_version, due_at,
          approved_at, started_at, implemented_at, evaluated_at
        ) VALUES (
          ${`growth_release_action_${suffix}`}, ${projectId},
          ${firstDecision.recommendationId},
          ${`priority-page-investigation-v1:action:${firstSignalId}`},
          ${"f".repeat(64)}, 'Evaluate', 'Done.', 'investigation', 0,
          'evaluated', 1, '2026-09-01T00:00:00.000Z',
          '2026-08-01T00:00:00.000Z', '2026-08-02T00:00:00.000Z',
          '2026-08-27T00:00:00.000Z', '2026-08-28T10:00:00.000Z'
        )
      `;
      const [signalA, signalB] = await Promise.all([
        seedEligiblePriorityPageSignal({
          projectId,
          runId: laterRunA,
          signalId: laterSignalA,
          keyPageId: keyPage.id,
          capturedAt: "2026-08-29T10:00:00.000Z",
          suffix: `release-later-a-${suffix}`,
        }),
        seedEligiblePriorityPageSignal({
          projectId,
          runId: laterRunB,
          signalId: laterSignalB,
          keyPageId: keyPage.id,
          capturedAt: "2026-08-29T10:00:00.000Z",
          suffix: `release-later-b-${suffix}`,
        }),
      ]);
      const record = (runId: string, signal: typeof signalA) =>
        withPgClient(() =>
          GrowthOpportunityDecisionsService.recordPriorityPageInvestigation({
            projectId,
            runId,
            signal,
            keyPage,
          }),
        );
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-09-01T12:00:00.000Z"));
      let results: Awaited<ReturnType<typeof record>>[];
      try {
        results = await Promise.all([
          record(laterRunA, signalA),
          record(laterRunB, signalB),
        ]);
      } finally {
        vi.useRealTimers();
      }
      expect(results.map((result) => result.relationship).toSorted()).toEqual([
        "controller",
        "suppressed",
      ]);
      expect(
        results.every(
          (result) =>
            result.policyVersion === "priority-page-repeat-suppression-v2",
        ),
      ).toBe(true);
      expect(
        new Set(results.map((result) => result.recommendationId)).size,
      ).toBe(1);
      const [retryA, retryB] = await Promise.all([
        record(laterRunA, signalA),
        record(laterRunB, signalB),
      ]);
      expect(retryA).toEqual(results[0]);
      expect(retryB).toEqual(results[1]);

      const decisions = await sql<
        {
          signalId: string;
          recommendationId: string;
          relationship: "controller" | "suppressed";
          policyVersion: string;
          controllerReleasedAt: string | null;
        }[]
      >`
        SELECT signal_id AS "signalId", recommendation_id AS "recommendationId",
          relationship, policy_version AS "policyVersion",
          controller_released_at AS "controllerReleasedAt"
        FROM growth_recommendation_signal_links
        WHERE project_id = ${projectId}
        ORDER BY signal_id COLLATE "C"
      `;
      const oldDecision = decisions.find(
        (decision) => decision.signalId === firstSignalId,
      );
      const laterDecisions = decisions.filter(
        (decision) => decision.signalId !== firstSignalId,
      );
      expect(oldDecision).toMatchObject({
        relationship: "controller",
        policyVersion: "priority-page-repeat-suppression-v2",
        controllerReleasedAt: "2026-09-01T12:00:00.000Z",
      });
      expect(
        laterDecisions.map((decision) => decision.relationship).toSorted(),
      ).toEqual(["controller", "suppressed"]);
      const nextController = laterDecisions.find(
        (decision) => decision.relationship === "controller",
      );
      const suppressed = laterDecisions.find(
        (decision) => decision.relationship === "suppressed",
      );
      expect(nextController).toMatchObject({
        policyVersion: "priority-page-repeat-suppression-v2",
        controllerReleasedAt: null,
      });
      expect(suppressed).toMatchObject({
        recommendationId: nextController?.recommendationId,
        policyVersion: "priority-page-repeat-suppression-v2",
        controllerReleasedAt: null,
      });

      const [counts] = await sql<
        [
          {
            controllers: string;
            active: string;
            suppressed: string;
            insights: string;
            insightSignals: string;
            recommendations: string;
            recommendationInsights: string;
            targets: string;
            steps: string;
            decisions: string;
            orphanGraphs: string;
          },
        ]
      >`
        SELECT
          (SELECT count(*)::text FROM growth_recommendation_signal_links
            WHERE project_id = ${projectId} AND relationship = 'controller') AS controllers,
          (SELECT count(*)::text FROM growth_recommendation_signal_links
            WHERE project_id = ${projectId} AND relationship = 'controller'
              AND controller_released_at IS NULL) AS active,
          (SELECT count(*)::text FROM growth_recommendation_signal_links
            WHERE project_id = ${projectId} AND relationship = 'suppressed') AS suppressed,
          (SELECT count(*)::text FROM growth_insights
            WHERE project_id = ${projectId}) AS insights,
          (SELECT count(*)::text FROM growth_insight_signals
            WHERE project_id = ${projectId}) AS "insightSignals",
          (SELECT count(*)::text FROM growth_recommendations
            WHERE project_id = ${projectId}) AS recommendations,
          (SELECT count(*)::text FROM growth_recommendation_insights
            WHERE project_id = ${projectId}) AS "recommendationInsights",
          (SELECT count(*)::text FROM growth_recommendation_targets
            WHERE project_id = ${projectId}) AS targets,
          (SELECT count(*)::text FROM growth_recommendation_steps
            WHERE project_id = ${projectId}) AS steps,
          (SELECT count(*)::text FROM growth_recommendation_signal_links
            WHERE project_id = ${projectId}) AS decisions,
          ((SELECT count(*) FROM growth_insights insight
            WHERE insight.project_id = ${projectId}
              AND ((SELECT count(*) FROM growth_insight_signals link
                  WHERE link.project_id = insight.project_id
                    AND link.run_id = insight.run_id
                    AND link.insight_id = insight.id) <> 1
                OR (SELECT count(*) FROM growth_recommendation_insights link
                  WHERE link.project_id = insight.project_id
                    AND link.run_id = insight.run_id
                    AND link.insight_id = insight.id) <> 1))
            +
           (SELECT count(*) FROM growth_recommendations recommendation
            WHERE recommendation.project_id = ${projectId}
              AND ((SELECT count(*) FROM growth_recommendation_insights link
                WHERE link.project_id = recommendation.project_id
                  AND link.run_id = recommendation.run_id
                  AND link.recommendation_id = recommendation.id) <> 1
                OR (SELECT count(*) FROM growth_recommendation_targets target
                  WHERE target.project_id = recommendation.project_id
                    AND target.run_id = recommendation.run_id
                    AND target.recommendation_id = recommendation.id) <> 1
                OR (SELECT count(*) FROM growth_recommendation_steps step
                  WHERE step.project_id = recommendation.project_id
                    AND step.run_id = recommendation.run_id
                    AND step.recommendation_id = recommendation.id) <> 3)
           ))::text AS "orphanGraphs"
      `;
      expect(counts).toEqual({
        controllers: "2",
        active: "1",
        suppressed: "1",
        insights: "2",
        insightSignals: "2",
        recommendations: "2",
        recommendationInsights: "2",
        targets: "2",
        steps: "6",
        decisions: "3",
        orphanGraphs: "0",
      });
      const targets = await sql<{ targetValue: string }[]>`
        SELECT target_value AS "targetValue"
        FROM growth_recommendation_targets
        WHERE project_id = ${projectId}
        ORDER BY run_id COLLATE "C"
      `;
      expect(targets).toEqual([
        { targetValue: "https://example.com/pricing" },
        { targetValue: "https://example.com/pricing" },
      ]);
    } finally {
      await sql`DELETE FROM projects WHERE id = ${projectId}`;
      await sql`DELETE FROM organization WHERE id = ${organizationId}`;
    }
  });

  it("compares release timestamps as instants and fails closed on Postgres", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const organizationId = `release_time_org_${suffix}`;
    const projectId = `release_time_project_${suffix}`;
    const scenarios = [
      {
        name: "instant_after_lex_before",
        dedupeKey: "g".repeat(64),
        evaluatedAt: "2026-09-01T10:00:00+02:00",
        capturedAt: "2026-09-01T09:00:00+00:00",
        releases: true,
      },
      {
        name: "instant_before_lex_after",
        dedupeKey: "h".repeat(64),
        evaluatedAt: "2026-09-01T09:00:00+00:00",
        capturedAt: "2026-09-01T10:00:00+02:00",
        releases: false,
      },
      {
        name: "equal_instant",
        dedupeKey: "i".repeat(64),
        evaluatedAt: "2026-09-01T09:00:00+00:00",
        capturedAt: "2026-09-01T11:00:00+02:00",
        releases: false,
      },
      {
        name: "malformed_evaluation",
        dedupeKey: "j".repeat(64),
        evaluatedAt: "not-a-valid-evaluation",
        capturedAt: "2026-09-01T12:00:00+00:00",
        releases: false,
      },
      {
        name: "malformed_capture",
        dedupeKey: "k".repeat(64),
        evaluatedAt: "2026-09-01T09:00:00+00:00",
        capturedAt: "not-a-valid-capture",
        releases: false,
      },
    ];
    await seedProject(projectId, organizationId, suffix);
    try {
      for (const scenario of scenarios) {
        const scenarioSuffix = `${scenario.name}_${suffix}`;
        const controller = await seedPostgresControllerWithAction({
          projectId,
          suffix: scenarioSuffix,
          dedupeKey: scenario.dedupeKey,
          evaluatedAt: scenario.evaluatedAt,
        });
        const outcome = await attemptPostgresControllerRelease({
          projectId,
          suffix: scenarioSuffix,
          dedupeKey: scenario.dedupeKey,
          capturedAt: scenario.capturedAt,
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
    } finally {
      await sql`DELETE FROM projects WHERE id = ${projectId}`;
      await sql`DELETE FROM organization WHERE id = ${organizationId}`;
    }
  });

  it("requires the exact evaluated controller Action on Postgres", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const organizationId = `release_action_org_${suffix}`;
    const projectId = `release_action_project_${suffix}`;
    const scenarios = [
      {
        name: "unrelated_evaluated",
        dedupeKey: "l".repeat(64),
        evaluatedAt: "2026-08-28T10:00:00.000Z",
        exactAction: false,
      },
      {
        name: "exact_measuring",
        dedupeKey: "m".repeat(64),
        evaluatedAt: null,
        actionStatus: "measuring" as const,
      },
    ];
    await seedProject(projectId, organizationId, suffix);
    try {
      for (const scenario of scenarios) {
        const scenarioSuffix = `${scenario.name}_${suffix}`;
        const controller = await seedPostgresControllerWithAction({
          projectId,
          suffix: scenarioSuffix,
          dedupeKey: scenario.dedupeKey,
          evaluatedAt: scenario.evaluatedAt,
          exactAction: scenario.exactAction,
          actionStatus: scenario.actionStatus,
        });
        const outcome = await attemptPostgresControllerRelease({
          projectId,
          suffix: scenarioSuffix,
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
    } finally {
      await sql`DELETE FROM projects WHERE id = ${projectId}`;
      await sql`DELETE FROM organization WHERE id = ${organizationId}`;
    }
  });

  it("never commits a released controller without a successor when its Run terminalizes", async () => {
    const suffix = crypto.randomUUID().replaceAll("-", "");
    const organizationId = `growth_release_lock_org_${suffix}`;
    const projectId = `growth_release_lock_project_${suffix}`;
    const firstRunId = `growth_release_lock_first_run_${suffix}`;
    const firstSignalId = `growth_release_lock_first_signal_${suffix}`;
    const laterRunId = `growth_release_lock_later_run_${suffix}`;
    const laterSignalId = `growth_release_lock_later_signal_${suffix}`;
    const triggerFunction = `growth_release_lock_fn_${suffix}`;
    const triggerName = `growth_release_lock_trigger_${suffix}`;
    const dedupeKey = "8".repeat(64);
    await seedProject(projectId, organizationId, suffix);
    await seedRunAndSignal({
      projectId,
      runId: firstRunId,
      signalId: firstSignalId,
      suffix: `release-lock-first-${suffix}`,
    });
    const first = priorityDecisionCandidate({
      projectId,
      runId: firstRunId,
      signalId: firstSignalId,
      suffix: `release-lock-first-${suffix}`,
      dedupeKey,
    });
    try {
      await withPgClient(() =>
        GrowthOpportunityDecisionsRepository.writeDecision(first),
      );
      await sql`
        INSERT INTO growth_actions (
          id, project_id, recommendation_id, creation_key, fact_hash, title,
          description, category, priority_score, status, state_version, due_at,
          approved_at, started_at, implemented_at, evaluated_at
        ) VALUES (
          ${`growth_release_lock_action_${suffix}`}, ${projectId},
          ${first.recommendation.id},
          ${`priority-page-investigation-v1:action:${firstSignalId}`},
          ${"f".repeat(64)}, 'Evaluate', 'Done.', 'investigation', 0,
          'evaluated', 1, '2026-09-01T00:00:00.000Z',
          '2026-08-01T00:00:00.000Z', '2026-08-02T00:00:00.000Z',
          '2026-08-27T00:00:00.000Z', '2026-08-28T10:00:00.000Z'
        )
      `;
      await seedRunAndSignal({
        projectId,
        runId: laterRunId,
        signalId: laterSignalId,
        suffix: `release-lock-later-${suffix}`,
      });
      await sql.unsafe(`
        CREATE FUNCTION ${triggerFunction}() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          PERFORM pg_advisory_xact_lock(hashtext('${projectId}'));
          PERFORM pg_sleep(0.25);
          RETURN NEW;
        END;
        $$;
        CREATE TRIGGER ${triggerName}
          BEFORE UPDATE OF controller_released_at ON growth_recommendation_signal_links
          FOR EACH ROW EXECUTE FUNCTION ${triggerFunction}();
      `);
      const later = {
        ...priorityDecisionCandidate({
          projectId,
          runId: laterRunId,
          signalId: laterSignalId,
          suffix: `release-lock-cycle-${suffix}`,
          dedupeKey,
        }),
        releaseController: {
          recommendationId: first.recommendation.id,
          signalRunId: firstRunId,
          signalId: firstSignalId,
        },
      };
      const decision = withPgClient(() =>
        GrowthOpportunityDecisionsRepository.writeDecision(later),
      );
      let releaseWindowHeld = false;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const [lock] = await sql<[{ held: boolean }]>`
          SELECT NOT pg_try_advisory_xact_lock(hashtext(${projectId})) AS held
        `;
        if (lock?.held) {
          releaseWindowHeld = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      const terminal = sql`
        UPDATE growth_runs SET status = 'completed', completed_at = now()::text
        WHERE project_id = ${projectId} AND id = ${laterRunId} AND status = 'running'
      `;
      await Promise.all([decision, terminal]);
      expect(releaseWindowHeld).toBe(true);
      const [state] = await sql<
        [{ released: string; successor: string; graphs: string }]
      >`
        SELECT
          (SELECT count(*)::text FROM growth_recommendation_signal_links
            WHERE project_id = ${projectId} AND recommendation_id = ${first.recommendation.id}
              AND controller_released_at IS NOT NULL) AS released,
          (SELECT count(*)::text FROM growth_recommendation_signal_links
            WHERE project_id = ${projectId} AND signal_run_id = ${laterRunId}
              AND signal_id = ${laterSignalId}) AS successor,
          (SELECT count(*)::text FROM growth_recommendations
            WHERE project_id = ${projectId}) AS graphs
      `;
      expect(
        state.released === "0" ||
          (state.successor === "1" && state.graphs === "2"),
      ).toBe(true);
    } finally {
      await sql.unsafe(
        `DROP TRIGGER IF EXISTS ${triggerName} ON growth_recommendation_signal_links; DROP FUNCTION IF EXISTS ${triggerFunction}();`,
      );
      await sql`DELETE FROM projects WHERE id = ${projectId}`;
      await sql`DELETE FROM organization WHERE id = ${organizationId}`;
    }
  }, 15_000);
});
