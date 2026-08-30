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

  it("keeps concurrent exact and changed transition retries on one event", async () => {
    const suffix = crypto.randomUUID();
    const organizationId = `growth_transition_org_${suffix}`;
    const projectId = `growth_transition_project_${suffix}`;
    const runId = `growth_transition_run_${suffix}`;
    const recommendationId = `growth_transition_recommendation_${suffix}`;
    const actionId = `growth_transition_action_${suffix}`;

    const transition = {
      projectId,
      actionId,
      expectedStatus: "approved" as const,
      expectedVersion: 0,
      status: "ready" as const,
      eventFactHash: "7".repeat(64),
      actorType: "system" as const,
      actorId: "growth-system",
      note: "Queued for delivery",
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
      await withPgClient(() =>
        GrowthActionsRepository.transitionAction({
          ...transition,
          eventId: `growth_transition_ready_${suffix}`,
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
          GrowthActionsRepository.getActionEvent(projectId, actionId, 1),
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
          GrowthActionsRepository.listActionEvents("foreign-project", actionId),
        ),
      ]);
      expect(action).toMatchObject({ status: "ready", stateVersion: 1 });
      expect(event).toMatchObject({
        id: `growth_transition_ready_${suffix}`,
        actionVersion: 1,
        factHash: "7".repeat(64),
        actorId: "growth-system",
        note: "Queued for delivery",
      });
      expect(events.map(({ actionVersion }) => actionVersion)).toEqual([0, 1]);
      expect(recentEvents.map(({ actionVersion }) => actionVersion)).toEqual([
        1, 0,
      ]);
      expect(recentEvents[0]).not.toHaveProperty("actorId");
      expect(foreignRecentEvents).toEqual([]);
      expect(missingRecentEvents).toEqual([]);
      expect(foreignEvents).toEqual([]);
    } finally {
      await sql`DELETE FROM projects WHERE id = ${projectId}`;
      await sql`DELETE FROM organization WHERE id = ${organizationId}`;
    }
  }, 15_000);
});
