import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type * as RepositoryModule from "./GrowthActionsRepository";

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));

let client: Client;
let GrowthActionsRepository: typeof RepositoryModule.GrowthActionsRepository;

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  const testDb = drizzle(client);
  vi.doMock("@/db", () => ({ db: testDb }));
  await client.executeMultiple(
    [
      "PRAGMA foreign_keys = ON;",
      "CREATE TABLE projects (id text PRIMARY KEY, domain text, archived_at text);",
      'CREATE TABLE "user" (id text PRIMARY KEY);',
      "INSERT INTO projects (id, domain) VALUES ('project_1', 'example.com'), ('project_2', 'other.example');",
      readFileSync("drizzle/0044_glossy_komodo.sql", "utf8"),
      readFileSync("drizzle/0045_mean_retro_girl.sql", "utf8"),
      readFileSync("drizzle/0046_living_misty_knight.sql", "utf8"),
      `INSERT INTO growth_runs (id, project_id, run_type, trigger, status, cadence_slot, period_start, period_end, started_at, completed_at, detector_version)
       VALUES ('run_1', 'project_1', 'manual_analysis', 'manual', 'completed', 'slot_1', '2026-08-01', '2026-08-31', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z', 'v1'),
              ('run_2', 'project_2', 'manual_analysis', 'manual', 'completed', 'slot_2', '2026-08-01', '2026-08-31', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z', 'v1');`,
      `INSERT INTO growth_recommendations (id, project_id, run_id, creation_key, fact_hash, title, rationale, category, impact, commercial_relevance, effort, urgency, confidence, priority_score, status, review_version)
       VALUES ('recommendation_1', 'project_1', 'run_1', 'one', '${"a".repeat(64)}', 'One', 'One', 'content', 1, 1, 1, 1, 1, 1, 'accepted', 1),
              ('recommendation_2', 'project_2', 'run_2', 'two', '${"b".repeat(64)}', 'Two', 'Two', 'content', 1, 1, 1, 1, 1, 1, 'accepted', 1);`,
      `INSERT INTO growth_actions (id, project_id, recommendation_id, creation_key, fact_hash, title, description, category, priority_score, status, state_version, due_at, approved_at, created_at, updated_at)
       VALUES
        ('action_z', 'project_1', 'recommendation_1', 'z', '${"1".repeat(64)}', 'Z', 'Z description', 'content', 20, 'ready', 1, '2026-09-30T00:00:00.000Z', '2026-09-01T00:00:00.000Z', '2026-09-03T00:00:00.000Z', '2026-09-03T00:00:00.000Z'),
        ('action_a', 'project_1', 'recommendation_1', 'a', '${"2".repeat(64)}', 'A', 'A description', 'content', 10, 'ready', 1, '2026-09-30T00:00:00.000Z', '2026-09-01T00:00:00.000Z', '2026-09-03T00:00:00.000Z', '2026-09-03T00:00:00.000Z'),
        ('action_old', 'project_1', 'recommendation_1', 'old', '${"3".repeat(64)}', 'Old', 'Old description', 'technical', 5, 'ready', 1, '2026-09-30T00:00:00.000Z', '2026-09-01T00:00:00.000Z', '2026-09-02T00:00:00.000Z', '2026-09-02T00:00:00.000Z'),
        ('action_foreign', 'project_2', 'recommendation_2', 'foreign', '${"4".repeat(64)}', 'Foreign', 'Foreign description', 'content', 100, 'ready', 1, '2026-09-30T00:00:00.000Z', '2026-09-01T00:00:00.000Z', '2026-09-04T00:00:00.000Z', '2026-09-04T00:00:00.000Z');`,
      `INSERT INTO growth_action_targets (project_id, action_id, target_type, target_value)
       VALUES ('project_1', 'action_z', 'keyword', 'zeta'), ('project_1', 'action_z', 'url', 'https://example.com/z'), ('project_2', 'action_foreign', 'keyword', 'foreign');`,
    ].join("\n"),
  );
  ({ GrowthActionsRepository } = await import("./GrowthActionsRepository"));
});

afterAll(() => client.close());

describe("GrowthActionsRepository.listActionsPage SQLite/D1", () => {
  it("reads every project Action with project-leading filters and limit-plus-one", async () => {
    const rows = await GrowthActionsRepository.listActionsPage({
      projectId: "project_1",
      statuses: ["ready"],
      category: "content",
      minPriorityScore: 10,
      limit: 1,
    });
    expect(rows.map(({ id }) => id)).toEqual(["action_z", "action_a"]);
    expect(rows[0]).not.toHaveProperty("recommendationId");
    expect(rows[0]).not.toHaveProperty("factHash");
    await expect(
      GrowthActionsRepository.listActionTargetsForActions("project_1", [
        "action_z",
        "action_foreign",
      ]),
    ).resolves.toEqual([
      {
        actionId: "action_z",
        targetType: "keyword",
        targetValue: "zeta",
      },
      {
        actionId: "action_z",
        targetType: "url",
        targetValue: "https://example.com/z",
      },
    ]);
  });

  it("uses BINARY IDs for exact creation-time cursor boundaries", async () => {
    await expect(
      GrowthActionsRepository.listActionsPage({
        projectId: "project_1",
        limit: 50,
        cursor: {
          createdAt: "2026-09-03T00:00:00.000Z",
          id: "action_z",
        },
      }),
    ).resolves.toMatchObject([{ id: "action_a" }, { id: "action_old" }]);
  });
});
