/* eslint-disable max-lines -- live-provider concurrency acceptance is clearer as one self-contained fixture */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { withPgClient as withPgClientExport } from "@/db";
import type { GrowthActionsRepository as RepositoryExport } from "./GrowthActionsRepository";

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
let GrowthActionsRepository: Repository;
let withPgClient: WithPgClient;

const describePostgres = testUrl ? describe : describe.skip;

async function seedProject(
  projectId: string,
  organizationId: string,
  suffix: string,
) {
  await sql`
    INSERT INTO organization (id, name, slug, created_at)
    VALUES (${organizationId}, 'Growth Actions test', ${`growth-actions-${suffix}`}, now())
  `;
  await sql`
    INSERT INTO projects (id, organization_id, name, domain)
    VALUES (${projectId}, ${organizationId}, 'Growth Actions test', 'example.com')
  `;
}

async function seedAcceptedRecommendation(input: {
  projectId: string;
  runId: string;
  recommendationId: string;
  suffix: string;
}) {
  await sql`
    INSERT INTO growth_runs (
      id, project_id, run_type, trigger, status, cadence_slot, period_start,
      period_end, started_at, completed_at, detector_version
    ) VALUES (
      ${input.runId}, ${input.projectId}, 'manual_analysis', 'manual',
      'completed', ${`actions-${input.suffix}`}, '2026-08-01', '2026-08-29',
      '2026-08-29T10:00:00.000Z', '2026-08-29T10:01:00.000Z', 'v1'
    )
  `;
  await sql`
    INSERT INTO growth_recommendations (
      id, project_id, run_id, creation_key, fact_hash, title, rationale,
      category, impact, commercial_relevance, effort, urgency, confidence,
      priority_score, status, review_version
    ) VALUES (
      ${input.recommendationId}, ${input.projectId}, ${input.runId},
      ${`source-${input.suffix}`}, ${"a".repeat(64)},
      'Repair pricing visibility', 'The page has measurable demand.',
      'content', 5, 5, 2, 3, 0.8, 10, 'accepted', 1
    )
  `;
  await sql`
    INSERT INTO growth_recommendation_targets (
      project_id, run_id, recommendation_id, target_type, target_value
    ) VALUES
      (${input.projectId}, ${input.runId}, ${input.recommendationId}, 'url',
        'https://example.com/pricing'),
      (${input.projectId}, ${input.runId}, ${input.recommendationId}, 'keyword',
        'pricing software')
  `;
}

