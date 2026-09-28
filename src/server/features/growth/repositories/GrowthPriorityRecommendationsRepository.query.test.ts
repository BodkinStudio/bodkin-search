import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { growthPriorityRecommendationsRequestSchema } from "@/types/schemas/growth-priority-recommendations";
import type * as RepositoryModule from "./GrowthPriorityRecommendationsRepository";

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));

let client: Client;
let repository: typeof RepositoryModule.GrowthPriorityRecommendationsRepository;

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  vi.doMock("@/db", () => ({ db: drizzle(client) }));
  await client.executeMultiple(`
    CREATE TABLE growth_recommendations (id text PRIMARY KEY, project_id text NOT NULL, run_id text NOT NULL, creation_key text NOT NULL, fact_hash text NOT NULL, title text NOT NULL, rationale text NOT NULL, category text NOT NULL, impact integer NOT NULL, commercial_relevance integer NOT NULL, effort integer NOT NULL, urgency integer NOT NULL, confidence real NOT NULL, priority_score real NOT NULL, model text, prompt_version text, status text NOT NULL, review_version integer NOT NULL, snoozed_until text, dismissal_reason text, resolution_recommendation_id text, reviewed_at text, created_at text NOT NULL);
    CREATE TABLE growth_actions (id text PRIMARY KEY, project_id text NOT NULL, recommendation_id text NOT NULL);
    CREATE TABLE growth_recommendation_targets (project_id text NOT NULL, run_id text NOT NULL, recommendation_id text NOT NULL, target_type text NOT NULL, target_value text NOT NULL);
    CREATE TABLE growth_recommendation_steps (project_id text NOT NULL, run_id text NOT NULL, recommendation_id text NOT NULL, position integer NOT NULL, content text NOT NULL);
    INSERT INTO growth_recommendations (id,project_id,run_id,creation_key,fact_hash,title,rationale,category,impact,commercial_relevance,effort,urgency,confidence,priority_score,status,review_version,created_at) VALUES
      ('rec_z','project_1','run','z','${"a".repeat(64)}','Z','Why','content',1,1,1,1,1,10,'proposed',0,'2026-08-20 09:00:00'),
      ('rec_a','project_1','run','a','${"b".repeat(64)}','A','Why','content',1,1,1,1,1,10,'proposed',0,'2026-08-20 09:00:00'),
      ('rec_old','project_1','run','old','${"c".repeat(64)}','Old','Why','technical',1,1,1,1,1,9,'snoozed',0,'2026-08-19 09:00:00'),
      ('rec_accepted','project_1','run','accepted','${"f".repeat(64)}','Accepted','Why','commercial',1,1,1,1,1,8,'accepted',2,'2026-08-18 09:00:00'),
      ('rec_action','project_1','run','action','${"d".repeat(64)}','Action','Why','content',1,1,1,1,1,99,'accepted',0,'2026-08-21 09:00:00'),
      ('rec_dismissed','project_1','run','dismissed','${"1".repeat(64)}','Dismissed','Why','content',1,1,1,1,1,200,'dismissed',1,'2026-08-23 09:00:00'),
      ('rec_merged','project_1','run','merged','${"2".repeat(64)}','Merged','Why','content',1,1,1,1,1,150,'merged',1,'2026-08-23 09:00:00'),
      ('rec_superseded','project_1','run','superseded','${"3".repeat(64)}','Superseded','Why','content',1,1,1,1,1,140,'superseded',1,'2026-08-23 09:00:00'),
      ('rec_foreign','project_2','run','foreign','${"e".repeat(64)}','Foreign','Why','content',1,1,1,1,1,100,'proposed',0,'2026-08-22 09:00:00');
    INSERT INTO growth_actions VALUES ('action_cancelled','project_1','rec_action');
    INSERT INTO growth_recommendation_targets VALUES ('project_1','run','rec_z','keyword','local'),('project_2','run','rec_z','keyword','foreign');
    INSERT INTO growth_recommendation_steps VALUES ('project_1','run','rec_z',0,'local'),('project_2','run','rec_z',1,'foreign');
  `);
  ({ GrowthPriorityRecommendationsRepository: repository } =
    await import("./GrowthPriorityRecommendationsRepository"));
});

afterAll(() => client.close());

describe("GrowthPriorityRecommendationsRepository SQLite/D1", () => {
  it("uses canonical UTC cursor coordinates for SQLite default timestamps and excludes accepted rows with any Action", async () => {
    const first = await repository.listRecommendationsPage({
      projectId: "project_1",
      limit: 1,
    });
    expect(first.map((row) => row.id)).toEqual(["rec_z", "rec_a"]);
    const second = await repository.listRecommendationsPage(
      growthPriorityRecommendationsRequestSchema.parse({
        projectId: "project_1",
        limit: 50,
        cursor: {
          priorityScore: 10,
          createdAt: "2026-08-20T10:00:00+01:00",
          id: "rec_z",
        },
      }),
    );
    expect(second.map((row) => row.id)).toEqual([
      "rec_a",
      "rec_old",
      "rec_accepted",
    ]);
  });

  it("applies status, category and minimum-priority filters before limiting", async () => {
    const rows = await repository.listRecommendationsPage({
      projectId: "project_1",
      statuses: ["accepted"],
      category: "commercial",
      minPriorityScore: 8,
      limit: 1,
    });
    expect(rows.map((row) => row.id)).toEqual(["rec_accepted"]);
  });

  it("keeps bulk children project-leading", async () => {
    await expect(
      repository.listTargetsForRecommendations("project_1", [
        "rec_z",
        "rec_foreign",
      ]),
    ).resolves.toMatchObject([
      { recommendationId: "rec_z", targetValue: "local" },
    ]);
    await expect(
      repository.listStepsForRecommendations("project_1", [
        "rec_z",
        "rec_foreign",
      ]),
    ).resolves.toMatchObject([{ recommendationId: "rec_z", content: "local" }]);
  });

  it("caps each child relation at the integrity sentinel", async () => {
    await client.executeMultiple(`
      INSERT INTO growth_recommendation_targets VALUES
        ${Array.from(
          { length: 102 },
          (_, index) =>
            `('project_1','run','rec_a','keyword','target-${String(index).padStart(3, "0")}')`,
        ).join(",")};
      INSERT INTO growth_recommendation_steps VALUES
        ${Array.from(
          { length: 102 },
          (_, index) => `('project_1','run','rec_a',${index},'step-${index}')`,
        ).join(",")};
    `);

    const targets = await repository.listTargetsForRecommendations(
      "project_1",
      ["rec_z", "rec_a"],
    );
    const steps = await repository.listStepsForRecommendations("project_1", [
      "rec_z",
      "rec_a",
    ]);
    expect(
      targets.filter((row) => row.recommendationId === "rec_a"),
    ).toHaveLength(101);
    expect(
      steps.filter((row) => row.recommendationId === "rec_a"),
    ).toHaveLength(101);
    expect(
      targets.filter((row) => row.recommendationId === "rec_z"),
    ).toHaveLength(1);
    expect(
      steps.filter((row) => row.recommendationId === "rec_z"),
    ).toHaveLength(1);
  });
});
