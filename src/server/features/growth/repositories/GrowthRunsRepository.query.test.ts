import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type * as RepositoryModule from "./GrowthRunsRepository";

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));

let client: Client;
let GrowthRunsRepository: typeof RepositoryModule.GrowthRunsRepository;

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  const testDb = drizzle(client);
  vi.doMock("@/db", () => ({ db: testDb }));
  await client.executeMultiple(
    [
      "PRAGMA foreign_keys = ON;",
      "CREATE TABLE projects (id text PRIMARY KEY, archived_at text);",
      "INSERT INTO projects (id) VALUES ('proj_legacy'), ('project_1'), ('project_2');",
      ...readFileSync("drizzle/0042_project_memory.sql", "utf8")
        .split("--> statement-breakpoint")
        .filter((statement) => !statement.includes("DROP TABLE")),
      `INSERT INTO project_key_pages (id, project_id, url, role, topic, notes, updated_at, updated_by)
       VALUES ('page_legacy', 'proj_legacy', 'https://acme.com/legacy', 'money', NULL, NULL, '2026-08-01T00:00:00.000Z', 'user');`,
      readFileSync("drizzle/0043_wild_proteus.sql", "utf8"),
      readFileSync("drizzle/0044_glossy_komodo.sql", "utf8"),
      readFileSync("drizzle/0053_sweet_ben_grimm.sql", "utf8"),
      readFileSync("drizzle/0054_simple_sunspot.sql", "utf8"),
      readFileSync("drizzle/0055_lying_rick_jones.sql", "utf8"),
    ].join("\n"),
  );
  ({ GrowthRunsRepository } = await import("./GrowthRunsRepository"));
  await client.executeMultiple(`
    INSERT INTO growth_runs (id, project_id, run_type, trigger, status, cadence_slot, period_start, period_end, started_at, detector_version)
    VALUES ('run_1', 'project_1', 'daily_monitor', 'manual', 'running', 'one', '2026-08-01', '2026-08-29', '2026-08-29T10:00:00.000Z', 'v1');
    INSERT INTO growth_runs (id, project_id, run_type, trigger, status, cadence_slot, period_start, period_end, started_at, detector_version)
    VALUES ('run_2', 'project_2', 'daily_monitor', 'manual', 'running', 'one', '2026-08-01', '2026-08-29', '2026-08-29T10:00:00.000Z', 'v1');
    INSERT INTO growth_signals (id, project_id, run_id, signal_type, entity_type, entity_ref, metric, severity, confidence, period_start, period_end, baseline_value, current_value, delta_value, evidence_kind, evidence_ref, captured_at)
    VALUES ('signal_1', 'project_1', 'run_1', 'page_clicks_down', 'page', 'https://example.test/', 'clicks', 'warning', 0.5, '2026-08-01', '2026-08-29', 2, 1, -1, 'gsc_period', 'gsc:one', '2026-08-29T10:00:00.000Z');
  `);
});

afterAll(() => client.close());

