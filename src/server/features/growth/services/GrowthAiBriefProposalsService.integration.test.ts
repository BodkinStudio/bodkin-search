import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { GrowthAiBrief } from "@/types/schemas/growth-investigations";
import type { GrowthAiBriefRepository as RepositoryExport } from "../repositories/GrowthAiBriefRepository";

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));

let client: Client;
let repository: typeof RepositoryExport;

const generated: GrowthAiBrief = {
  kind: "growth_ai_brief",
  persistence: "ephemeral",
  generatedAt: "2026-09-06T12:00:00.000Z",
  affectedPageUrl: "https://example.com/pricing",
  currentBusinessContext: "available",
  currentPageRead: {
    status: "read",
    requestedUrl: "https://example.com/pricing",
    resolvedUrl: "https://www.example.com/pricing",
  },
  businessRelevance: "This page affects a commercial journey.",
  observations: [{ statement: "Saved clicks fell.", citationIds: ["saved"] }],
  hypotheses: [
    {
      statement: "Intent may have changed.",
      confidence: "low",
      citationIds: ["saved", "page"],
    },
  ],
  proposedSteps: ["Review intent.", "Revise the page."],
  measurementApproach: "Compare the next matching period.",
  caveats: ["This is a hypothesis."],
  citations: [
    {
      id: "saved",
      label: "Saved finding",
      source: "historical_saved_evidence",
      snapshot: "Clicks declined from 100 to 60.",
    },
    {
      id: "page",
      label: "Current page",
      source: "current_page_read",
      snapshot: "Pricing details",
    },
  ],
};

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  const testDb = drizzle(client);
  vi.doMock("@/db", () => ({ db: testDb }));
  type BatchStatement = Parameters<typeof testDb.batch>[0][number];
  vi.doMock("@/db/runBatch", () => ({
    runBatch: async (
      build: (tx: typeof testDb) => readonly Promise<unknown>[],
    ) => {
      const statements = build(testDb);
      if (statements.length)
        await testDb.batch(
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- nonempty D1-compatible query builders execute atomically in the SQLite fixture
          statements as unknown as [BatchStatement, ...BatchStatement[]],
        );
    },
  }));
  await client.executeMultiple(
    [
      "PRAGMA foreign_keys = ON;",
      "CREATE TABLE projects (id text PRIMARY KEY, domain text, archived_at text);",
      "CREATE TABLE growth_runs (project_id text NOT NULL, id text NOT NULL, PRIMARY KEY(project_id,id));",
      "CREATE TABLE growth_signals (project_id text NOT NULL, id text NOT NULL, PRIMARY KEY(project_id,id));",
      "CREATE TABLE growth_recommendations (project_id text NOT NULL, id text NOT NULL, PRIMARY KEY(project_id,id));",
      "CREATE TABLE growth_actions (project_id text NOT NULL, id text NOT NULL, PRIMARY KEY(project_id,id));",
      "INSERT INTO projects (id,domain) VALUES ('project_1','example.com'),('project_2','other.example');",
      "INSERT INTO growth_signals VALUES ('project_1','signal_1'),('project_2','signal_2');",
      "INSERT INTO growth_recommendations VALUES ('project_1','recommendation_1'),('project_2','recommendation_2');",
      readFileSync("drizzle/0062_mixed_doctor_faustus.sql", "utf8"),
    ].join("\n"),
  );
  ({ GrowthAiBriefRepository: repository } =
    await import("../repositories/GrowthAiBriefRepository"));
});

afterAll(() => client.close());

describe.sequential("Growth AI brief SQLite persistence", () => {
  it("persists immutable generated evidence and replaces only the proposal step list", async () => {
    const saved = await repository.insertGenerated({
      projectId: "project_1",
      signalId: "signal_1",
      recommendationId: "recommendation_1",
      templateVersion: "priority-page-investigation-v1",
      title: "Investigate pricing",
      generated,
      model: "openrouter",
      promptVersion: "priority-page-investigation-v1",
    });
    expect(saved.generated).toMatchObject({
      proposedSteps: generated.proposedSteps,
      measurementApproach: generated.measurementApproach,
    });
    expect(
      saved.generated.citations.find((citation) => citation.id === "page")
        ?.snapshot,
    ).toBe("Pricing details");
    const edited = await repository.saveEdits({
      projectId: "project_1",
      briefId: saved.id,
      expectedVersion: 0,
      title: "Check pricing intent",
      proposedSteps: ["Interview prospects."],
      measurementApproach:
        "Measure matching-period clicks after a real change.",
    });
    expect(edited).toMatchObject({
      generated: {
        proposedSteps: generated.proposedSteps,
        measurementApproach: generated.measurementApproach,
      },
      proposal: {
        title: "Check pricing intent",
        proposedSteps: ["Interview prospects."],
        version: 1,
      },
    });
    const rows = await client.execute(
      "SELECT kind, count(*) AS count FROM growth_ai_brief_steps WHERE brief_id = '" +
        saved.id +
        "' GROUP BY kind ORDER BY kind",
    );
    expect(rows.rows).toEqual([
      { kind: "generated", count: 2 },
      { kind: "proposal", count: 1 },
    ]);
  });

  it("keeps every read project-scoped and rejects a forged source relation", async () => {
    const saved = await repository.getBySignal({
      projectId: "project_1",
      signalId: "signal_1",
    });
    expect(saved).not.toBeNull();
    await expect(
      repository.getById("project_2", saved!.id),
    ).resolves.toBeNull();
    await expect(
      repository.insertGenerated({
        projectId: "project_2",
        signalId: "signal_2",
        recommendationId: "recommendation_1",
        templateVersion: "priority-page-investigation-v1",
        title: "Forged",
        generated,
        model: "openrouter",
        promptVersion: "v1",
      }),
    ).rejects.toBeTruthy();
    expect(
      (
        await client.execute(
          "SELECT count(*) AS count FROM growth_ai_briefs WHERE project_id = 'project_2'",
        )
      ).rows,
    ).toEqual([{ count: 0 }]);
  });

  it("does not let a stale save replace proposal steps", async () => {
    const saved = (await repository.getBySignal({
      projectId: "project_1",
      signalId: "signal_1",
    }))!;
    const stale = await repository.saveEdits({
      projectId: "project_1",
      briefId: saved.id,
      expectedVersion: 0,
      title: "Stale",
      proposedSteps: ["Wrong write"],
      measurementApproach: "Wrong",
    });
    expect(stale?.proposal).toMatchObject({
      title: "Check pricing intent",
      proposedSteps: ["Interview prospects."],
      version: 1,
    });
  });
});
