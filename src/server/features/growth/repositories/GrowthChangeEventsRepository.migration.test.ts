/* eslint-disable max-lines, max-lines-per-function -- exhaustive raw migration acceptance is easiest to audit as one populated fixture */
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
const changeMigration = readFileSync(
  "drizzle/0047_flaky_felicia_hardy.sql",
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
    ) VALUES (?, ?, ?, ?, ?, 'Refresh a page', 'The page lost clicks',
      'content_refresh', 5, 4, 2, 3, 0.75, 12.5, 'accepted', 1,
      '2026-08-29T10:05:00.000Z')`,
    args: [id, projectId, runId, id, factHash],
  });
}

async function insertAction(
  projectId: string,
  recommendationId: string,
  id: string,
) {
  await client.execute({
    sql: `INSERT INTO growth_actions (
      id, project_id, recommendation_id, creation_key, fact_hash, title,
      description, category, priority_score, due_at, approved_at
    ) VALUES (?, ?, ?, ?, ?, 'Refresh a page', 'Implement the recommendation',
      'content_refresh', 12.5, '2026-09-30T16:00:00.000Z',
      '2026-08-29T10:10:00.000Z')`,
    args: [id, projectId, recommendationId, id, factHash],
  });
}

interface ChangeInsert {
  id: string;
  projectId: string;
  creationKey?: string;
  source?: string;
  changeType?: string;
  actorType?: string;
  actorId?: string;
  description?: string;
  happenedAt?: string;
  externalRef?: string | null;
  hash?: string;
}

async function insertChange({
  id,
  projectId,
  creationKey = id,
  source = "manual",
  changeType = "content_updated",
  actorType = "user",
  actorId = "user_1",
  description = "Published the revised page.",
  happenedAt = "2026-08-29T13:30:00.000Z",
  externalRef = null,
  hash = factHash,
}: ChangeInsert) {
  await client.execute({
    sql: `INSERT INTO growth_change_events (
      id, project_id, creation_key, fact_hash, source, change_type,
      actor_type, actor_id, description, happened_at, external_ref
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      projectId,
      creationKey,
      hash,
      source,
      changeType,
      actorType,
      actorId,
      description,
      happenedAt,
      externalRef,
    ],
  });
}

async function insertUrl(projectId: string, eventId: string, url: string) {
  await client.execute({
    sql: `INSERT INTO growth_change_event_urls (project_id, change_event_id, url)
      VALUES (?, ?, ?)`,
    args: [projectId, eventId, url],
  });
}

async function insertLink(
  projectId: string,
  actionId: string,
  eventId: string,
) {
  await client.execute({
    sql: `INSERT INTO growth_action_changes (project_id, action_id, change_event_id)
      VALUES (?, ?, ?)`,
    args: [projectId, actionId, eventId],
  });
}

async function countRows(table: string, where = "1 = 1") {
  const [row] = (
    await client.execute(
      `SELECT count(*) AS count FROM ${table} WHERE ${where}`,
    )
  ).rows;
  return Number(row?.count ?? 0);
}

async function indexColumns(table: string, indexName: string) {
  const indexes = (await client.execute(`PRAGMA index_list('${table}')`)).rows;
  expect(indexes).toEqual(
    expect.arrayContaining([expect.objectContaining({ name: indexName })]),
  );
  return (await client.execute(`PRAGMA index_info('${indexName}')`)).rows.map(
    (row) => row.name,
  );
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
  await insertAction("project_1", "recommendation_1", "action_1");
  await insertAction("project_1", "recommendation_2", "action_2");
  await insertAction("project_2", "recommendation_3", "action_3");
  if ((await countRows("growth_actions")) !== 3) {
    throw new Error("Expected populated Actions before migration 0047");
  }
  await client.executeMultiple(changeMigration);
});

afterEach(() => client.close());