describe("GrowthRunsRepository project-scoped reads", () => {
  it("does not expose another project's runs or Signals", async () => {
    await expect(
      GrowthRunsRepository.getRun("project_2", "run_1"),
    ).resolves.toBeNull();
    await expect(GrowthRunsRepository.listRuns("project_1")).resolves.toEqual([
      expect.objectContaining({ id: "run_1", projectId: "project_1" }),
    ]);
    await expect(
      GrowthRunsRepository.listSignals("project_1", "run_1"),
    ).resolves.toEqual([
      expect.objectContaining({
        id: "signal_1",
        projectId: "project_1",
        runId: "run_1",
      }),
    ]);
    await expect(
      GrowthRunsRepository.listSignals("project_2", "run_1"),
    ).resolves.toEqual([]);
  });

  it("records a Signal from the running-run SELECT in one statement", async () => {
    const input = {
      projectId: "project_1",
      runId: "run_1",
      signalType: "page_clicks_down",
      entityType: "page",
      entityRef: "https://example.test/new",
      metric: "clicks",
      severity: "warning" as const,
      confidence: 0.5,
      periodStart: "2026-08-01",
      periodEnd: "2026-08-29",
      baselineValue: 2,
      currentValue: 1,
      deltaValue: -1,
      deltaPercent: null,
      evidenceKind: "manual_observation" as const,
      evidenceRef: "manual:new",
      capturedAt: "2026-08-29T10:00:00.000Z",
    };
    await GrowthRunsRepository.tryRecordSignalWhileRunIsRunning(
      input,
      "signal_from_select",
    );
    await expect(
      GrowthRunsRepository.getSignal("project_1", "signal_from_select"),
    ).resolves.toEqual(expect.objectContaining({ runId: "run_1" }));

    await GrowthRunsRepository.tryRecordSignalWhileRunIsRunning(
      { ...input, currentValue: 999 },
      "signal_from_select",
    );
    await expect(
      GrowthRunsRepository.getSignal("project_1", "signal_from_select"),
    ).resolves.toEqual(expect.objectContaining({ currentValue: 1 }));

    await client.execute(`UPDATE growth_runs
      SET status = 'completed', completed_at = '2026-08-29T10:01:00.000Z'
      WHERE id = 'run_1'`);
    await GrowthRunsRepository.tryRecordSignalWhileRunIsRunning(
      { ...input, entityRef: "https://example.test/terminal" },
      "terminal_signal",
    );
    await expect(
      GrowthRunsRepository.getSignal("project_1", "terminal_signal"),
    ).resolves.toBeNull();
  });

  it("creates a scheduled Run only from the exact enabled revision of an unarchived project", async () => {
    await client.execute(`
      INSERT INTO growth_project_settings (
        project_id, growth_enabled, report_timezone, report_cadence,
        report_day, created_at, updated_at
      ) VALUES (
        'project_1', 1, 'UTC', 'monthly', 5,
        '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z'
      )
    `);
    const creation = {
      projectId: "project_1",
      runType: "monthly_review" as const,
      cadenceSlot: "monthly-review:scheduled:2026-08-01:2026-08-31",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      detectorVersion: "growth-monthly-review-v1",
    };

    await expect(
      GrowthRunsRepository.tryCreateScheduledRun(
        creation,
        "scheduled_run_1",
        1,
        "monthly",
      ),
    ).resolves.toBe(true);
    await expect(
      GrowthRunsRepository.getRun("project_1", "scheduled_run_1"),
    ).resolves.toEqual(
      expect.objectContaining({ trigger: "scheduled", status: "running" }),
    );

    await client.execute(
      "UPDATE growth_project_settings SET settings_revision = 2 WHERE project_id = 'project_1'",
    );
    await expect(
      GrowthRunsRepository.tryCreateScheduledRun(
        { ...creation, cadenceSlot: `${creation.cadenceSlot}:drift` },
        "scheduled_run_drift",
        1,
        "monthly",
      ),
    ).resolves.toBe(false);
    await expect(
      GrowthRunsRepository.getRun("project_1", "scheduled_run_drift"),
    ).resolves.toBeNull();

    await client.execute(
      "UPDATE projects SET archived_at = '2026-08-02T00:00:00.000Z' WHERE id = 'project_1'",
    );
    await expect(
      GrowthRunsRepository.tryCreateScheduledRun(
        { ...creation, cadenceSlot: `${creation.cadenceSlot}:archived` },
        "scheduled_run_archived",
        2,
        "monthly",
      ),
    ).resolves.toBe(false);
    await expect(
      GrowthRunsRepository.getRun("project_1", "scheduled_run_archived"),
    ).resolves.toBeNull();

    await client.execute(
      "UPDATE projects SET archived_at = NULL WHERE id = 'project_1'",
    );
    await client.execute(
      "UPDATE growth_project_settings SET report_cadence = 'weekly', report_day = 1 WHERE project_id = 'project_1'",
    );
    await expect(
      GrowthRunsRepository.tryCreateScheduledRun(
        {
          ...creation,
          runType: "weekly_review",
          cadenceSlot: "weekly-review:scheduled:2026-08-31:2026-09-06",
          periodStart: "2026-08-31",
          periodEnd: "2026-09-06",
        },
        "scheduled_weekly_run",
        2,
        "weekly",
      ),
    ).resolves.toBe(true);
  });
});
