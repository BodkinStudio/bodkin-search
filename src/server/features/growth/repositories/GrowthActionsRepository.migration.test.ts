/* eslint-disable max-lines, max-lines-per-function -- exhaustive migration acceptance is easier to audit as one sequential fixture */
import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const foundationMigration = readFileSync(
  "drizzle/0044_glossy_komodo.sql",
  "utf8",
);
const insightMigration = readFileSync(
  "drizzle/0045_mean_retro_girl.sql",
  "utf8",
);
const actionMigration = readFileSync(
  "drizzle/0046_living_misty_knight.sql",
  "utf8",
);
const factHash = "a".repeat(64);

let client: Client;

async function insertRun(projectId: string, id: string, slot: string) {
  await client.execute({
    sql: `INSERT INTO growth_runs (
      id, project_id, run_type, trigger, status, cadence_slot, period_start,
      period_end, started_at, detector_version
    ) VALUES (?, ?, 'daily_monitor', 'manual', 'running', ?, '2026-08-01',
      '2026-08-29', '2026-08-29T10:00:00.000Z', 'detector-v1')`,
    args: [id, projectId, slot],
  });
}

async function insertRecommendation(
  projectId: string,
  runId: string,
  id: string,
) {
  await client.execute({
    sql: `INSERT INTO growth_recommendations (
      id, project_id, run_id, creation_key, fact_hash, title, rationale,
      category, impact, commercial_relevance, effort, urgency, confidence,
      priority_score, status, review_version, reviewed_at
    ) VALUES (?, ?, ?, ?, ?, 'Refresh the pricing page',
      'The page lost high-intent clicks', 'content_refresh', 5, 4, 2, 3, 0.75,
      12.5, 'accepted', 1, '2026-08-29T10:05:00.000Z')`,
    args: [id, projectId, runId, id, factHash],
  });
  await client.execute({
    sql: `INSERT INTO growth_recommendation_targets (
      project_id, run_id, recommendation_id, target_type, target_value
    ) VALUES (?, ?, ?, 'url', ?)`,
    args: [projectId, runId, id, `https://${projectId}.example.test/pricing`],
  });
}

interface ActionInsert {
  id: string;
  projectId: string;
  recommendationId: string;
  creationKey?: string;
  status?: string;
  stateVersion?: number;
  ownerUserId?: string | null;
  startedAt?: string | null;
  implementedAt?: string | null;
  evaluatedAt?: string | null;
  cancelledAt?: string | null;
}

async function insertAction({
  id,
  projectId,
  recommendationId,
  creationKey = id,
  status = "approved",
  stateVersion = 0,
  ownerUserId = null,
  startedAt = null,
  implementedAt = null,
  evaluatedAt = null,
  cancelledAt = null,
}: ActionInsert) {
  await client.execute({
    sql: `INSERT INTO growth_actions (
      id, project_id, recommendation_id, creation_key, fact_hash, title,
      description, category, priority_score, status, state_version,
      owner_user_id, due_at, approved_at, started_at, implemented_at,
      evaluated_at, cancelled_at
    ) VALUES (?, ?, ?, ?, ?, 'Refresh the pricing page',
      'Implement the accepted recommendation', 'content_refresh', 12.5, ?, ?,
      ?, '2026-09-30T16:00:00.000Z', '2026-08-29T10:10:00.000Z', ?, ?, ?, ?)`,
    args: [
      id,
      projectId,
      recommendationId,
      creationKey,
      factHash,
      status,
      stateVersion,
      ownerUserId,
      startedAt,
      implementedAt,
      evaluatedAt,
      cancelledAt,
    ],
  });
}

async function insertCreatedEvent(
  projectId: string,
  actionId: string,
  id = `event_${actionId}`,
) {
  await client.execute({
    sql: `INSERT INTO growth_action_events (
      id, project_id, action_id, action_version, fact_hash, event_type,
      actor_type, actor_id, from_status, to_status, note
    ) VALUES (?, ?, ?, 0, ?, 'created', 'user', 'user_1', NULL, 'approved',
      'Accepted recommendation')`,
    args: [id, projectId, actionId, factHash],
  });
}

