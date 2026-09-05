import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type * as RepositoryModule from "./LinkedInPageContentRepository";

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));

let client: Client;
let repository: typeof RepositoryModule.LinkedInPageContentRepository;
let chunkLinkedInPosts: typeof RepositoryModule.chunkLinkedInPosts;
let rowsPerInsert: number;

function post(
  postKey: string,
  impressions: number | null,
  publishedAt = "2026-08-15",
): RepositoryModule.StoredLinkedInPost {
  return {
    postKey,
    postUrl: `https://www.linkedin.com/posts/${postKey}`,
    postText: `Post ${postKey}`,
    publishedAt,
    impressions,
    membersReached: null,
    videoViews: null,
    clicks: null,
    reactions: null,
    comments: null,
    reposts: null,
    follows: null,
    providerClickThroughRate: null,
    providerEngagementRate: 5.5,
  };
}

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  const testDb = drizzle(client);
  vi.doMock("@/db", () => ({ db: testDb }));
  type BatchStatement = Parameters<typeof testDb.batch>[0][number];
  vi.doMock("@/db/runBatch", () => ({
    runBatch: async (
      build: (executor: typeof testDb) => readonly Promise<unknown>[],
    ) => {
      const statements = build(testDb);
      if (statements.length === 0) return;
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- length guard proves the non-empty tuple required by libSQL.
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
      "CREATE TABLE projects (id text PRIMARY KEY);",
      "INSERT INTO projects (id) VALUES ('project-1'), ('project-2');",
      readFileSync("drizzle/0059_amused_darkstar.sql", "utf8"),
    ].join("\n"),
  );
  const module = await import("./LinkedInPageContentRepository");
  repository = module.LinkedInPageContentRepository;
  chunkLinkedInPosts = module.chunkLinkedInPosts;
  rowsPerInsert = module.LINKEDIN_POST_ROWS_PER_INSERT;
});

afterAll(() => client.close());

describe("LinkedInPageContentRepository", () => {
  it("keeps multi-row inserts below the D1 bind-parameter limit", () => {
    const chunks = chunkLinkedInPosts(
      Array.from({ length: 13 }, (_, index) => index),
    );
    expect(rowsPerInsert).toBe(6);
    expect(chunks.map((chunk) => chunk.length)).toEqual([6, 6, 1]);
    expect(Math.max(...chunks.map((chunk) => chunk.length * 16))).toBeLessThan(
      100,
    );
  });

  it("atomically replaces one project period while retaining other periods and projects", async () => {
    await repository.replaceImport({
      id: "august-old",
      projectId: "project-1",
      pageName: "OpenSEO",
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      importedAt: "2026-09-01T00:00:00.000Z",
      posts: [post("a", 10), post("b", 20)],
    });
    await repository.replaceImport({
      id: "july",
      projectId: "project-1",
      pageName: "OpenSEO",
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      importedAt: "2026-08-01T00:00:00.000Z",
      posts: [post("c", 30)],
    });
    await repository.replaceImport({
      id: "foreign",
      projectId: "project-2",
      pageName: "Other",
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      importedAt: "2026-09-03T00:00:00.000Z",
      posts: [post("foreign", 999)],
    });
    await repository.replaceImport({
      id: "august-new",
      projectId: "project-1",
      pageName: "OpenSEO",
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      importedAt: "2026-09-02T00:00:00.000Z",
      posts: [post("replacement", 40)],
    });

    expect(await repository.findLatestImport("project-1")).toMatchObject({
      id: "august-new",
      rowCount: 1,
    });
    expect(
      await repository.findImportByPeriod(
        "project-1",
        "2026-07-01",
        "2026-07-31",
      ),
    ).toMatchObject({ id: "july" });
    expect(await repository.findLatestImport("project-2")).toMatchObject({
      id: "foreign",
    });
    expect(await repository.listPosts("august-old")).toEqual([]);
    expect(await repository.listPosts("august-new")).toHaveLength(1);
  });

  it("sorts top posts deterministically with null impressions last and restores rates", async () => {
    await repository.replaceImport({
      id: "september",
      projectId: "project-1",
      pageName: "OpenSEO",
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      importedAt: "2026-10-01T00:00:00.000Z",
      posts: [
        post("null", null, "2026-09-30"),
        post("older", 50, "2026-09-01"),
        post("newer", 50, "2026-09-20"),
        post("highest", 100, "2026-09-10"),
      ],
    });
    const rows = await repository.listTopPosts("september", 3);
    expect(rows.map((row) => row.postKey)).toEqual([
      "highest",
      "newer",
      "older",
    ]);
    expect(rows[0]?.providerEngagementRate).toBe(550);
  });
});
