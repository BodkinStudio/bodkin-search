/* eslint-disable max-lines -- the full aggregate and ledger acceptance fixture is easier to audit sequentially */
import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type * as RepositoryModule from "./GrowthActionsRepository";

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));

let client: Client;
let GrowthActionsRepository: typeof RepositoryModule.GrowthActionsRepository;

const actionInput = {
  id: "action_1",
  projectId: "project_1",
  runId: "run_1",
  recommendationId: "recommendation_1",
  creationKey: "repair-pricing",
  factHash: "a".repeat(64),
  title: "Repair pricing visibility",
  description: "Restore the page's commercial search demand.",
  dueAt: "2026-09-30T12:00:00.000Z",
  category: "content",
  priorityScore: 10,
  targets: [
    {
      targetType: "url" as const,
      targetValue: "https://example.com/pricing",
    },
  ],
  eventId: "event_0",
  eventFactHash: "b".repeat(64),
  actorType: "user" as const,
  actorId: "user_1",
  note: "Approved for delivery",
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
      // libSQL batch is atomic and accepts the same SQLite builders as D1.
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
      "CREATE TABLE projects (id text PRIMARY KEY, domain text, archived_at text);",
      'CREATE TABLE "user" (id text PRIMARY KEY);',
      "INSERT INTO projects (id, domain) VALUES ('project_1', 'example.com'), ('project_2', 'other.example');",
      "INSERT INTO user (id) VALUES ('user_1');",
      readFileSync("drizzle/0044_glossy_komodo.sql", "utf8"),
      readFileSync("drizzle/0045_mean_retro_girl.sql", "utf8"),
      readFileSync("drizzle/0046_living_misty_knight.sql", "utf8"),
      `INSERT INTO growth_runs (
        id, project_id, run_type, trigger, status, cadence_slot, period_start,
        period_end, started_at, completed_at, detector_version
      ) VALUES
        ('run_1', 'project_1', 'manual_analysis', 'manual', 'completed',
          'slot_1', '2026-08-01', '2026-08-29',
          '2026-08-29T10:00:00.000Z', '2026-08-29T10:01:00.000Z', 'v1');`,
      `INSERT INTO growth_runs (
        id, project_id, run_type, trigger, status, cadence_slot, period_start,
        period_end, started_at, completed_at, detector_version
      ) VALUES
        ('run_2', 'project_2', 'manual_analysis', 'manual', 'completed',
          'slot_2', '2026-08-01', '2026-08-29',
          '2026-08-29T10:00:00.000Z', '2026-08-29T10:01:00.000Z', 'v1');`,
      `INSERT INTO growth_recommendations (
        id, project_id, run_id, creation_key, fact_hash, title, rationale,
        category, impact, commercial_relevance, effort, urgency, confidence,
        priority_score, status, review_version
      ) VALUES
        ('recommendation_1', 'project_1', 'run_1', 'recommendation-one',
          '${"c".repeat(64)}', 'Repair pricing visibility',
          'The page has measurable demand.', 'content', 5, 5, 2, 3, 0.8,
          10, 'accepted', 1);`,
      `INSERT INTO growth_recommendations (
        id, project_id, run_id, creation_key, fact_hash, title, rationale,
        category, impact, commercial_relevance, effort, urgency, confidence,
        priority_score, status, review_version
      ) VALUES
        ('recommendation_2', 'project_2', 'run_2', 'recommendation-two',
          '${"d".repeat(64)}', 'Repair the other project',
          'The other page has measurable demand.', 'content', 4, 4, 2, 2, 0.7,
          8, 'accepted', 1);`,
      `INSERT INTO growth_recommendation_targets (
        project_id, run_id, recommendation_id, target_type, target_value
      ) VALUES
        ('project_1', 'run_1', 'recommendation_1', 'url',
          'https://example.com/pricing'),
        ('project_1', 'run_1', 'recommendation_1', 'keyword',
          'pricing software'),
        ('project_2', 'run_2', 'recommendation_2', 'url',
          'https://other.example/pricing');`,
    ].join("\n"),
  );

  ({ GrowthActionsRepository } = await import("./GrowthActionsRepository"));
});