async function insertTarget(projectId: string, actionId: string) {
  await client.execute({
    sql: `INSERT INTO growth_action_targets (
      project_id, action_id, target_type, target_value
    ) VALUES (?, ?, 'url', ?)`,
    args: [projectId, actionId, `https://${projectId}.example.test/pricing`],
  });
}

async function countRows(table: string, where: string) {
  const [row] = (
    await client.execute(
      `SELECT count(*) AS count FROM ${table} WHERE ${where}`,
    )
  ).rows;
  return Number(row?.count ?? 0);
}

beforeEach(async () => {
  client = createClient({ url: "file::memory:" });
  await client.executeMultiple(
    [
      "PRAGMA foreign_keys = ON;",
      "CREATE TABLE projects (id text PRIMARY KEY);",
      "CREATE TABLE user (id text PRIMARY KEY);",
      "INSERT INTO projects (id) VALUES ('project_1'), ('project_2');",
      "INSERT INTO user (id) VALUES ('user_1');",
      foundationMigration,
    ].join("\n"),
  );
  await insertRun("project_1", "run_1", "slot_1");
  await insertRun("project_1", "run_2", "slot_2");
  await insertRun("project_2", "run_3", "slot_3");
  await client.executeMultiple(insightMigration);
  await insertRecommendation("project_1", "run_1", "recommendation_1");
  await insertRecommendation("project_1", "run_2", "recommendation_2");
  await insertRecommendation("project_2", "run_3", "recommendation_3");
  await client.executeMultiple(actionMigration);
});

afterEach(() => client.close());