async function verifyAlignedLowCtrWork() {
  const suffix = crypto.randomUUID();
  const organizationId = `growth_low_ctr_org_${suffix}`;
  const projectId = `growth_low_ctr_project_${suffix}`;
  const runId = `growth_low_ctr_run_${suffix}`;
  const ctrId = `growth_low_ctr_signal_ctr_${suffix}`;
  const clicksId = `growth_low_ctr_signal_clicks_${suffix}`;
  const impressionsId = `growth_low_ctr_signal_impressions_${suffix}`;
  const positionId = `growth_low_ctr_signal_position_${suffix}`;
  const insightId = `growth_low_ctr_insight_${suffix}`;
  const recommendationId = `growth_low_ctr_recommendation_${suffix}`;
  const actionId = `growth_low_ctr_action_${suffix}`;
  const evidenceRef = `gsc_low_ctr_v1:${suffix}`;

  try {
    await seedProject(projectId, organizationId, `low-ctr-${suffix}`);
    await sql`
      INSERT INTO growth_runs (
        id, project_id, run_type, trigger, status, cadence_slot,
        period_start, period_end, started_at, completed_at,
        detector_version, analysis_version
      ) VALUES (
        ${runId}, ${projectId}, 'manual_analysis', 'manual', 'completed',
        ${`low-ctr-check:${suffix}`}, '2026-07-07', '2026-08-31',
        '2026-09-01T10:00:00.000Z', '2026-09-01T10:01:00.000Z',
        'high-impression-low-ctr-v1',
        'high-impression-low-ctr-investigation-v1'
      )
    `;
    await sql`
      INSERT INTO growth_signals (
        id, project_id, run_id, signal_type, entity_type, entity_ref,
        metric, severity, confidence, period_start, period_end,
        baseline_value, current_value, delta_value, evidence_kind,
        evidence_ref, captured_at
      ) VALUES
        (${ctrId}, ${projectId}, ${runId}, 'ctr_below_expected',
          'search_query', 'pricing software', 'gsc_ctr', 'warning', .8,
          '2026-08-04', '2026-08-31', .125, .0625, -.0625,
          'gsc_period', ${evidenceRef}, '2026-09-01T10:00:00.000Z'),
        (${clicksId}, ${projectId}, ${runId}, 'ctr_below_expected',
          'search_query', 'pricing software', 'gsc_clicks', 'warning', .8,
          '2026-08-04', '2026-08-31', 100, 50, -50,
          'gsc_period', ${evidenceRef}, '2026-09-01T10:00:00.000Z'),
        (${impressionsId}, ${projectId}, ${runId}, 'ctr_below_expected',
          'search_query', 'pricing software', 'gsc_impressions', 'warning',
          .8, '2026-08-04', '2026-08-31', 800, 800, 0,
          'gsc_period', ${evidenceRef}, '2026-09-01T10:00:00.000Z'),
        (${positionId}, ${projectId}, ${runId}, 'ctr_below_expected',
          'search_query', 'pricing software', 'gsc_average_position',
          'warning', .8, '2026-08-04', '2026-08-31', 4, 3.5, -.5,
          'gsc_period', ${evidenceRef}, '2026-09-01T10:00:00.000Z')
    `;
    await sql`
      INSERT INTO growth_insights (
        id, project_id, run_id, creation_key, fact_hash, title,
        explanation, hypothesis, confidence
      ) VALUES (
        ${insightId}, ${projectId}, ${runId},
        ${`high-impression-low-ctr-investigation-v1:insight:${ctrId}`},
        ${"4".repeat(64)}, 'Observed CTR decline', 'Observed facts.',
        'Unknown cause.', 0
      )
    `;
    await sql`
      INSERT INTO growth_insight_signals (
        project_id, run_id, insight_id, signal_id
      ) VALUES
        (${projectId}, ${runId}, ${insightId}, ${ctrId}),
        (${projectId}, ${runId}, ${insightId}, ${clicksId}),
        (${projectId}, ${runId}, ${insightId}, ${impressionsId}),
        (${projectId}, ${runId}, ${insightId}, ${positionId})
    `;
    await sql`
      INSERT INTO growth_recommendations (
        id, project_id, run_id, creation_key, fact_hash, title, rationale,
        category, impact, commercial_relevance, effort, urgency, confidence,
        priority_score, status, review_version
      ) VALUES (
        ${recommendationId}, ${projectId}, ${runId},
        ${`high-impression-low-ctr-investigation-v1:recommendation:${ctrId}`},
        ${"5".repeat(64)}, 'Investigate CTR decline', 'Cause unknown.',
        'investigation', 1, 1, 1, 1, 0, 0, 'accepted', 1
      )
    `;
    await sql`
      INSERT INTO growth_recommendation_insights (
        project_id, run_id, recommendation_id, insight_id
      ) VALUES (${projectId}, ${runId}, ${recommendationId}, ${insightId})
    `;
    await sql`
      INSERT INTO growth_actions (
        id, project_id, recommendation_id, creation_key, fact_hash, title,
        description, category, priority_score, status, state_version,
        due_at, approved_at, created_at, updated_at
      ) VALUES (
        ${actionId}, ${projectId}, ${recommendationId},
        ${`high-impression-low-ctr-investigation-v1:action:${ctrId}`},
        ${"6".repeat(64)}, 'Investigate CTR decline', 'Cause unknown.',
        'investigation', 0, 'approved', 0, '2026-09-10T00:00:00.000Z',
        '2026-09-01T10:02:00.000Z', '2026-09-01T10:02:00.000Z',
        '2026-09-01T10:02:00.000Z'
      )
    `;

    await expect(
      withPgClient(() =>
        GrowthActionsRepository.listInvestigationWork(projectId, 1, actionId),
      ),
    ).resolves.toEqual([expect.objectContaining({ id: actionId, runId })]);

    await sql`
      UPDATE growth_signals
      SET evidence_ref = ${`${evidenceRef}:drift`}
      WHERE project_id = ${projectId} AND id = ${positionId}
    `;
    await expect(
      withPgClient(() =>
        GrowthActionsRepository.listInvestigationWork(projectId, 1, actionId),
      ),
    ).resolves.toEqual([]);
  } finally {
    await sql`DELETE FROM projects WHERE id = ${projectId}`;
    await sql`DELETE FROM organization WHERE id = ${organizationId}`;
  }
}