afterAll(() => client.close());

async function seedProposal(id: string) {
  await client.execute({
    sql: `INSERT INTO growth_recommendations (
      id, project_id, run_id, creation_key, fact_hash, title, rationale,
      category, impact, commercial_relevance, effort, urgency, confidence,
      priority_score, status, review_version
    ) SELECT ?, project_id, run_id, ?, fact_hash, title, rationale,
      category, impact, commercial_relevance, effort, urgency, confidence,
      priority_score, 'proposed', 0
      FROM growth_recommendations WHERE id = 'recommendation_1'`,
    args: [id, `recommendation:${id}`],
  });
  await client.execute({
    sql: `INSERT INTO growth_recommendation_targets
      (project_id, run_id, recommendation_id, target_type, target_value)
      SELECT project_id, run_id, ?, target_type, target_value
      FROM growth_recommendation_targets WHERE recommendation_id = 'recommendation_1'`,
    args: [id],
  });
  return {
    ...actionInput,
    id: `action:${id}`,
    recommendationId: id,
    creationKey: `approval:${id}`,
    eventId: `event:${id}`,
    expectedReviewVersion: 0,
  };
}

describe("Growth atomic approval SQLite", () => {
  it("saves acceptance, due date, targets and approving actor in one batch", async () => {
    const input = await seedProposal("atomic_approval");
    await GrowthActionsRepository.approveActionGraph(input);
    const graph = await GrowthActionsRepository.getActionGraph(
      input.projectId,
      input.id,
    );
    expect(graph?.action).toMatchObject({
      dueAt: input.dueAt,
      status: "approved",
    });
    expect(graph?.targets).toEqual(input.targets);
    expect(graph?.events).toHaveLength(1);
    expect(graph?.creationEvent).toMatchObject({
      actorId: input.actorId,
      factHash: input.eventFactHash,
    });
    const review = await client.execute({
      sql: "SELECT status, review_version, reviewed_at FROM growth_recommendations WHERE id = ?",
      args: [input.recommendationId],
    });
    expect(review.rows).toEqual([
      {
        status: "accepted",
        review_version: 1,
        reviewed_at: graph?.action.approvedAt,
      },
    ]);
    await GrowthActionsRepository.approveActionGraph({
      ...input,
      id: "atomic_retry",
      eventId: "atomic_retry_event",
      actorId: "retry_user",
    });
    expect(
      await GrowthActionsRepository.getActionGraph(input.projectId, input.id),
    ).toEqual(graph);
  });

  it("rolls back acceptance and every graph row when the event violates a constraint", async () => {
    const input = await seedProposal("atomic_rollback");
    await expect(
      GrowthActionsRepository.approveActionGraph({
        ...input,
        eventFactHash: "invalid",
      }),
    ).rejects.toThrow();
    expect(
      await GrowthActionsRepository.getRecommendationSource(
        input.projectId,
        input.recommendationId,
      ),
    ).toMatchObject({ status: "proposed", reviewVersion: 0 });
    expect(
      await GrowthActionsRepository.getActionByKey(
        input.projectId,
        input.creationKey,
      ),
    ).toBeNull();
    for (const table of ["growth_action_targets", "growth_action_events"]) {
      const result = await client.execute({
        sql: `SELECT count(*) AS count FROM ${table} WHERE action_id = ?`,
        args: [input.id],
      });
      expect(result.rows).toEqual([{ count: 0 }]);
    }
  });

  it("leaves stale, reviewed and occupied-key proposals unchanged", async () => {
    const input = await seedProposal("atomic_conflict");
    await GrowthActionsRepository.approveActionGraph({
      ...input,
      expectedReviewVersion: 1,
    });
    expect(
      await GrowthActionsRepository.getActionByKey(
        input.projectId,
        input.creationKey,
      ),
    ).toBeNull();

    await GrowthActionsRepository.createActionGraph({
      ...actionInput,
      id: "occupied_action",
      creationKey: input.creationKey,
      eventId: "occupied_event",
    });
    await GrowthActionsRepository.approveActionGraph(input);
    expect(
      await GrowthActionsRepository.getRecommendationSource(
        input.projectId,
        input.recommendationId,
      ),
    ).toMatchObject({ status: "proposed", reviewVersion: 0 });
    expect(
      await GrowthActionsRepository.getActionByKey(
        input.projectId,
        input.creationKey,
      ),
    ).toMatchObject({
      id: "occupied_action",
      recommendationId: "recommendation_1",
    });

    const dismissed = await seedProposal("atomic_dismissed");
    await client.execute({
      sql: "UPDATE growth_recommendations SET status = 'dismissed', review_version = 1, dismissal_reason = 'already_planned' WHERE id = ?",
      args: [dismissed.recommendationId],
    });
    await GrowthActionsRepository.approveActionGraph(dismissed);
    expect(
      await GrowthActionsRepository.getActionByKey(
        dismissed.projectId,
        dismissed.creationKey,
      ),
    ).toBeNull();
    expect(
      await GrowthActionsRepository.getRecommendationSource(
        dismissed.projectId,
        dismissed.recommendationId,
      ),
    ).toMatchObject({ status: "dismissed", reviewVersion: 1 });
  });
});

