/* eslint-disable max-lines -- exhaustive live-provider acceptance is easier to audit as one sequential fixture */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { withPgClient as withPgClientExport } from "@/db";
import type { GrowthInsightsRepository as RepositoryExport } from "./GrowthInsightsRepository";

const testUrl = process.env.TEST_POSTGRES_DATABASE_URL;

vi.mock("cloudflare:workers", () => ({
  env: {
    DATABASE_PROVIDER: "postgres",
    HYPERDRIVE: { connectionString: testUrl },
  },
}));

type Repository = typeof RepositoryExport;
type WithPgClient = typeof withPgClientExport;

let sql: ReturnType<typeof postgres>;
let GrowthInsightsRepository: Repository;
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

describePostgres("GrowthInsightsRepository Postgres", () => {
  beforeAll(async () => {
    // TEST_POSTGRES_DATABASE_URL explicitly opts into a disposable migrated
    // OpenSEO database. This test never creates, drops, or migrates databases.
    sql = postgres(testUrl!, { max: 5 });
    ({ GrowthInsightsRepository } = await import("./GrowthInsightsRepository"));
    ({ withPgClient } = await import("@/db"));
  });

  afterAll(async () => {
    if (testUrl) await sql.end({ timeout: 5 });
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
});
