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
  vi.doMock("@/db", () => ({ db: drizzle(client) }));
  await client.executeMultiple(
    [
      "PRAGMA foreign_keys = ON;",
      "CREATE TABLE projects (id text PRIMARY KEY);",
      "INSERT INTO projects (id) VALUES ('project_1');",
      `CREATE TABLE gsc_connections (
      id text PRIMARY KEY, project_id text NOT NULL UNIQUE, organization_id text NOT NULL,
      site_url text NOT NULL, connected_by_user_id text NOT NULL, gsc_account_id text,
      connected_account_email text, created_at text NOT NULL, updated_at text NOT NULL
    );`,
      `INSERT INTO gsc_connections VALUES ('connection_1', 'project_1', 'organization_1', 'sc-domain:example.test', 'user_1', 'account_1', NULL, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');`,
      ...readFileSync("drizzle/0042_project_memory.sql", "utf8")
        .split("--> statement-breakpoint")
        .filter((statement) => !statement.includes("DROP TABLE")),
      readFileSync("drizzle/0043_wild_proteus.sql", "utf8"),
      readFileSync("drizzle/0044_glossy_komodo.sql", "utf8"),
      `INSERT INTO project_key_pages (id, project_id, url, role, topic, notes, commercial_weight, protected, actively_optimized, updated_at, updated_by)
     VALUES ('key_pricing', 'project_1', 'https://example.test/pricing', 'money', NULL, NULL, 3, false, false, '2026-01-01T00:00:00.000Z', 'user');`,
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
            keys: ["https://example.test/pricing", day],
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
            siteUrl: "sc-domain:example.test",
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

    const replay = await service.runCheck({
      projectId: "project_1",
      requestKey: "retry_1",
    });
    expect(replay).toMatchObject({ replayed: true, run: { id: first.run.id } });
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
                    keys: ["https://example.test/pricing", day],
                    clicks: index < 28 ? 11 : 5,
                    impressions: 100,
                  }))
              : dates.map((day) => ({
                  keys: [day],
                  clicks: 500,
                  impressions: 5_000,
                }));
          return {
            siteUrl: "sc-domain:example.test",
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
  });
});
