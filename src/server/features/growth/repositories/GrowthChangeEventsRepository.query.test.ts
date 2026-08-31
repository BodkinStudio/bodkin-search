/* eslint-disable max-lines -- the immutable graph and deletion-direction fixture is easier to audit sequentially */
import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type * as RepositoryModule from "./GrowthChangeEventsRepository";

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));

let client: Client;
let GrowthChangeEventsRepository: typeof RepositoryModule.GrowthChangeEventsRepository;

const happenedAt = "2026-08-29T10:30:00.000Z";
const eventInput = {
  id: "change_event_1",
  projectId: "project_1",
  creationKey: "pricing-release",
  factHash: "d".repeat(64),
  source: "manual" as const,
  changeType: "content_updated" as const,
  actorType: "user" as const,
  actorId: "user_1",
  description: "Published the revised pricing copy.",
  happenedAt,
  externalRef: "deploy-100",
  urls: ["https://example.com/docs/pricing", "https://example.com/pricing"],
  expectedDomain: "example.com",
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
      "INSERT INTO projects (id, domain, archived_at) VALUES ('project_archived', 'archived.example', '2026-08-01T00:00:00.000Z');",
      "INSERT INTO user (id) VALUES ('user_1');",
      readFileSync("drizzle/0044_glossy_komodo.sql", "utf8"),
      readFileSync("drizzle/0045_mean_retro_girl.sql", "utf8"),
      readFileSync("drizzle/0046_living_misty_knight.sql", "utf8"),
      readFileSync("drizzle/0047_flaky_felicia_hardy.sql", "utf8"),
      `INSERT INTO growth_runs (
        id, project_id, run_type, trigger, status, cadence_slot, period_start,
        period_end, started_at, completed_at, detector_version
      ) VALUES
        ('run_a', 'project_1', 'manual_analysis', 'manual', 'completed',
          'change-a', '2026-08-01', '2026-08-29',
          '2026-08-29T10:00:00.000Z', '2026-08-29T10:01:00.000Z', 'v1'),
        ('run_b', 'project_1', 'manual_analysis', 'manual', 'completed',
          'change-b', '2026-08-01', '2026-08-29',
          '2026-08-29T10:00:00.000Z', '2026-08-29T10:01:00.000Z', 'v1'),
        ('run_foreign', 'project_2', 'manual_analysis', 'manual', 'completed',
          'change-foreign', '2026-08-01', '2026-08-29',
          '2026-08-29T10:00:00.000Z', '2026-08-29T10:01:00.000Z', 'v1');`,
      `INSERT INTO growth_recommendations (
        id, project_id, run_id, creation_key, fact_hash, title, rationale,
        category, impact, commercial_relevance, effort, urgency, confidence,
        priority_score, status, review_version
      ) VALUES
        ('recommendation_a', 'project_1', 'run_a', 'recommendation-a',
          '${"a".repeat(64)}', 'Ship change A', 'The page has demand.',
          'content', 5, 5, 2, 3, 0.8, 10, 'accepted', 1),
        ('recommendation_b', 'project_1', 'run_b', 'recommendation-b',
          '${"a".repeat(64)}', 'Ship change B', 'The page has demand.',
          'content', 5, 5, 2, 3, 0.8, 10, 'accepted', 1),
        ('recommendation_foreign', 'project_2', 'run_foreign',
          'recommendation-foreign', '${"a".repeat(64)}', 'Foreign change',
          'The page has demand.', 'content', 5, 5, 2, 3, 0.8, 10,
          'accepted', 1);`,
      `INSERT INTO growth_actions (
        id, project_id, recommendation_id, creation_key, fact_hash, title,
        description, category, priority_score, status, state_version, due_at,
        approved_at
      ) VALUES
        ('action_a', 'project_1', 'recommendation_a', 'action-a',
          '${"b".repeat(64)}', 'Ship A', 'Implement change A.', 'content', 10,
          'approved', 0, '2026-09-30T12:00:00.000Z',
          '2026-08-29T10:05:00.000Z'),
        ('action_b', 'project_1', 'recommendation_b', 'action-b',
          '${"b".repeat(64)}', 'Ship B', 'Implement change B.', 'content', 10,
          'approved', 0, '2026-09-30T12:00:00.000Z',
          '2026-08-29T10:05:00.000Z'),
        ('action_foreign', 'project_2', 'recommendation_foreign',
          'action-foreign', '${"b".repeat(64)}', 'Foreign action',
          'Implement foreign work.', 'content', 10, 'approved', 0,
          '2026-09-30T12:00:00.000Z', '2026-08-29T10:05:00.000Z');`,
      `INSERT INTO growth_action_events (
        id, project_id, action_id, action_version, fact_hash, event_type,
        actor_type, actor_id, from_status, to_status, note
      ) VALUES
        ('action_event_a', 'project_1', 'action_a', 0, '${"c".repeat(64)}',
          'created', 'system', 'growth-test', NULL, 'approved', NULL),
        ('action_event_b', 'project_1', 'action_b', 0, '${"c".repeat(64)}',
          'created', 'system', 'growth-test', NULL, 'approved', NULL),
        ('action_event_foreign', 'project_2', 'action_foreign', 0,
          '${"c".repeat(64)}', 'created', 'system', 'growth-test', NULL,
          'approved', NULL);`,
    ].join("\n"),
  );

  ({ GrowthChangeEventsRepository } =
    await import("./GrowthChangeEventsRepository"));
});