describePostgres("GrowthActionsRepository Postgres", () => {
  beforeAll(async () => {
    // TEST_POSTGRES_DATABASE_URL explicitly opts into a disposable migrated
    // OpenSEO database. This test never creates, drops, or migrates databases.
    sql = postgres(testUrl!, { max: 8 });
    ({ GrowthActionsRepository } = await import("./GrowthActionsRepository"));
    ({ withPgClient } = await import("@/db"));
  });

  afterAll(async () => {
    if (testUrl) await sql.end({ timeout: 5 });
  });

  it("keeps concurrent creation drift out of the winning aggregate", async () => {
    const [tables] = await sql<
      [
        {
          actions: string | null;
          targets: string | null;
          events: string | null;
        },
      ]
    >`
      SELECT to_regclass('public.growth_actions') AS actions,
             to_regclass('public.growth_action_targets') AS targets,
             to_regclass('public.growth_action_events') AS events
    `;
    expect(tables).toEqual({
      actions: "growth_actions",
      targets: "growth_action_targets",
      events: "growth_action_events",
    });

    const suffix = crypto.randomUUID();
    const organizationId = `growth_actions_org_${suffix}`;
    const projectId = `growth_actions_project_${suffix}`;
    const runId = `growth_actions_run_${suffix}`;
    const recommendationId = `growth_actions_recommendation_${suffix}`;
    const creationKey = `repair-pricing-${suffix}`;

    const writes = [
      {
        id: `growth_actions_a_${suffix}`,
        factHash: "b".repeat(64),
        title: "Winner A",
        eventId: `growth_actions_event_a_${suffix}`,
        eventFactHash: "c".repeat(64),
        target: {
          targetType: "url" as const,
          targetValue: "https://example.com/pricing",
        },
      },
      {
        id: `growth_actions_b_${suffix}`,
        factHash: "d".repeat(64),
        title: "Winner B",
        eventId: `growth_actions_event_b_${suffix}`,
        eventFactHash: "e".repeat(64),
        target: {
          targetType: "keyword" as const,
          targetValue: "pricing software",
        },
      },
    ] as const;

    try {
      await seedProject(projectId, organizationId, suffix);
      await seedAcceptedRecommendation({
        projectId,
        runId,
        recommendationId,
        suffix,
      });
      await Promise.all(
        writes.map((write) =>
          withPgClient(() =>
            GrowthActionsRepository.createActionGraph({
              id: write.id,
              projectId,
              runId,
              recommendationId,
              creationKey,
              factHash: write.factHash,
              title: write.title,
              description: "Deliver the accepted recommendation.",
              dueAt: "2026-09-30T12:00:00.000Z",
              category: "content",
              priorityScore: 10,
              targets: [write.target],
              eventId: write.eventId,
              eventFactHash: write.eventFactHash,
              actorType: "agent",
              actorId: "growth-agent",
              note: null,
            }),
          ),
        ),
      );

      const winner = await withPgClient(() =>
        GrowthActionsRepository.getActionByKey(projectId, creationKey),
      );
      expect(winner).toBeDefined();
      if (!winner) throw new Error("Concurrent Action creation had no winner");
      const expected = writes.find(
        (write) => write.factHash === winner.factHash,
      );
      expect(expected).toBeDefined();
      if (!expected)
        throw new Error(
          "Concurrent Action winner had an unknown immutable fact",
        );

      const graph = await withPgClient(() =>
        GrowthActionsRepository.getActionGraph(projectId, winner.id),
      );
      expect(graph?.action).toMatchObject({
        id: expected.id,
        projectId,
        recommendationId,
        title: expected.title,
        factHash: expected.factHash,
        status: "approved",
        stateVersion: 0,
      });
      expect(graph?.targets).toEqual([expected.target]);
      expect(graph?.events).toHaveLength(1);
      expect(graph?.creationEvent).toMatchObject({
        id: expected.eventId,
        factHash: expected.eventFactHash,
        actionVersion: 0,
        eventType: "created",
      });
    } finally {
      await sql`DELETE FROM projects WHERE id = ${projectId}`;
      await sql`DELETE FROM organization WHERE id = ${organizationId}`;
    }
  }, 15_000);

  it.each(["approved", "ready"] as const)(
    "keeps direct %s completion and exact retries on one event",
    async (expectedStatus) => {
      const suffix = crypto.randomUUID();
      const organizationId = `growth_transition_org_${suffix}`;
      const projectId = `growth_transition_project_${suffix}`;
      const runId = `growth_transition_run_${suffix}`;
      const recommendationId = `growth_transition_recommendation_${suffix}`;
      const actionId = `growth_transition_action_${suffix}`;
      const expectedVersion = expectedStatus === "approved" ? 0 : 1;
      const doneVersion = expectedVersion + 1;

      const transition = {
        projectId,
        actionId,
        expectedStatus,
        expectedVersion,
        status: "implemented" as const,
        eventFactHash: "7".repeat(64),
        actorType: "system" as const,
        actorId: "growth-system",
        note: "Finished investigation work",
      };

      try {
        await seedProject(projectId, organizationId, `transition-${suffix}`);
        await seedAcceptedRecommendation({
          projectId,
          runId,
          recommendationId,
          suffix: `transition-${suffix}`,
        });
        await withPgClient(() =>
          GrowthActionsRepository.createActionGraph({
            id: actionId,
            projectId,
            runId,
            recommendationId,
            creationKey: `transition-${suffix}`,
            factHash: "6".repeat(64),
            title: "Transition test",
            description: "Verify projection and event atomicity.",
            dueAt: "2026-09-30T12:00:00.000Z",
            category: "content",
            priorityScore: 10,
            targets: [
              {
                targetType: "url",
                targetValue: "https://example.com/pricing",
              },
            ],
            eventId: `growth_transition_created_${suffix}`,
            eventFactHash: "5".repeat(64),
            actorType: "system",
            actorId: "growth-system",
            note: null,
          }),
        );
        if (expectedStatus === "ready") {
          await withPgClient(() =>
            GrowthActionsRepository.transitionAction({
              ...transition,
              expectedStatus: "approved",
              expectedVersion: 0,
              status: "ready",
              eventId: `growth_transition_ready_${suffix}`,
              eventFactHash: "4".repeat(64),
            }),
          );
        }
        await withPgClient(() =>
          GrowthActionsRepository.transitionAction({
            ...transition,
            eventId: `growth_transition_done_${suffix}`,
          }),
        );
        await Promise.all([
          withPgClient(() =>
            GrowthActionsRepository.transitionAction({
              ...transition,
              eventId: `growth_transition_exact_retry_${suffix}`,
            }),
          ),
          withPgClient(() =>
            GrowthActionsRepository.transitionAction({
              ...transition,
              eventId: `growth_transition_drift_${suffix}`,
              eventFactHash: "8".repeat(64),
              actorId: "other-system",
              note: "Changed retry metadata",
            }),
          ),
        ]);

        const [
          action,
          event,
          events,
          recentEvents,
          foreignRecentEvents,
          missingRecentEvents,
          foreignEvents,
        ] = await Promise.all([
          withPgClient(() =>
            GrowthActionsRepository.getAction(projectId, actionId),
          ),
          withPgClient(() =>
            GrowthActionsRepository.getActionEvent(
              projectId,
              actionId,
              doneVersion,
            ),
          ),
          withPgClient(() =>
            GrowthActionsRepository.listActionEvents(projectId, actionId),
          ),
          withPgClient(() =>
            GrowthActionsRepository.listRecentActionEvents(projectId, actionId),
          ),
          withPgClient(() =>
            GrowthActionsRepository.listRecentActionEvents(
              "foreign-project",
              actionId,
            ),
          ),
          withPgClient(() =>
            GrowthActionsRepository.listRecentActionEvents(
              projectId,
              "missing-action",
            ),
          ),
          withPgClient(() =>
            GrowthActionsRepository.listActionEvents(
              "foreign-project",
              actionId,
            ),
          ),
        ]);
        expect(action).toMatchObject({
          status: "implemented",
          stateVersion: doneVersion,
          startedAt: null,
        });
        expect(action?.implementedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(event).toMatchObject({
          id: `growth_transition_done_${suffix}`,
          actionVersion: doneVersion,
          fromStatus: expectedStatus,
          toStatus: "implemented",
          factHash: "7".repeat(64),
          actorId: "growth-system",
          note: "Finished investigation work",
        });
        const versions = Array.from(
          { length: doneVersion + 1 },
          (_, index) => index,
        );
        expect(events.map(({ actionVersion }) => actionVersion)).toEqual(
          versions,
        );
        expect(recentEvents.map(({ actionVersion }) => actionVersion)).toEqual(
          versions.toReversed(),
        );
        expect(recentEvents[0]).not.toHaveProperty("actorId");
        expect(foreignRecentEvents).toEqual([]);
        expect(missingRecentEvents).toEqual([]);
        expect(foreignEvents).toEqual([]);
      } finally {
        await sql`DELETE FROM projects WHERE id = ${projectId}`;
        await sql`DELETE FROM organization WHERE id = ${organizationId}`;
      }
    },
    15_000,
  );

  it(
    "qualifies aligned low-CTR Work and rejects evidence drift",
    verifyAlignedLowCtrWork,
    15_000,
  );
});