describe("Growth Actions D1 migration", () => {
  it("starts from populated accepted Recommendations and creates project-leading relationships", async () => {
    expect(
      (
        await client.execute(
          "SELECT id, project_id, run_id, status FROM growth_recommendations ORDER BY id",
        )
      ).rows,
    ).toEqual([
      {
        id: "recommendation_1",
        project_id: "project_1",
        run_id: "run_1",
        status: "accepted",
      },
      {
        id: "recommendation_2",
        project_id: "project_1",
        run_id: "run_2",
        status: "accepted",
      },
      {
        id: "recommendation_3",
        project_id: "project_2",
        run_id: "run_3",
        status: "accepted",
      },
    ]);

    const actionFks = (
      await client.execute("PRAGMA foreign_key_list('growth_actions')")
    ).rows;
    const targetFks = (
      await client.execute("PRAGMA foreign_key_list('growth_action_targets')")
    ).rows;
    const eventFks = (
      await client.execute("PRAGMA foreign_key_list('growth_action_events')")
    ).rows;
    expect(actionFks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "growth_recommendations",
          seq: 0,
          from: "project_id",
          to: "project_id",
          on_delete: "CASCADE",
        }),
        expect.objectContaining({
          table: "growth_recommendations",
          seq: 1,
          from: "recommendation_id",
          to: "id",
          on_delete: "CASCADE",
        }),
      ]),
    );
    for (const rows of [targetFks, eventFks]) {
      expect(rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            table: "growth_actions",
            seq: 0,
            from: "project_id",
            to: "project_id",
            on_delete: "CASCADE",
          }),
          expect.objectContaining({
            table: "growth_actions",
            seq: 1,
            from: "action_id",
            to: "id",
            on_delete: "CASCADE",
          }),
        ]),
      );
    }
    expect((await client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
  });

  it("rejects invalid projections, vocabularies and fractional versions", async () => {
    await expect(
      insertAction({
        id: "fractional_action",
        projectId: "project_1",
        recommendationId: "recommendation_1",
        stateVersion: 0.5,
      }),
    ).rejects.toThrow();
    await expect(
      insertAction({
        id: "bad_status_action",
        projectId: "project_1",
        recommendationId: "recommendation_1",
        status: "done",
        stateVersion: 1,
      }),
    ).rejects.toThrow();
    await expect(
      insertAction({
        id: "missing_milestone_action",
        projectId: "project_1",
        recommendationId: "recommendation_1",
        status: "implemented",
        stateVersion: 2,
        startedAt: "2026-08-29T11:00:00.000Z",
      }),
    ).rejects.toThrow();
    await expect(
      client.execute(`INSERT INTO growth_actions (
        id, project_id, recommendation_id, creation_key, fact_hash, title,
        description, category, priority_score, due_at, approved_at
      ) VALUES ('negative_priority', 'project_1', 'recommendation_1',
        'negative_priority', '${factHash}', 'Title', 'Description', 'category',
        -1, '2026-09-30T16:00:00.000Z', '2026-08-29T10:10:00.000Z')`),
    ).rejects.toThrow();
    await expect(
      client.execute(`INSERT INTO growth_actions (
        id, project_id, recommendation_id, creation_key, fact_hash, title,
        description, category, priority_score, due_at, approved_at
      ) VALUES ('infinite_priority', 'project_1', 'recommendation_1',
        'infinite_priority', '${factHash}', 'Title', 'Description', 'category',
        1e999, '2026-09-30T16:00:00.000Z', '2026-08-29T10:10:00.000Z')`),
    ).rejects.toThrow();

    await insertAction({
      id: "action_1",
      projectId: "project_1",
      recommendationId: "recommendation_1",
    });
    await expect(
      client.execute(`INSERT INTO growth_action_events (
        id, project_id, action_id, action_version, fact_hash, event_type,
        actor_type, actor_id, from_status, to_status
      ) VALUES ('fractional_event', 'project_1', 'action_1', 0.5,
        '${factHash}', 'status_changed', 'user', 'user_1', 'approved', 'ready')`),
    ).rejects.toThrow();
    await expect(
      client.execute(`INSERT INTO growth_action_events (
        id, project_id, action_id, action_version, fact_hash, event_type,
        actor_type, actor_id, from_status, to_status
      ) VALUES ('bad_created_event', 'project_1', 'action_1', 0,
        '${factHash}', 'created', 'user', 'user_1', 'ready', 'approved')`),
    ).rejects.toThrow();
    await expect(
      client.execute(`INSERT INTO growth_action_events (
        id, project_id, action_id, action_version, fact_hash, event_type,
        actor_type, actor_id, from_status, to_status
      ) VALUES ('illegal_event', 'project_1', 'action_1', 1,
        '${factHash}', 'status_changed', 'user', 'user_1', 'approved',
        'implemented')`),
    ).rejects.toThrow();
    await expect(
      client.execute(`INSERT INTO growth_action_events (
        id, project_id, action_id, action_version, fact_hash, event_type,
        actor_type, actor_id, from_status, to_status
      ) VALUES ('bad_actor_event', 'project_1', 'action_1', 1,
        '${factHash}', 'status_changed', 'integration', 'user_1', 'approved',
        'ready')`),
    ).rejects.toThrow();
    expect((await client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
  });

  it("rejects cross-project attachments and duplicate target or event coordinates", async () => {
    await insertAction({
      id: "action_1",
      projectId: "project_1",
      recommendationId: "recommendation_1",
      creationKey: "shared-key",
    });
    await insertTarget("project_1", "action_1");
    await insertCreatedEvent("project_1", "action_1");

    await expect(
      insertAction({
        id: "foreign_recommendation_action",
        projectId: "project_1",
        recommendationId: "recommendation_3",
      }),
    ).rejects.toThrow();
    await expect(insertTarget("project_2", "action_1")).rejects.toThrow();
    await expect(
      insertCreatedEvent("project_2", "action_1", "foreign_event"),
    ).rejects.toThrow();
    await expect(insertTarget("project_1", "action_1")).rejects.toThrow();
    await expect(
      insertCreatedEvent("project_1", "action_1", "duplicate_version"),
    ).rejects.toThrow();
    await expect(
      insertAction({
        id: "duplicate_key_action",
        projectId: "project_1",
        recommendationId: "recommendation_2",
        creationKey: "shared-key",
      }),
    ).rejects.toThrow();

    await expect(
      insertAction({
        id: "action_2",
        projectId: "project_2",
        recommendationId: "recommendation_3",
        creationKey: "shared-key",
      }),
    ).resolves.toBeUndefined();
    expect((await client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
  });

  it("sets an optional owner to null when its user is deleted", async () => {
    await insertAction({
      id: "action_1",
      projectId: "project_1",
      recommendationId: "recommendation_1",
      ownerUserId: "user_1",
    });
    await client.execute("DELETE FROM user WHERE id = 'user_1'");
    expect(
      (
        await client.execute(
          "SELECT owner_user_id FROM growth_actions WHERE id = 'action_1'",
        )
      ).rows,
    ).toEqual([{ owner_user_id: null }]);
    expect((await client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
  });

  it("cascades Recommendation and origin-run deletion without affecting another run", async () => {
    await insertAction({
      id: "action_1",
      projectId: "project_1",
      recommendationId: "recommendation_1",
    });
    await insertTarget("project_1", "action_1");
    await insertCreatedEvent("project_1", "action_1");
    await insertAction({
      id: "action_2",
      projectId: "project_1",
      recommendationId: "recommendation_2",
    });
    await insertTarget("project_1", "action_2");
    await insertCreatedEvent("project_1", "action_2");

    await client.execute(
      "DELETE FROM growth_recommendations WHERE id = 'recommendation_1'",
    );
    expect(await countRows("growth_actions", "id = 'action_1' ")).toBe(0);
    expect(
      await countRows("growth_action_targets", "action_id = 'action_1'"),
    ).toBe(0);
    expect(
      await countRows("growth_action_events", "action_id = 'action_1'"),
    ).toBe(0);
    expect(await countRows("growth_actions", "id = 'action_2' ")).toBe(1);

    await insertRecommendation("project_1", "run_1", "recommendation_4");
    await insertAction({
      id: "action_4",
      projectId: "project_1",
      recommendationId: "recommendation_4",
    });
    await insertTarget("project_1", "action_4");
    await insertCreatedEvent("project_1", "action_4");

    await client.execute("DELETE FROM growth_runs WHERE id = 'run_1'");
    expect(await countRows("growth_actions", "id = 'action_4' ")).toBe(0);
    expect(
      await countRows("growth_action_targets", "action_id = 'action_4'"),
    ).toBe(0);
    expect(
      await countRows("growth_action_events", "action_id = 'action_4'"),
    ).toBe(0);
    expect(await countRows("growth_actions", "id = 'action_2' ")).toBe(1);
    expect((await client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
  });

  it("cascades project deletion while another project graph survives", async () => {
    await insertAction({
      id: "action_1",
      projectId: "project_1",
      recommendationId: "recommendation_1",
    });
    await insertTarget("project_1", "action_1");
    await insertCreatedEvent("project_1", "action_1");
    await insertAction({
      id: "action_2",
      projectId: "project_2",
      recommendationId: "recommendation_3",
    });
    await insertTarget("project_2", "action_2");
    await insertCreatedEvent("project_2", "action_2");

    await client.execute("DELETE FROM projects WHERE id = 'project_1'");
    expect(await countRows("growth_actions", "project_id = 'project_1' ")).toBe(
      0,
    );
    expect(
      await countRows("growth_action_targets", "project_id = 'project_1'"),
    ).toBe(0);
    expect(
      await countRows("growth_action_events", "project_id = 'project_1'"),
    ).toBe(0);
    expect(await countRows("growth_actions", "project_id = 'project_2' ")).toBe(
      1,
    );
    expect(
      await countRows("growth_action_targets", "project_id = 'project_2'"),
    ).toBe(1);
    expect(
      await countRows("growth_action_events", "project_id = 'project_2'"),
    ).toBe(1);
    expect((await client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
  });
});