afterAll(() => client.close());

// oxlint-disable-next-line eslint(max-lines-per-function) -- the self-contained D1 fixture verifies graph persistence sequentially.
describe("GrowthChangeEventsRepository D1 aggregate writes", () => {
  it("lists a project-scoped, bounded manual history with bulk-loaded URLs", async () => {
    await GrowthChangeEventsRepository.createChangeEventGraph({
      ...eventInput,
      id: "change_event_list_older",
      creationKey: "list-older",
      factHash: "9".repeat(64),
      happenedAt: "2026-09-01T00:00:00.000Z",
      urls: ["https://example.com/older"],
    });
    await GrowthChangeEventsRepository.createChangeEventGraph({
      ...eventInput,
      id: "change_event_list_newer",
      creationKey: "list-newer",
      factHash: "8".repeat(64),
      happenedAt: "2026-09-02T00:00:00.000Z",
      urls: ["https://example.com/newer-a", "https://example.com/newer-b"],
    });
    await GrowthChangeEventsRepository.createChangeEventGraph({
      ...eventInput,
      id: "change_event_list_foreign",
      projectId: "project_2",
      creationKey: "list-foreign",
      factHash: "7".repeat(64),
      happenedAt: "2026-09-03T00:00:00.000Z",
      urls: ["https://other.example/foreign"],
      expectedDomain: "other.example",
    });

    const history =
      await GrowthChangeEventsRepository.listManualChangeEventGraphs(
        "project_1",
        2,
      );
    expect(history.map(({ event }) => event.id)).toEqual([
      "change_event_list_newer",
      "change_event_list_older",
    ]);
    expect(history.map(({ urls }) => urls)).toEqual([
      ["https://example.com/newer-a", "https://example.com/newer-b"],
      ["https://example.com/older"],
    ]);
  });

  it("keeps exact retries complete and drifting URLs out of the winner", async () => {
    await GrowthChangeEventsRepository.createChangeEventGraph(eventInput);
    await GrowthChangeEventsRepository.createChangeEventGraph({
      ...eventInput,
      id: "change_event_exact_retry",
      urls: eventInput.urls.toReversed(),
    });
    await GrowthChangeEventsRepository.createChangeEventGraph({
      ...eventInput,
      id: "change_event_drift",
      factHash: "e".repeat(64),
      description: "A losing, changed retry.",
      urls: ["https://example.com/losing-url"],
    });

    const graph = await GrowthChangeEventsRepository.getChangeEventGraph(
      "project_1",
      "change_event_1",
    );
    expect(graph?.event).toMatchObject({
      id: "change_event_1",
      projectId: "project_1",
      creationKey: "pricing-release",
      factHash: "d".repeat(64),
      source: "manual",
      changeType: "content_updated",
      actorType: "user",
      actorId: "user_1",
      description: "Published the revised pricing copy.",
      happenedAt,
      externalRef: "deploy-100",
    });
    expect(graph?.urls).toEqual(eventInput.urls);
    expect(graph?.actionIds).toEqual([]);
    expect(
      await GrowthChangeEventsRepository.getChangeEventByKey(
        "project_1",
        eventInput.creationKey,
      ),
    ).toMatchObject({ id: "change_event_1" });
    expect(
      await GrowthChangeEventsRepository.getChangeEventGraph(
        "project_2",
        "change_event_1",
      ),
    ).toBeNull();

    await GrowthChangeEventsRepository.createChangeEventGraph({
      ...eventInput,
      id: "change_event_project_2",
      projectId: "project_2",
      factHash: "f".repeat(64),
      urls: ["https://other.example/pricing"],
      expectedDomain: "other.example",
    });
    expect(
      await GrowthChangeEventsRepository.getChangeEventByKey(
        "project_2",
        eventInput.creationKey,
      ),
    ).toMatchObject({ id: "change_event_project_2" });

    await GrowthChangeEventsRepository.createChangeEventGraph({
      ...eventInput,
      id: "change_event_wrong_domain",
      creationKey: "wrong-domain",
      expectedDomain: "changed.example",
    });
    await GrowthChangeEventsRepository.createChangeEventGraph({
      ...eventInput,
      id: "change_event_archived",
      projectId: "project_archived",
      creationKey: "archived",
      expectedDomain: "archived.example",
      urls: ["https://archived.example/page"],
    });
    expect(
      await GrowthChangeEventsRepository.getChangeEventByKey(
        "project_1",
        "wrong-domain",
      ),
    ).toBeNull();
    expect(
      await GrowthChangeEventsRepository.getChangeEventByKey(
        "project_archived",
        "archived",
      ),
    ).toBeNull();
  });

  it("keeps Action links independent and prunes only associations", async () => {
    const changeEventId = "change_event_links";
    await GrowthChangeEventsRepository.createChangeEventGraph({
      ...eventInput,
      id: changeEventId,
      creationKey: "linked-change",
      factHash: "1".repeat(64),
      changeType: "technical_fix",
      externalRef: null,
      urls: ["https://example.com/pricing"],
    });
    await GrowthChangeEventsRepository.linkActionChange({
      projectId: "project_1",
      changeEventId,
      actionId: "action_a",
    });
    await GrowthChangeEventsRepository.linkActionChange({
      projectId: "project_1",
      changeEventId,
      actionId: "action_a",
    });
    await GrowthChangeEventsRepository.linkActionChange({
      projectId: "project_1",
      changeEventId,
      actionId: "action_b",
    });
    await GrowthChangeEventsRepository.linkActionChange({
      projectId: "project_1",
      changeEventId,
      actionId: "action_foreign",
    });
    await GrowthChangeEventsRepository.linkActionChange({
      projectId: "project_2",
      changeEventId,
      actionId: "action_foreign",
    });

    expect(
      (
        await GrowthChangeEventsRepository.getChangeEventGraph(
          "project_1",
          changeEventId,
        )
      )?.actionIds,
    ).toEqual(["action_a", "action_b"]);
    expect(
      await GrowthChangeEventsRepository.getActionChange(
        "project_1",
        changeEventId,
        "action_foreign",
      ),
    ).toBeNull();

    const actionStateBefore = await client.execute({
      sql: `SELECT id, status, state_version FROM growth_actions
            WHERE project_id = ? ORDER BY id`,
      args: ["project_1"],
    });
    const actionEventsBefore = await client.execute({
      sql: `SELECT action_id, action_version FROM growth_action_events
            WHERE project_id = ? ORDER BY action_id`,
      args: ["project_1"],
    });
    expect(actionStateBefore.rows).toHaveLength(2);
    expect(actionEventsBefore.rows).toHaveLength(2);

    await client.execute({
      sql: "DELETE FROM growth_runs WHERE project_id = ? AND id = ?",
      args: ["project_1", "run_a"],
    });
    const afterRunDeletion =
      await GrowthChangeEventsRepository.getChangeEventGraph(
        "project_1",
        changeEventId,
      );
    expect(afterRunDeletion?.urls).toEqual(["https://example.com/pricing"]);
    expect(afterRunDeletion?.actionIds).toEqual(["action_b"]);
    expect(
      await GrowthChangeEventsRepository.getAction("project_1", "action_b"),
    ).toMatchObject({ status: "approved", stateVersion: 0 });

    await client.execute({
      sql: "DELETE FROM growth_change_events WHERE project_id = ? AND id = ?",
      args: ["project_1", changeEventId],
    });
    expect(
      await GrowthChangeEventsRepository.getActionChange(
        "project_1",
        changeEventId,
        "action_b",
      ),
    ).toBeNull();
    expect(
      await GrowthChangeEventsRepository.getAction("project_1", "action_b"),
    ).toMatchObject({ status: "approved", stateVersion: 0 });

    const integrity = await client.execute("PRAGMA foreign_key_check");
    expect(integrity.rows).toEqual([]);
  });

  it("reads all linked manual change graphs with scoped bulk URL loading", async () => {
    await GrowthChangeEventsRepository.createChangeEventGraph({
      ...eventInput,
      id: "change_event_linked_older",
      creationKey: "linked-older",
      factHash: "2".repeat(64),
      happenedAt: "2026-08-01T00:00:00.000Z",
      urls: ["https://example.com/older"],
    });
    await GrowthChangeEventsRepository.createChangeEventGraph({
      ...eventInput,
      id: "change_event_linked_newer",
      creationKey: "linked-newer",
      factHash: "3".repeat(64),
      happenedAt: "2026-10-01T00:00:00.000Z",
      urls: ["https://example.com/newer-a", "https://example.com/newer-b"],
    });
    await GrowthChangeEventsRepository.createChangeEventGraph({
      ...eventInput,
      id: "change_event_linked_non_manual",
      creationKey: "linked-non-manual",
      factHash: "4".repeat(64),
      source: "deployment",
      urls: ["https://example.com/deployment"],
    });
    await Promise.all([
      GrowthChangeEventsRepository.linkActionChange({
        projectId: "project_1",
        actionId: "action_b",
        changeEventId: "change_event_linked_older",
      }),
      GrowthChangeEventsRepository.linkActionChange({
        projectId: "project_1",
        actionId: "action_b",
        changeEventId: "change_event_linked_newer",
      }),
      GrowthChangeEventsRepository.linkActionChange({
        projectId: "project_1",
        actionId: "action_b",
        changeEventId: "change_event_linked_non_manual",
      }),
    ]);

    const linked =
      await GrowthChangeEventsRepository.listManualChangeEventGraphsForAction(
        "project_1",
        "action_b",
        2,
      );
    expect(linked.map(({ event }) => event.id)).toEqual([
      "change_event_linked_newer",
      "change_event_linked_older",
    ]);
    expect(linked.map(({ urls }) => urls)).toEqual([
      ["https://example.com/newer-a", "https://example.com/newer-b"],
      ["https://example.com/older"],
    ]);
    await expect(
      GrowthChangeEventsRepository.listManualChangeEventGraphsForAction(
        "project_2",
        "action_a",
        2,
      ),
    ).resolves.toEqual([]);
  });

  it("bounds linked manual history and breaks timestamp ties by descending ID", async () => {
    await client.execute({
      sql: "DELETE FROM growth_action_changes WHERE project_id = ? AND action_id = ?",
      args: ["project_1", "action_b"],
    });
    for (let index = 0; index <= 50; index += 1) {
      const padded = index.toString().padStart(3, "0");
      const changeEventId = `change_event_linked_limit_${padded}`;
      await GrowthChangeEventsRepository.createChangeEventGraph({
        ...eventInput,
        id: changeEventId,
        creationKey: `linked-limit-${padded}`,
        factHash: `${index}`.padStart(64, "0"),
        happenedAt:
          index >= 49 ? "2027-01-02T00:00:00.000Z" : "2027-01-01T00:00:00.000Z",
        urls: [`https://example.com/linked-limit-${padded}`],
      });
      await GrowthChangeEventsRepository.linkActionChange({
        projectId: "project_1",
        actionId: "action_b",
        changeEventId,
      });
    }

    const linked =
      await GrowthChangeEventsRepository.listManualChangeEventGraphsForAction(
        "project_1",
        "action_b",
        50,
      );
    expect(linked).toHaveLength(50);
    expect(linked.slice(0, 2).map(({ event }) => event.id)).toEqual([
      "change_event_linked_limit_050",
      "change_event_linked_limit_049",
    ]);
    expect(linked.at(-1)?.event.id).toBe("change_event_linked_limit_001");
    expect(linked.map(({ event }) => event.id)).not.toContain(
      "change_event_linked_limit_000",
    );
  });
});
