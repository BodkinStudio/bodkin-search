import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type * as RunBatchModule from "@/db/runBatch";
import type { GrowthChangeLogService as GrowthChangeLogServiceExport } from "./GrowthChangeLogService";

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));

let client: Client;
let service: typeof GrowthChangeLogServiceExport;

const request = {
  projectId: "project_1",
  requestKey: "c6d24ae8-da66-45c3-9057-11e76520a34f",
  keyPageId: "key_pricing",
  happenedOn: "2026-08-29",
  changeType: "content_updated" as const,
  description: "Reworked pricing copy.",
  actorId: "user_1",
};

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  const testDb = drizzle(client);
  vi.doMock("@/db", () => ({ db: testDb }));
  type BatchStatement = Parameters<typeof testDb.batch>[0][number];
  vi.doMock("@/db/runBatch", async (loadOriginal) => {
    const original = await loadOriginal<typeof RunBatchModule>();
    return {
      ...original,
      runBatch: async (
        build: (tx: typeof testDb) => readonly Promise<unknown>[],
      ): Promise<void> => {
        const statements = build(testDb);
        if (statements.length === 0) return;
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the length guard proves this tuple is non-empty
        const batch = statements as unknown as [
          BatchStatement,
          ...BatchStatement[],
        ];
        await testDb.batch(batch);
      },
    };
  });
  const migration = (path: string) => readFileSync(path, "utf8");
  const projectMemory = migration("drizzle/0042_project_memory.sql")
    .split("--> statement-breakpoint")
    .filter((statement) => !statement.includes("DROP TABLE"));
  await client.executeMultiple(
    [
      "PRAGMA foreign_keys = ON;",
      "CREATE TABLE projects (id text PRIMARY KEY, domain text, archived_at text);",
      "INSERT INTO projects (id, domain) VALUES ('project_1', 'example.com'), ('project_2', 'other.example');",
      ...projectMemory,
      migration("drizzle/0043_wild_proteus.sql"),
      migration("drizzle/0044_glossy_komodo.sql"),
      migration("drizzle/0045_mean_retro_girl.sql"),
      migration("drizzle/0046_living_misty_knight.sql"),
      migration("drizzle/0047_flaky_felicia_hardy.sql"),
      `INSERT INTO project_key_pages
       (id, project_id, url, role, topic, notes, commercial_weight, protected, actively_optimized, updated_at, updated_by)
       VALUES
       ('key_pricing', 'project_1', 'https://example.com/pricing?preview=1', 'money', NULL, NULL, 3, false, false, '2026-08-01T00:00:00.000Z', 'user'),
       ('key_foreign', 'project_2', 'https://other.example/pricing', 'money', NULL, NULL, 3, false, false, '2026-08-01T00:00:00.000Z', 'user');`,
    ].join("\n"),
  );
  ({ GrowthChangeLogService: service } =
    await import("./GrowthChangeLogService"));
});

afterAll(() => client.close());

describe.sequential("GrowthChangeLogService SQLite integration", () => {
  it("persists, reloads, replays after key-page removal, and rejects a changed fact", async () => {
    const first = await service.recordGrowthPageChange(request);
    expect(first).toMatchObject({
      changeType: "content_updated",
      happenedAt: "2026-08-29T00:00:00.000Z",
      displayUrls: ["https://example.com/pricing"],
    });
    await client.execute(
      "DELETE FROM project_key_pages WHERE project_id = 'project_1' AND id = 'key_pricing'",
    );
    const replay = await service.recordGrowthPageChange(request);
    expect(replay).toEqual(first);
    await expect(
      service.recordGrowthPageChange({
        ...request,
        description: "Changed fact.",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const log = await service.getGrowthChangeLog("project_1");
    expect(log).toMatchObject({
      setup: "missing_key_pages",
      limit: 50,
      changes: [expect.objectContaining({ id: first.id })],
    });
  });

  it("rejects a key page owned by another project before writing", async () => {
    await expect(
      service.recordGrowthPageChange({
        ...request,
        requestKey: "95f2f1f6-e1ac-49dc-af76-155bc045fe58",
        keyPageId: "key_foreign",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    const rows = await client.execute(
      "SELECT id FROM growth_change_events WHERE project_id = 'project_1'",
    );
    expect(rows.rows).toHaveLength(1);
  });
});
