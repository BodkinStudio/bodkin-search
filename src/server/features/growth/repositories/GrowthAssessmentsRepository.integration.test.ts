import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type * as Module from "./GrowthAssessmentsRepository";

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
let client: Client;
let repo: typeof Module.GrowthAssessmentsRepository;
const projectId = "11111111-1111-4111-8111-111111111111";
const input = (
  expectedVersion: number | null,
  keyPageId: string | null = null,
) => ({
  projectId,
  expectedVersion,
  status: "draft" as const,
  objective: "",
  market: "",
  audience: "",
  successMeasure: "",
  objectiveConfirmed: false,
  comparisonRationale: "",
  options:
    keyPageId === null
      ? []
      : [
          {
            id: "old-option-id",
            kind: "page" as const,
            title: "Pricing",
            businessRelevance: "Revenue",
            evidenceSource: "Report",
            evidenceDate: "2026-09-09",
            evidenceScope: "UK",
            observation: "Clicks fell",
            uncertainty: "Attribution",
            nextValidation: "Measure",
            disposition: "selected" as const,
            keyPageId,
          },
        ],
});

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  const testDb = drizzle(client);
  vi.doMock("@/db", () => ({ db: testDb }));
  type Statement = Parameters<typeof testDb.batch>[0][number];
  vi.doMock("@/db/runBatch", () => ({
    runBatch: async (build: (tx: typeof testDb) => readonly Statement[]) => {
      const [first, ...rest] = build(testDb);
      if (first) await testDb.batch([first, ...rest]);
    },
  }));
  await client.executeMultiple(
    [
      "PRAGMA foreign_keys = ON;",
      "CREATE TABLE projects (id text PRIMARY KEY, domain text, archived_at text);",
      "CREATE TABLE project_key_pages (id text PRIMARY KEY, project_id text NOT NULL, url text NOT NULL, role text NOT NULL, topic text, notes text, commercial_weight integer, protected integer NOT NULL DEFAULT 0, actively_optimized integer NOT NULL DEFAULT 0, updated_at text NOT NULL, updated_by text NOT NULL);",
      `INSERT INTO projects VALUES ('${projectId}','example.com',NULL);`,
      readFileSync("drizzle/0064_massive_mongoose.sql", "utf8"),
      readFileSync("drizzle/0065_real_frog_thor.sql", "utf8"),
    ].join("\n"),
  );
  ({ GrowthAssessmentsRepository: repo } =
    await import("./GrowthAssessmentsRepository"));
});
afterAll(() => client.close());

describe.sequential("Growth assessment SQLite revisions", () => {
  it("appends drafts, regenerates child IDs, rejects stale writes, and rolls back invalid page links", async () => {
    const first = await repo.append(input(null));
    expect(first).toMatchObject({ version: 1, options: [] });
    await client.execute(
      `INSERT INTO project_key_pages (id,project_id,url,role,updated_at,updated_by) VALUES ('page_1','${projectId}','https://example.com/pricing','money','2026-09-09T00:00:00.000Z','user')`,
    );
    const second = await repo.append(input(1, "page_1"));
    expect(second).toMatchObject({ version: 2 });
    expect(second?.options[0]?.id).not.toBe("old-option-id");
    expect(await repo.append(input(1))).toBeNull();
    await expect(repo.append(input(2, "missing-page"))).rejects.toThrow();
    const latest = await repo.getLatest(projectId);
    expect(latest).toMatchObject({ version: 2 });
    expect(
      (await client.execute("SELECT count(*) AS count FROM growth_assessments"))
        .rows,
    ).toEqual([{ count: 2 }]);
  });
});
