import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type * as Repository from "./PromptExplorerSnapshotRepository";
import type { PromptExplorerResult } from "@/types/schemas/ai-search";

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
let client: Client;
let repository: typeof Repository;
const result: PromptExplorerResult = {
  prompt: "Which tools integrate SMS with Teams?",
  highlightBrand: "YakChat",
  fetchedAt: "2026-09-07T12:00:00.000Z",
  results: [
    {
      status: "success",
      model: "chat_gpt",
      modelName: "gpt-5",
      text: "Review YakChat's supported channels.",
      citations: [
        {
          url: "https://yakchat.com/",
          domain: "yakchat.com",
          title: "YakChat",
          matchedBrand: true,
        },
        {
          url: "https://example.com/guide",
          domain: "example.com",
          title: null,
          matchedBrand: false,
        },
      ],
      fanOutQueries: ["Teams SMS", "supported messaging channels"],
      brandMentioned: true,
      outputTokens: 125,
      webSearch: true,
      cacheProvenance: {
        source: "cached",
        generatedAt: "2026-09-01T12:00:00.000Z",
      },
    },
    {
      status: "error",
      model: "gemini",
      errorCode: "UPSTREAM_ERROR",
      message: "This model was unavailable.",
    },
  ],
};

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  const testDb = drizzle(client);
  vi.doMock("@/db", () => ({ db: testDb }));
  type Statement = Parameters<typeof testDb.batch>[0][number];
  vi.doMock("@/db/runBatch", () => ({
    runBatch: async (build: (tx: typeof testDb) => readonly Statement[]) => {
      const statements = build(testDb);
      if (statements.length) {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- nonempty D1-compatible builders execute atomically against the SQLite fixture
        await testDb.batch(statements as [Statement, ...Statement[]]);
      }
    },
  }));
  await client.executeMultiple(
    "PRAGMA foreign_keys = ON; CREATE TABLE projects (id text PRIMARY KEY); INSERT INTO projects VALUES ('a'), ('b');",
  );
  await client.executeMultiple(
    readFileSync("drizzle/0063_first_wonder_man.sql", "utf8"),
  );
  repository = await import("./PromptExplorerSnapshotRepository");
});
afterAll(() => client.close());
const save = (projectId: string, response = result) =>
  repository.savePromptExplorerSnapshot({
    projectId,
    result: response,
    webSearch: true,
    webSearchCountryCode: "GB",
  });

describe("saved Prompt Explorer evidence", () => {
  it("round-trips original results, ordered sources, settings, errors and generation provenance", async () => {
    const id = await save("a");
    expect(await repository.getPromptExplorerSnapshot("a", id)).toEqual({
      ...result,
      id,
      snapshotId: id,
      snapshotSaveError: null,
      webSearch: true,
      webSearchCountryCode: "GB",
    });
    expect(
      (await repository.listPromptExplorerSnapshots("a")).find(
        (row) => row.id === id,
      ),
    ).toMatchObject({
      prompt: result.prompt,
      capturedAt: result.fetchedAt,
      models: ["chat_gpt", "gemini"],
      webSearchCountryCode: "GB",
    });
  });
  it("does not expose another project's snapshot and rejects cross-project child relationships", async () => {
    const id = await save("a");
    expect(await repository.getPromptExplorerSnapshot("b", id)).toBeNull();
    expect(await repository.listPromptExplorerSnapshots("b")).toEqual([]);
    await expect(
      client.execute({
        sql: "INSERT INTO prompt_explorer_snapshot_models (project_id,snapshot_id,model,status,cache_source) VALUES ('b',?,'claude','error','unknown')",
        args: [id],
      }),
    ).rejects.toThrow();
  });
  it("rolls the entire snapshot back when a child write fails", async () => {
    const before = await client.execute(
      "SELECT count(*) AS count FROM prompt_explorer_snapshots",
    );
    await expect(
      save("a", { ...result, results: [result.results[0], result.results[0]] }),
    ).rejects.toThrow();
    const after = await client.execute(
      "SELECT count(*) AS count FROM prompt_explorer_snapshots",
    );
    expect(after.rows).toEqual(before.rows);
  });
  it("keeps unknown legacy generation time and missing brand observation distinct", async () => {
    const success = result.results[0];
    if (success.status !== "success")
      throw new Error("Fixture requires success");
    const id = await save("a", {
      ...result,
      highlightBrand: null,
      results: [
        { ...success, brandMentioned: null, cacheProvenance: undefined },
      ],
    });
    expect(
      (await repository.getPromptExplorerSnapshot("a", id))?.results[0],
    ).toMatchObject({
      brandMentioned: null,
      cacheProvenance: { source: "unknown", generatedAt: null },
    });
  });
  it("cascades project removal through all preserved evidence", async () => {
    await save("b");
    await client.execute("DELETE FROM projects WHERE id = 'b'");
    for (const table of [
      "prompt_explorer_snapshots",
      "prompt_explorer_snapshot_models",
      "prompt_explorer_snapshot_citations",
      "prompt_explorer_snapshot_fan_out_queries",
    ]) {
      const remaining = await client.execute(
        `SELECT count(*) AS count FROM ${table} WHERE project_id = 'b'`,
      );
      expect(remaining.rows[0].count).toBe(0);
    }
  });
  it("bounds listing to the newest fifty while older snapshots remain retrievable", async () => {
    await client.execute("INSERT INTO projects VALUES ('many')");
    let oldest = "";
    for (let day = 0; day < 51; day++) {
      const id = await save("many", {
        ...result,
        fetchedAt: new Date(Date.UTC(2026, 0, day + 1)).toISOString(),
      });
      if (day === 0) oldest = id;
    }
    const list = await repository.listPromptExplorerSnapshots("many");
    expect(list).toHaveLength(50);
    expect(list.some((row) => row.id === oldest)).toBe(false);
    expect(list[0].capturedAt).toBe(
      new Date(Date.UTC(2026, 0, 51)).toISOString(),
    );
    expect(
      await repository.getPromptExplorerSnapshot("many", oldest),
    ).not.toBeNull();
  });
});
