/* eslint-disable max-lines -- live-provider concurrency and cascade acceptance is clearer as one self-contained fixture */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { withPgClient as withPgClientExport } from "@/db";
import type { GrowthChangeEventsRepository as RepositoryExport } from "./GrowthChangeEventsRepository";

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
let GrowthChangeEventsRepository: Repository;
let withPgClient: WithPgClient;

const describePostgres = testUrl ? describe : describe.skip;
const happenedAt = "2026-08-29T10:30:00.000Z";

async function seedProject(
  projectId: string,
  organizationId: string,
  suffix: string,
) {
  await sql`
    INSERT INTO organization (id, name, slug, created_at)
    VALUES (${organizationId}, 'Growth Change test', ${`growth-change-${suffix}`}, now())
  `;
  await sql`
    INSERT INTO projects (id, organization_id, name, domain)
    VALUES (${projectId}, ${organizationId}, 'Growth Change test', 'example.com')
  `;
}

async function seedAction(input: {
  projectId: string;
  runId: string;
  recommendationId: string;
  actionId: string;
  suffix: string;
}) {
  await sql`
    INSERT INTO growth_runs (
      id, project_id, run_type, trigger, status, cadence_slot, period_start,
      period_end, started_at, completed_at, detector_version
    ) VALUES (
      ${input.runId}, ${input.projectId}, 'manual_analysis', 'manual',
      'completed', ${`change-${input.suffix}`}, '2026-08-01', '2026-08-29',
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
      ${`recommendation-${input.suffix}`}, ${"a".repeat(64)},
      'Ship the planned change', 'The page has measurable demand.',
      'content', 5, 5, 2, 3, 0.8, 10, 'accepted', 1
    )
  `;
  await sql`
    INSERT INTO growth_actions (
      id, project_id, recommendation_id, creation_key, fact_hash, title,
      description, category, priority_score, status, state_version, due_at,
      approved_at
    ) VALUES (
      ${input.actionId}, ${input.projectId}, ${input.recommendationId},
      ${`action-${input.suffix}`}, ${"b".repeat(64)}, 'Ship the change',
      'Implement the approved website change.', 'content', 10, 'approved', 0,
      '2026-09-30T12:00:00.000Z', '2026-08-29T10:05:00.000Z'
    )
  `;
  await sql`
    INSERT INTO growth_action_events (
      id, project_id, action_id, action_version, fact_hash, event_type,
      actor_type, actor_id, from_status, to_status, note
    ) VALUES (
      ${`action-event-${input.suffix}`}, ${input.projectId}, ${input.actionId},
      0, ${"c".repeat(64)}, 'created', 'system', 'growth-test', NULL,
      'approved', NULL
    )
  `;
}

