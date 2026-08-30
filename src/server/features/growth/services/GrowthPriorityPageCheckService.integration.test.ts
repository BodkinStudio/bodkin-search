import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { GrowthPriorityPageCheckService } from "./GrowthPriorityPageCheckService";

const mocks = vi.hoisted(() => ({ getPerformance: vi.fn() }));
vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
vi.mock("@/server/features/gsc/services/GscService", () => ({
  GscService: { getPerformance: mocks.getPerformance },
}));

let client: Client;
let service: typeof GrowthPriorityPageCheckService;

function calendarDates(start: string, end: string) {
  const dates: string[] = [];
  for (
    let day = new Date(`${start}T00:00:00.000Z`);
    day <= new Date(`${end}T00:00:00.000Z`);
    day.setUTCDate(day.getUTCDate() + 1)
  )
    dates.push(day.toISOString().slice(0, 10));
  return dates;
}

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
      "INSERT INTO user (id) VALUES ('reviewer_1'), ('reviewer_2');",
      "INSERT INTO projects (id, domain) VALUES ('project_1', 'example.com');",
      `CREATE TABLE gsc_connections (
      id text PRIMARY KEY, project_id text NOT NULL UNIQUE, organization_id text NOT NULL,
      site_url text NOT NULL, connected_by_user_id text NOT NULL, gsc_account_id text,
      connected_account_email text, created_at text NOT NULL, updated_at text NOT NULL
    );`,
      `INSERT INTO gsc_connections VALUES ('connection_1', 'project_1', 'organization_1', 'sc-domain:example.com', 'user_1', 'account_1', NULL, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');`,
      ...readFileSync("drizzle/0042_project_memory.sql", "utf8")
        .split("--> statement-breakpoint")
        .filter((statement) => !statement.includes("DROP TABLE")),
      readFileSync("drizzle/0043_wild_proteus.sql", "utf8"),
      readFileSync("drizzle/0044_glossy_komodo.sql", "utf8"),
      readFileSync("drizzle/0045_mean_retro_girl.sql", "utf8"),
      readFileSync("drizzle/0046_living_misty_knight.sql", "utf8"),
      `INSERT INTO project_key_pages (id, project_id, url, role, topic, notes, commercial_weight, protected, actively_optimized, updated_at, updated_by)
     VALUES ('key_pricing', 'project_1', 'https://example.com/pricing', 'money', NULL, NULL, 3, false, false, '2026-01-01T00:00:00.000Z', 'user');`,
    ].join("\n"),
  );
  ({ GrowthPriorityPageCheckService: service } =
    await import("./GrowthPriorityPageCheckService"));
});

afterAll(() => client.close());

