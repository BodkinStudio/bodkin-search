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
});