describe("Growth Change Events D1 migration", () => {
  it("starts after 0046 and creates project-leading keys and query indexes", async () => {
    expect(await countRows("growth_actions")).toBe(3);

    const eventFks = (
      await client.execute("PRAGMA foreign_key_list('growth_change_events')")
    ).rows;
    expect(eventFks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "projects",
          from: "project_id",
          to: "id",
          on_delete: "CASCADE",
        }),
      ]),
    );

    const urlFks = (
      await client.execute(
        "PRAGMA foreign_key_list('growth_change_event_urls')",
      )
    ).rows;
    expect(urlFks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "growth_change_events",
          seq: 0,
          from: "project_id",
          to: "project_id",
          on_delete: "CASCADE",
        }),
        expect.objectContaining({
          table: "growth_change_events",
          seq: 1,
          from: "change_event_id",
          to: "id",
          on_delete: "CASCADE",
        }),
      ]),
    );

    const linkFks = (
      await client.execute("PRAGMA foreign_key_list('growth_action_changes')")
    ).rows;
    for (const table of ["growth_actions", "growth_change_events"]) {
      expect(linkFks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            table,
            seq: 0,
            from: "project_id",
            to: "project_id",
            on_delete: "CASCADE",
          }),
          expect.objectContaining({
            table,
            seq: 1,
            from: table === "growth_actions" ? "action_id" : "change_event_id",
            to: "id",
            on_delete: "CASCADE",
          }),
        ]),
      );
    }

    expect(
      await indexColumns(
        "growth_change_events",
        "growth_change_events_project_happened_idx",
      ),
    ).toEqual(["project_id", "happened_at"]);
    expect(
      await indexColumns(
        "growth_change_events",
        "growth_change_events_project_creation_key",
      ),
    ).toEqual(["project_id", "creation_key"]);
    expect(
      await indexColumns(
        "growth_change_event_urls",
        "growth_change_event_urls_project_url_idx",
      ),
    ).toEqual(["project_id", "url"]);
    expect(
      await indexColumns(
        "growth_action_changes",
        "growth_action_changes_project_event_idx",
      ),
    ).toEqual(["project_id", "change_event_id"]);
    expect((await client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
  });

  it("enforces vocabularies, bounds and independent project creation keys", async () => {
    await insertChange({
      id: "change_1",
      projectId: "project_1",
      creationKey: "shared-key",
      changeType: "unknown",
      source: "sherpa",
      actorType: "agent",
      externalRef: "ticket:123",
    });
    await insertChange({
      id: "change_2",
      projectId: "project_2",
      creationKey: "shared-key",
      changeType: "mixed",
      source: "deployment",
      actorType: "system",
    });

    for (const [id, field, value] of [
      ["bad_source", "source", "git"],
      ["bad_type", "changeType", "unknown/mixed"],
      ["bad_actor", "actorType", "integration"],
      ["bad_hash", "hash", "short"],
      ["empty_description", "description", ""],
      ["long_description", "description", "x".repeat(5001)],
      ["long_actor", "actorId", "x".repeat(201)],
      ["long_time", "happenedAt", "x".repeat(51)],
      ["empty_ref", "externalRef", ""],
      ["long_ref", "externalRef", "x".repeat(501)],
    ] as const) {
      await expect(
        insertChange({
          id,
          projectId: "project_1",
          [field]: value,
        }),
      ).rejects.toThrow();
    }
    await expect(
      insertChange({
        id: "duplicate_key",
        projectId: "project_1",
        creationKey: "shared-key",
      }),
    ).rejects.toThrow();
    expect(await countRows("growth_change_events")).toBe(2);
    expect((await client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
  });

  it("rejects duplicate and cross-project URL or Action attachment", async () => {
    await insertChange({ id: "change_1", projectId: "project_1" });
    await insertChange({ id: "change_2", projectId: "project_2" });
    await insertUrl("project_1", "change_1", "https://example.test/pricing");
    await insertLink("project_1", "action_1", "change_1");

    await expect(
      insertUrl("project_1", "change_1", "https://example.test/pricing"),
    ).rejects.toThrow();
    await expect(
      insertUrl("project_2", "change_1", "https://example.test/foreign"),
    ).rejects.toThrow();
    await expect(insertUrl("project_1", "change_1", "")).rejects.toThrow();
    await expect(
      insertUrl("project_1", "change_1", "x".repeat(2001)),
    ).rejects.toThrow();

    await expect(
      insertLink("project_1", "action_1", "change_1"),
    ).rejects.toThrow();
    await expect(
      insertLink("project_1", "action_3", "change_1"),
    ).rejects.toThrow();
    await expect(
      insertLink("project_1", "action_1", "change_2"),
    ).rejects.toThrow();
    expect(await countRows("growth_change_event_urls")).toBe(1);
    expect(await countRows("growth_action_changes")).toBe(1);
    expect((await client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
  });

  it("preserves Events across Action/run deletion and cascades only children", async () => {
    await insertChange({ id: "change_1", projectId: "project_1" });
    await insertUrl("project_1", "change_1", "https://example.test/pricing");
    await insertLink("project_1", "action_1", "change_1");
    await insertLink("project_1", "action_2", "change_1");

    await client.execute("DELETE FROM growth_runs WHERE id = 'run_1'");
    expect(await countRows("growth_actions", "id = 'action_1'")).toBe(0);
    expect(await countRows("growth_actions", "id = 'action_2'")).toBe(1);
    expect(await countRows("growth_change_events", "id = 'change_1'")).toBe(1);
    expect(
      await countRows(
        "growth_change_event_urls",
        "change_event_id = 'change_1'",
      ),
    ).toBe(1);
    expect(
      await countRows("growth_action_changes", "action_id = 'action_1'"),
    ).toBe(0);
    expect(
      await countRows("growth_action_changes", "action_id = 'action_2'"),
    ).toBe(1);

    await client.execute(
      "DELETE FROM growth_change_events WHERE id = 'change_1'",
    );
    expect(await countRows("growth_change_event_urls")).toBe(0);
    expect(await countRows("growth_action_changes")).toBe(0);
    expect(await countRows("growth_actions", "id = 'action_2'")).toBe(1);

    await insertChange({ id: "change_2", projectId: "project_2" });
    await insertUrl(
      "project_2",
      "change_2",
      "https://project-2.example.test/page",
    );
    await insertLink("project_2", "action_3", "change_2");
    await client.execute("DELETE FROM projects WHERE id = 'project_2'");
    expect(await countRows("growth_change_events", "id = 'change_2'")).toBe(0);
    expect(await countRows("growth_actions", "id = 'action_3'")).toBe(0);
    expect(await countRows("growth_actions", "id = 'action_2'")).toBe(1);
    expect((await client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
  });
});