describe("GrowthPriorityPageCheckService SQLite integration", () => {
  it("persists a successful check and reloads its numeric evidence without recollecting a replay", async () => {
    mocks.getPerformance
      .mockReset()
      .mockImplementation(
        (request: {
          startDate: string;
          endDate: string;
          dimensions: string[];
          startRow?: number;
        }) => {
          const dates = calendarDates(request.startDate, request.endDate);
          const pageRows = dates.map((day) => ({
            keys: ["https://example.com/pricing", day],
            clicks: day < "9999-01-01" ? 10 : 0,
            impressions: 100,
          }));
          // The check's two source windows are intentionally made to decline.
          for (const row of pageRows)
            row.clicks = row.keys[1] < dates[28] ? 11 : 5;
          const rows =
            request.dimensions.join(",") === "page,date"
              ? request.startRow
                ? []
                : pageRows
              : dates.map((day) => ({
                  keys: [day],
                  clicks: 500,
                  impressions: 5_000,
                }));
          return {
            siteUrl: "sc-domain:example.com",
            connectedBy: null,
            request: {
              ...request,
              rowLimit: 1000,
              startRow: request.startRow || undefined,
              type: "web",
              dataState: "final",
            },
            rows,
          };
        },
      );

    const first = await service.runCheck({
      projectId: "project_1",
      requestKey: "retry_1",
    });
    expect(first).toMatchObject({
      replayed: false,
      run: { status: "completed" },
    });
    expect(mocks.getPerformance).toHaveBeenCalledTimes(3);

    const reloaded = await service.getRunDetail("project_1", first.run.id);
    expect(reloaded.signals).toEqual([
      expect.objectContaining({
        baselineValue: 308,
        currentValue: 140,
        deltaValue: -168,
      }),
    ]);
    const rows = await client.execute(
      "SELECT status, baseline_value, current_value FROM growth_runs LEFT JOIN growth_signals ON growth_signals.run_id = growth_runs.id WHERE growth_runs.id = '" +
        first.run.id +
        "'",
    );
    expect(rows.rows).toEqual([
      expect.objectContaining({
        status: "completed",
        baseline_value: 308,
        current_value: 140,
      }),
    ]);
    expect(
      (
        await client.execute(
          "SELECT analysis_version FROM growth_runs WHERE id = '" +
            first.run.id +
            "'",
        )
      ).rows,
    ).toEqual([
      expect.objectContaining({
        analysis_version: "priority-page-investigation-v1",
      }),
    ]);
    expect(
      (
        await client.execute(
          "SELECT count(*) AS count FROM growth_recommendations WHERE run_id = '" +
            first.run.id +
            "'",
        )
      ).rows,
    ).toEqual([expect.objectContaining({ count: 1 })]);

    const replay = await service.runCheck({
      projectId: "project_1",
      requestKey: "retry_1",
    });
    expect(replay).toMatchObject({ replayed: true, run: { id: first.run.id } });
    expect(mocks.getPerformance).toHaveBeenCalledTimes(3);

    const { GrowthInvestigationsService: investigations } =
      await import("./GrowthInvestigationsService");
    const signalId = reloaded.signals[0].id;
    await expect(
      investigations.getInvestigation("project_1", signalId),
    ).resolves.toMatchObject({ status: "proposed", actionId: null });
    const input = {
      projectId: "project_1",
      signalId,
      dueOn: "2026-09-04",
      actorId: "reviewer_1",
    };
    const approval = await investigations.approveInvestigation(input);
    expect(approval).toMatchObject({
      status: "approved",
      dueOn: "2026-09-04",
      runId: first.run.id,
      displayUrls: ["https://example.com/pricing"],
    });
    await expect(
      investigations.approveInvestigation({ ...input, actorId: "reviewer_2" }),
    ).resolves.toEqual(approval);
    await expect(
      investigations.approveInvestigation({ ...input, dueOn: "2026-09-05" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      investigations.approveInvestigation({ ...input, projectId: "foreign" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      investigations.getInvestigation("project_1", signalId),
    ).resolves.toMatchObject({
      status: "accepted",
      actionId: approval.id,
      dueOn: "2026-09-04",
    });
    const events = await client.execute(
      "SELECT actor_id, event_type FROM growth_action_events",
    );
    expect(events.rows).toEqual([
      { actor_id: "reviewer_1", event_type: "created" },
    ]);
    const statusInput = {
      projectId: "project_1",
      actionId: approval.id,
      expectedStatus: "approved" as const,
      expectedVersion: 0,
      status: "ready" as const,
      note: "Ready for delivery",
      actorId: "reviewer_1",
    };
    const status = await investigations.updateWorkStatus(statusInput);
    expect(status).toMatchObject({ status: "ready", stateVersion: 1 });
    await expect(investigations.updateWorkStatus(statusInput)).resolves.toEqual(
      status,
    );
    await expect(
      investigations.updateWorkStatus({
        ...statusInput,
        note: "Changed retry note",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      investigations.updateWorkStatus({
        ...statusInput,
        actorId: "reviewer_2",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      investigations.getWorkHistory("project_1", approval.id),
    ).resolves.toEqual({
      actionId: approval.id,
      limit: 50,
      events: [
        expect.objectContaining({
          version: 1,
          eventType: "status_changed",
          fromStatus: "approved",
          toStatus: "ready",
          note: "Ready for delivery",
        }),
        expect.objectContaining({
          version: 0,
          eventType: "created",
          fromStatus: null,
          toStatus: "approved",
        }),
      ],
    });
    const work = await investigations.getWork("project_1");
    expect(work.actions).toEqual([status]);
    expect((await investigations.getWork("foreign")).actions).toEqual([]);
    expect(mocks.getPerformance).toHaveBeenCalledTimes(3);
  });

  it("claims overlapping requests once and replays after setup removal", async () => {
    let releaseProvider!: () => void;
    const providerReleased = new Promise<void>((resolve) => {
      releaseProvider = resolve;
    });
    let providerStarted!: () => void;
    const firstProviderCall = new Promise<void>((resolve) => {
      providerStarted = resolve;
    });
    mocks.getPerformance
      .mockReset()
      .mockImplementation(
        async (request: {
          startDate: string;
          endDate: string;
          dimensions: string[];
          startRow?: number;
        }) => {
          if (
            request.dimensions.join(",") === "page,date" &&
            !request.startRow
          ) {
            providerStarted();
            await providerReleased;
          }
          const dates = calendarDates(request.startDate, request.endDate);
          const rows =
            request.dimensions.join(",") === "page,date"
              ? request.startRow
                ? []
                : dates.map((day, index) => ({
                    keys: ["https://example.com/pricing", day],
                    clicks: index < 28 ? 11 : 5,
                    impressions: 100,
                  }))
              : dates.map((day) => ({
                  keys: [day],
                  clicks: 500,
                  impressions: 5_000,
                }));
          return {
            siteUrl: "sc-domain:example.com",
            connectedBy: null,
            request: {
              ...request,
              rowLimit: 1000,
              startRow: request.startRow || undefined,
              type: "web",
              dataState: "final",
            },
            rows,
          };
        },
      );

    const first = service.runCheck({
      projectId: "project_1",
      requestKey: "overlap_1",
    });
    await firstProviderCall;
    const duplicate = await service.runCheck({
      projectId: "project_1",
      requestKey: "overlap_1",
    });
    expect(duplicate).toMatchObject({ replayed: true });
    expect(mocks.getPerformance).toHaveBeenCalledTimes(1);
    releaseProvider();
    const completed = await first;
    expect(completed).toMatchObject({ replayed: false });
    expect(
      (
        await client.execute(
          "SELECT count(*) AS count FROM growth_runs WHERE cadence_slot = 'priority-page-check:overlap_1'",
        )
      ).rows,
    ).toEqual([expect.objectContaining({ count: 1 })]);

    await client.execute(
      "DELETE FROM gsc_connections WHERE project_id = 'project_1'",
    );
    await client.execute(
      "DELETE FROM project_key_pages WHERE project_id = 'project_1'",
    );
    const replay = await service.runCheck({
      projectId: "project_1",
      requestKey: "overlap_1",
    });
    expect(replay).toMatchObject({
      replayed: true,
      run: { id: completed.run.id },
    });
    expect(mocks.getPerformance).toHaveBeenCalledTimes(3);
    const { GrowthInvestigationsService: investigations } =
      await import("./GrowthInvestigationsService");
    const savedWork = await investigations.getWork("project_1");
    expect(savedWork.actions).toHaveLength(1);
    expect(savedWork.actions[0].displayUrls).toEqual([
      "https://example.com/pricing",
    ]);
  });
});