describePostgres("GrowthChangeEventsRepository Postgres", () => {
  beforeAll(async () => {
    // TEST_POSTGRES_DATABASE_URL explicitly opts into a disposable migrated
    // OpenSEO database. This test never creates, drops, or migrates databases.
    sql = postgres(testUrl!, { max: 8 });
    ({ GrowthChangeEventsRepository } =
      await import("./GrowthChangeEventsRepository"));
    ({ withPgClient } = await import("@/db"));
  });

  afterAll(async () => {
    if (testUrl) await sql.end({ timeout: 5 });
  });

  it("keeps concurrent exact and drifting same-key writes on one complete fact", async () => {
    const [tables] = await sql<
      [
        {
          events: string | null;
          urls: string | null;
          links: string | null;
        },
      ]
    >`
      SELECT to_regclass('public.growth_change_events') AS events,
             to_regclass('public.growth_change_event_urls') AS urls,
             to_regclass('public.growth_action_changes') AS links
    `;
    expect(tables).toEqual({
      events: "growth_change_events",
      urls: "growth_change_event_urls",
      links: "growth_action_changes",
    });

    const suffix = crypto.randomUUID();
    const organizationId = `growth_change_org_${suffix}`;
    const projectId = `growth_change_project_${suffix}`;
    const creationKey = `pricing-change-${suffix}`;
    const facts = [
      {
        factHash: "d".repeat(64),
        changeType: "content_updated" as const,
        actorId: "agent-a",
        description: "Published the revised pricing copy.",
        externalRef: "deploy-100",
        urls: [
          "https://example.com/docs/pricing",
          "https://example.com/pricing",
        ],
      },
      {
        factHash: "e".repeat(64),
        changeType: "title_meta_updated" as const,
        actorId: "agent-b",
        description: "Changed only the pricing page metadata.",
        externalRef: "deploy-101",
        urls: ["https://example.com/pricing-drift"],
      },
    ] as const;

    try {
      await seedProject(projectId, organizationId, suffix);
      const writes = [facts[0], facts[0], facts[1]];
      await Promise.all(
        writes.map((fact, index) =>
          withPgClient(() =>
            GrowthChangeEventsRepository.createChangeEventGraph({
              id: `growth_change_event_${index}_${suffix}`,
              projectId,
              creationKey,
              source: "manual",
              actorType: "agent",
              happenedAt,
              expectedDomain: "example.com",
              ...fact,
              urls: [...fact.urls],
            }),
          ),
        ),
      );

      const winner = await withPgClient(() =>
        GrowthChangeEventsRepository.getChangeEventByKey(
          projectId,
          creationKey,
        ),
      );
      expect(winner).toBeDefined();
      if (!winner)
        throw new Error("Concurrent Change Event creation had no winner");
      const expected = facts.find((fact) => fact.factHash === winner.factHash);
      expect(expected).toBeDefined();
      if (!expected)
        throw new Error("Change Event winner had an unknown immutable fact");

      const graph = await withPgClient(() =>
        GrowthChangeEventsRepository.getChangeEventGraph(projectId, winner.id),
      );
      expect(graph?.event).toMatchObject({
        projectId,
        creationKey,
        factHash: expected.factHash,
        source: "manual",
        changeType: expected.changeType,
        actorType: "agent",
        actorId: expected.actorId,
        description: expected.description,
        happenedAt,
        externalRef: expected.externalRef,
      });
      expect(graph?.urls).toEqual(
        expected.urls.toSorted((left, right) => left.localeCompare(right)),
      );
      expect(graph?.actionIds).toEqual([]);

      await withPgClient(() =>
        GrowthChangeEventsRepository.createChangeEventGraph({
          id: `growth_change_event_delayed_retry_${suffix}`,
          projectId,
          creationKey,
          source: "manual",
          actorType: "agent",
          happenedAt,
          expectedDomain: "example.com",
          ...expected,
          urls: [...expected.urls],
        }),
      );
      const retained = await withPgClient(() =>
        GrowthChangeEventsRepository.getChangeEventGraph(projectId, winner.id),
      );
      expect(retained?.event.id).toBe(winner.id);
      expect(retained?.urls).toEqual(
        expected.urls.toSorted((left, right) => left.localeCompare(right)),
      );
      expect(
        await withPgClient(() =>
          GrowthChangeEventsRepository.getChangeEventGraph(
            "foreign-project",
            winner.id,
          ),
        ),
      ).toBeNull();
    } finally {
      await sql`DELETE FROM projects WHERE id = ${projectId}`;
      await sql`DELETE FROM organization WHERE id = ${organizationId}`;
    }
  }, 15_000);

  it("links without mutating Actions and preserves Events across run deletion", async () => {
    const suffix = crypto.randomUUID();
    const organizationId = `growth_change_links_org_${suffix}`;
    const projectId = `growth_change_links_project_${suffix}`;
    const runA = `growth_change_run_a_${suffix}`;
    const runB = `growth_change_run_b_${suffix}`;
    const actionA = `growth_change_action_a_${suffix}`;
    const actionB = `growth_change_action_b_${suffix}`;
    const changeEventId = `growth_change_link_event_${suffix}`;

    try {
      await seedProject(projectId, organizationId, `links-${suffix}`);
      await seedAction({
        projectId,
        runId: runA,
        recommendationId: `growth_change_recommendation_a_${suffix}`,
        actionId: actionA,
        suffix: `a-${suffix}`,
      });
      await seedAction({
        projectId,
        runId: runB,
        recommendationId: `growth_change_recommendation_b_${suffix}`,
        actionId: actionB,
        suffix: `b-${suffix}`,
      });
      await withPgClient(() =>
        GrowthChangeEventsRepository.createChangeEventGraph({
          id: changeEventId,
          projectId,
          creationKey: `linked-event-${suffix}`,
          factHash: "f".repeat(64),
          source: "manual",
          changeType: "technical_fix",
          actorType: "user",
          actorId: "user-1",
          description: "Fixed canonical tags across the pricing templates.",
          happenedAt,
          externalRef: null,
          urls: ["https://example.com/pricing"],
          expectedDomain: "example.com",
        }),
      );

      await Promise.all([
        withPgClient(() =>
          GrowthChangeEventsRepository.linkActionChange({
            projectId,
            changeEventId,
            actionId: actionA,
          }),
        ),
        withPgClient(() =>
          GrowthChangeEventsRepository.linkActionChange({
            projectId,
            changeEventId,
            actionId: actionA,
          }),
        ),
        withPgClient(() =>
          GrowthChangeEventsRepository.linkActionChange({
            projectId,
            changeEventId,
            actionId: actionB,
          }),
        ),
      ]);
      expect(
        (
          await withPgClient(() =>
            GrowthChangeEventsRepository.getChangeEventGraph(
              projectId,
              changeEventId,
            ),
          )
        )?.actionIds,
      ).toEqual([actionA, actionB].toSorted());

      const [actionRowsBefore, actionEventsBefore] = await Promise.all([
        sql`SELECT id, status, state_version FROM growth_actions
            WHERE project_id = ${projectId} ORDER BY id`,
        sql`SELECT action_id, action_version FROM growth_action_events
            WHERE project_id = ${projectId} ORDER BY action_id`,
      ]);
      expect(actionRowsBefore).toHaveLength(2);
      expect(actionEventsBefore).toHaveLength(2);

      await sql`DELETE FROM growth_runs
                WHERE project_id = ${projectId} AND id = ${runA}`;
      const afterRunDeletion = await withPgClient(() =>
        GrowthChangeEventsRepository.getChangeEventGraph(
          projectId,
          changeEventId,
        ),
      );
      expect(afterRunDeletion?.urls).toEqual(["https://example.com/pricing"]);
      expect(afterRunDeletion?.actionIds).toEqual([actionB]);
      expect(
        await withPgClient(() =>
          GrowthChangeEventsRepository.getAction(projectId, actionB),
        ),
      ).toMatchObject({ status: "approved", stateVersion: 0 });

      await sql`DELETE FROM growth_change_events
                WHERE project_id = ${projectId} AND id = ${changeEventId}`;
      const [{ action_count: actionCount }] = await sql<
        [{ action_count: string }]
      >`
        SELECT count(*)::text AS action_count FROM growth_actions
        WHERE project_id = ${projectId} AND id = ${actionB}
      `;
      expect(actionCount).toBe("1");
      expect(
        await withPgClient(() =>
          GrowthChangeEventsRepository.getActionChange(
            projectId,
            changeEventId,
            actionB,
          ),
        ),
      ).toBeNull();

      await withPgClient(() =>
        GrowthChangeEventsRepository.createChangeEventGraph({
          id: `${changeEventId}-project-cascade`,
          projectId,
          creationKey: `project-cascade-${suffix}`,
          factHash: "1".repeat(64),
          source: "manual",
          changeType: "migration",
          actorType: "system",
          actorId: "growth-system",
          description: "Recorded before deleting the project fixture.",
          happenedAt,
          externalRef: null,
          urls: ["https://example.com/"],
          expectedDomain: "example.com",
        }),
      );
      await sql`DELETE FROM projects WHERE id = ${projectId}`;
      const [counts] = await sql<
        [
          {
            events: string;
            urls: string;
            links: string;
          },
        ]
      >`
        SELECT
          (SELECT count(*)::text FROM growth_change_events WHERE project_id = ${projectId}) AS events,
          (SELECT count(*)::text FROM growth_change_event_urls WHERE project_id = ${projectId}) AS urls,
          (SELECT count(*)::text FROM growth_action_changes WHERE project_id = ${projectId}) AS links
      `;
      expect(counts).toEqual({ events: "0", urls: "0", links: "0" });
    } finally {
      await sql`DELETE FROM projects WHERE id = ${projectId}`;
      await sql`DELETE FROM organization WHERE id = ${organizationId}`;
    }
  }, 15_000);
});