// oxlint-disable-next-line max-lines-per-function -- the shared SQLite aggregate fixture is intentionally sequential.
describe("GrowthActionsRepository D1 aggregate writes", () => {
  it("keeps creation complete and isolates exact retries, drift, and projects", async () => {
    await GrowthActionsRepository.createActionGraph(actionInput);
    await GrowthActionsRepository.createActionGraph({
      ...actionInput,
      id: "action_exact_retry",
      eventId: "event_exact_retry",
    });
    await GrowthActionsRepository.createActionGraph({
      ...actionInput,
      id: "action_drift",
      factHash: "e".repeat(64),
      eventId: "event_drift",
      eventFactHash: "f".repeat(64),
      targets: [
        ...actionInput.targets,
        { targetType: "keyword", targetValue: "pricing software" },
      ],
    });

    const graph = await GrowthActionsRepository.getActionGraph(
      "project_1",
      "action_1",
    );
    expect(graph?.action).toMatchObject({
      id: "action_1",
      recommendationId: "recommendation_1",
      factHash: "a".repeat(64),
      category: "content",
      priorityScore: 10,
      status: "approved",
      stateVersion: 0,
      ownerUserId: null,
    });
    expect(graph?.targets).toEqual([
      { targetType: "url", targetValue: "https://example.com/pricing" },
    ]);
    expect(graph?.creationEvent).toMatchObject({
      id: "event_0",
      actionVersion: 0,
      factHash: "b".repeat(64),
      eventType: "created",
      fromStatus: null,
      toStatus: "approved",
      actorType: "user",
      actorId: "user_1",
      note: "Approved for delivery",
    });
    expect(
      await GrowthActionsRepository.getActionByKey(
        "project_1",
        actionInput.creationKey,
      ),
    ).toMatchObject({ id: "action_1" });
    expect(
      await GrowthActionsRepository.getAction("project_2", "action_1"),
    ).toBeNull();
    await expect(
      GrowthActionsRepository.listRecommendationTargets(
        "project_1",
        "recommendation_1",
      ),
    ).resolves.toEqual([
      { targetType: "keyword", targetValue: "pricing software" },
      { targetType: "url", targetValue: "https://example.com/pricing" },
    ]);

    await GrowthActionsRepository.createActionGraph({
      ...actionInput,
      id: "action_missing_target",
      creationKey: "missing-target",
      factHash: "1".repeat(64),
      eventId: "event_missing_target",
      eventFactHash: "2".repeat(64),
      targets: [{ targetType: "cluster", targetValue: "invented cluster" }],
    });
    expect(
      await GrowthActionsRepository.getActionByKey(
        "project_1",
        "missing-target",
      ),
    ).toBeNull();

    await GrowthActionsRepository.createActionGraph({
      ...actionInput,
      id: "action_project_2",
      projectId: "project_2",
      runId: "run_2",
      recommendationId: "recommendation_2",
      category: "content",
      priorityScore: 8,
      factHash: "3".repeat(64),
      eventId: "event_project_2",
      eventFactHash: "4".repeat(64),
      targets: [
        { targetType: "url", targetValue: "https://other.example/pricing" },
      ],
    });
    expect(
      await GrowthActionsRepository.getActionByKey(
        "project_2",
        actionInput.creationKey,
      ),
    ).toMatchObject({ id: "action_project_2", projectId: "project_2" });
  });

  it("atomically advances the projection and immutable event ledger", async () => {
    const transition = async (
      expectedStatus:
        | "approved"
        | "ready"
        | "in_progress"
        | "blocked"
        | "implemented"
        | "measuring",
      expectedVersion: number,
      status:
        | "ready"
        | "in_progress"
        | "blocked"
        | "implemented"
        | "measuring"
        | "evaluated",
    ) =>
      GrowthActionsRepository.transitionAction({
        projectId: "project_1",
        actionId: "action_1",
        expectedStatus,
        expectedVersion,
        status,
        eventId: `event_${expectedVersion + 1}`,
        eventFactHash: String((expectedVersion + 5) % 10).repeat(64),
        actorType: "agent",
        actorId: "growth-agent",
        note: `${expectedStatus} to ${status}`,
      });

    await transition("approved", 0, "ready");
    await GrowthActionsRepository.transitionAction({
      projectId: "project_1",
      actionId: "action_1",
      expectedStatus: "approved",
      expectedVersion: 0,
      status: "ready",
      eventId: "event_1_exact_retry",
      eventFactHash: "5".repeat(64),
      actorType: "agent",
      actorId: "growth-agent",
      note: "approved to ready",
    });
    await GrowthActionsRepository.transitionAction({
      projectId: "project_1",
      actionId: "action_1",
      expectedStatus: "approved",
      expectedVersion: 0,
      status: "ready",
      eventId: "event_1_drift",
      eventFactHash: "9".repeat(64),
      actorType: "agent",
      actorId: "other-agent",
      note: "losing drift",
    });
    expect(
      await GrowthActionsRepository.getActionEvent("project_1", "action_1", 1),
    ).toMatchObject({
      id: "event_1",
      factHash: "5".repeat(64),
      actorId: "growth-agent",
      note: "approved to ready",
    });

    await transition("ready", 1, "in_progress");
    const started = await GrowthActionsRepository.getAction(
      "project_1",
      "action_1",
    );
    expect(started?.startedAt).toBeTruthy();
    await transition("in_progress", 2, "blocked");
    await transition("blocked", 3, "in_progress");
    expect(
      (await GrowthActionsRepository.getAction("project_1", "action_1"))
        ?.startedAt,
    ).toBe(started?.startedAt);
    await transition("in_progress", 4, "implemented");
    const implemented = await GrowthActionsRepository.getAction(
      "project_1",
      "action_1",
    );
    expect(implemented?.implementedAt).toBeTruthy();
    await transition("implemented", 5, "measuring");
    await transition("measuring", 6, "evaluated");

    const evaluated = await GrowthActionsRepository.getAction(
      "project_1",
      "action_1",
    );
    expect(evaluated).toMatchObject({
      status: "evaluated",
      stateVersion: 7,
      startedAt: started?.startedAt,
      implementedAt: implemented?.implementedAt,
    });
    expect(evaluated?.evaluatedAt).toBeTruthy();
    expect(evaluated?.cancelledAt).toBeNull();

    await GrowthActionsRepository.transitionAction({
      projectId: "project_1",
      actionId: "action_1",
      expectedStatus: "approved",
      expectedVersion: 0,
      status: "ready",
      eventId: "event_1_delayed_exact_retry",
      eventFactHash: "5".repeat(64),
      actorType: "agent",
      actorId: "growth-agent",
      note: "approved to ready",
    });
    expect(
      await GrowthActionsRepository.getAction("project_1", "action_1"),
    ).toMatchObject({ status: "evaluated", stateVersion: 7 });
    expect(
      await GrowthActionsRepository.getActionEvent("project_1", "action_1", 1),
    ).toMatchObject({
      id: "event_1",
      factHash: "5".repeat(64),
      actorId: "growth-agent",
      note: "approved to ready",
    });

    const events = await client.execute({
      sql: `SELECT action_version, event_type, from_status, to_status
            FROM growth_action_events
            WHERE project_id = ? AND action_id = ?
            ORDER BY action_version`,
      args: ["project_1", "action_1"],
    });
    expect(events.rows.map((row) => Number(row.action_version))).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7,
    ]);
    expect(events.rows.at(-1)).toMatchObject({
      event_type: "status_changed",
      from_status: "measuring",
      to_status: "evaluated",
    });
    expect(
      (
        await GrowthActionsRepository.listActionEvents("project_1", "action_1")
      ).map(({ actionVersion }) => actionVersion),
    ).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(
      await GrowthActionsRepository.listActionEvents("project_2", "action_1"),
    ).toEqual([]);

    await expect(
      GrowthActionsRepository.transitionAction({
        projectId: "project_1",
        actionId: "action_1",
        expectedStatus: "evaluated",
        expectedVersion: 7,
        status: "cancelled",
        eventId: "event_illegal",
        eventFactHash: "0".repeat(64),
        actorType: "system",
        actorId: "system",
        note: null,
      }),
    ).rejects.toThrow();
    expect(
      await GrowthActionsRepository.getAction("project_1", "action_1"),
    ).toMatchObject({ status: "evaluated", stateVersion: 7 });
    expect(
      await GrowthActionsRepository.getActionEvent("project_1", "action_1", 8),
    ).toBeNull();
    expect((await client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
  });

  it("projects only bounded supported investigation actions and bulk targets", async () => {
    await client.execute(
      "UPDATE growth_runs SET detector_version = 'priority-page-click-decline-v1', cadence_slot = 'priority-page-check:work' WHERE id = 'run_1'",
    );
    await client.executeMultiple(
      [
        `INSERT INTO growth_signals (id, project_id, run_id, signal_type, entity_type, entity_ref, metric, severity, confidence, period_start, period_end, baseline_value, current_value, delta_value, evidence_kind, evidence_ref, captured_at)
         VALUES ('signal_work', 'project_1', 'run_1', 'priority_page_click_decline', 'key_page', 'page_1', 'gsc_clicks', 'warning', 0, '2026-08-01', '2026-08-29', 10, 5, -5, 'gsc_period', 'saved', '2026-08-30T10:00:00.000Z');`,
        `INSERT INTO growth_insights (id, project_id, run_id, creation_key, fact_hash, title, explanation, hypothesis, confidence)
         VALUES ('insight_work', 'project_1', 'run_1', 'priority-page-investigation-v1:insight:signal_work', '${"7".repeat(64)}', 'Observed decline', 'Observed facts.', 'Cause unknown.', 0);`,
        `INSERT INTO growth_insight_signals (project_id, run_id, insight_id, signal_id)
         VALUES ('project_1', 'run_1', 'insight_work', 'signal_work');`,
        `INSERT INTO growth_recommendations (id, project_id, run_id, creation_key, fact_hash, title, rationale, category, impact, commercial_relevance, effort, urgency, confidence, priority_score, status, review_version)
         VALUES ('recommendation_work', 'project_1', 'run_1', 'priority-page-investigation-v1:recommendation:signal_work', '${"8".repeat(64)}', 'Investigate decline', 'Cause unknown.', 'investigation', 1, 1, 1, 1, 0, 0, 'accepted', 1);`,
        `INSERT INTO growth_recommendation_insights (project_id, run_id, recommendation_id, insight_id)
         VALUES ('project_1', 'run_1', 'recommendation_work', 'insight_work');`,
        `INSERT INTO growth_recommendation_targets (project_id, run_id, recommendation_id, target_type, target_value)
         VALUES ('project_1', 'run_1', 'recommendation_work', 'url', 'https://example.com/pricing');`,
      ].join("\n"),
    );
    await client.executeMultiple(
      [
        `INSERT INTO growth_insights (id, project_id, run_id, creation_key, fact_hash, title, explanation, hypothesis, confidence)
         VALUES ('insight_work_duplicate', 'project_1', 'run_1', 'priority-page-investigation-v1:insight:signal_work_duplicate', '${"6".repeat(64)}', 'Observed decline', 'Observed facts.', 'Cause unknown.', 0);`,
        `INSERT INTO growth_insight_signals (project_id, run_id, insight_id, signal_id)
         VALUES ('project_1', 'run_1', 'insight_work_duplicate', 'signal_work');`,
        `INSERT INTO growth_recommendation_insights (project_id, run_id, recommendation_id, insight_id)
         VALUES ('project_1', 'run_1', 'recommendation_work', 'insight_work_duplicate');`,
      ].join("\n"),
    );
    await GrowthActionsRepository.createActionGraph({
      ...actionInput,
      id: "action_work",
      recommendationId: "recommendation_work",
      creationKey: "priority-page-investigation-v1:action:signal_work",
      factHash: "9".repeat(64),
      category: "investigation",
      priorityScore: 0,
      eventId: "event_work",
      eventFactHash: "0".repeat(64),
    });

    for (const detectorVersion of [
      "priority-page-click-decline-v1",
      "priority-page-click-decline-v2",
    ]) {
      await client.execute({
        sql: "UPDATE growth_runs SET detector_version = ? WHERE id = 'run_1'",
        args: [detectorVersion],
      });
      await expect(
        GrowthActionsRepository.listInvestigationWork(
          "project_1",
          1,
          "action_work",
        ),
      ).resolves.toEqual([
        expect.objectContaining({ id: "action_work", stateVersion: 0 }),
      ]);
    }
    await client.execute(
      "UPDATE growth_runs SET detector_version = 'priority-page-click-decline-v3' WHERE id = 'run_1'",
    );
    await expect(
      GrowthActionsRepository.listInvestigationWork(
        "project_1",
        1,
        "action_work",
      ),
    ).resolves.toEqual([]);
    await client.execute(
      "UPDATE growth_runs SET detector_version = 'priority-page-click-decline-v2' WHERE id = 'run_1'",
    );

    const rows = await GrowthActionsRepository.listInvestigationWork(
      "project_1",
      50,
    );
    expect(rows).toEqual([
      expect.objectContaining({
        id: "action_work",
        runId: "run_1",
        stateVersion: 0,
      }),
    ]);
    await expect(
      GrowthActionsRepository.listInvestigationWork("project_1", 1, "action_1"),
    ).resolves.toEqual([]);
    expect(
      await GrowthActionsRepository.listActionTargetsForActions("project_1", [
        "action_work",
      ]),
    ).toEqual([
      {
        actionId: "action_work",
        targetType: "url",
        targetValue: "https://example.com/pricing",
      },
    ]);
    expect(
      await GrowthActionsRepository.listActionTargetsForActions("project_2", [
        "action_work",
      ]),
    ).toEqual([]);

    await client.executeMultiple(
      Array.from(
        { length: 51 },
        (_, index) => `INSERT INTO growth_action_events (
          id, project_id, action_id, action_version, fact_hash, event_type,
          actor_type, actor_id, from_status, to_status, note, created_at
        ) VALUES (
          'event_work_${index + 1}', 'project_1', 'action_work', ${index + 1},
          '${"f".repeat(64)}', 'status_changed', 'system', 'growth-system',
          'ready', 'cancelled', NULL, '2026-08-30T10:${String(index).padStart(2, "0")}:00.000Z'
        );`,
      ).join("\n"),
    );
    const recent = await GrowthActionsRepository.listRecentActionEvents(
      "project_1",
      "action_work",
    );
    expect(recent).toHaveLength(50);
    expect(recent.map(({ actionVersion }) => actionVersion)).toEqual(
      Array.from({ length: 50 }, (_, index) => 51 - index),
    );
    expect(recent[0]).not.toHaveProperty("actorId");
    expect(
      await GrowthActionsRepository.listActionEvents(
        "project_1",
        "action_work",
      ),
    ).toHaveLength(52);
  });
});
