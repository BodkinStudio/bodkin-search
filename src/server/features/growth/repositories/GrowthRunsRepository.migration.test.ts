import { readFileSync } from "node:fs";
import { createClient } from "@libsql/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let client: ReturnType<typeof createClient>;

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  await client.executeMultiple(
    [
      "PRAGMA foreign_keys = ON;",
      "CREATE TABLE projects (id text PRIMARY KEY);",
      "INSERT INTO projects (id) VALUES ('proj_legacy'), ('project_1'), ('project_2');",
      ...readFileSync("drizzle/0042_project_memory.sql", "utf8")
        .split("--> statement-breakpoint")
        .filter((statement) => !statement.includes("DROP TABLE")),
      `INSERT INTO project_key_pages (id, project_id, url, role, topic, notes, updated_at, updated_by)
       VALUES ('page_legacy', 'proj_legacy', 'https://acme.com/legacy', 'money', NULL, NULL, '2026-08-01T00:00:00.000Z', 'user');`,
      readFileSync("drizzle/0043_wild_proteus.sql", "utf8"),
      readFileSync("drizzle/0044_glossy_komodo.sql", "utf8"),
    ].join("\n"),
  );
});

afterAll(() => client.close());

async function insertRun(projectId: string, id: string, slot: string) {
  await client.execute({
    sql: `INSERT INTO growth_runs (
      id, project_id, run_type, trigger, status, cadence_slot, period_start,
      period_end, started_at, detector_version
    ) VALUES (?, ?, 'daily_monitor', 'manual', 'running', ?, '2026-08-01',
      '2026-08-29', '2026-08-29T10:00:00.000Z', 'v1')`,
    args: [id, projectId, slot],
  });
}

describe("Growth runs D1 migration", () => {
  it("enforces project-scoped slots, run checks and composite Signal tenancy", async () => {
    await insertRun("project_1", "run_1", "slot_1");
    await expect(insertRun("project_1", "run_2", "slot_1")).rejects.toThrow();
    await expect(
      insertRun("project_2", "run_2", "slot_1"),
    ).resolves.toBeUndefined();
    await expect(
      client.execute(`INSERT INTO growth_runs (
        id, project_id, run_type, trigger, status, cadence_slot, period_start,
        period_end, started_at, detector_version, failure_code, failure_message
      ) VALUES ('bad_completion', 'project_1', 'weekly_review', 'manual',
        'completed', 'bad', '2026-08-01', '2026-08-29', 'now', 'v1', 'x', 'x')`),
    ).rejects.toThrow();
    await expect(
      client.execute(`INSERT INTO growth_runs (
        id, project_id, run_type, trigger, status, cadence_slot, period_start,
        period_end, started_at, detector_version, provider_cost_minor
      ) VALUES ('fractional_cost', 'project_1', 'daily_monitor', 'manual', 'running',
        'fractional', '2026-08-01', '2026-08-29', 'now', 'v1', 1.5)`),
    ).rejects.toThrow();
    await expect(
      client.execute(`INSERT INTO growth_runs (
        id, project_id, run_type, trigger, status, cadence_slot, period_start,
        period_end, started_at, completed_at, detector_version
      ) VALUES ('running_completed', 'project_1', 'daily_monitor', 'manual',
        'running', 'running_completed', '2026-08-01', '2026-08-29',
        '2026-08-29T10:00:00.000Z', '2026-08-29T10:01:00.000Z', 'v1')`),
    ).rejects.toThrow();
    await expect(
      client.execute(`INSERT INTO growth_runs (
        id, project_id, run_type, trigger, status, cadence_slot, period_start,
        period_end, started_at, detector_version
      ) VALUES ('reversed', 'project_1', 'daily_monitor', 'manual', 'running',
        'reversed', '2026-08-29', '2026-08-01', 'now', 'v1')`),
    ).rejects.toThrow();
    await expect(
      client.execute(`INSERT INTO growth_runs (
        id, project_id, run_type, trigger, status, cadence_slot, period_start,
        period_end, started_at, detector_version, provider_cost_minor
      ) VALUES ('negative_cost', 'project_1', 'daily_monitor', 'manual', 'running',
        'negative', '2026-08-01', '2026-08-29', 'now', 'v1', -1)`),
    ).rejects.toThrow();
    await client.execute(`INSERT INTO growth_runs (
      id, project_id, run_type, trigger, status, cadence_slot, period_start,
      period_end, started_at, detector_version, provider_cost_minor
    ) VALUES ('zero_cost', 'project_1', 'daily_monitor', 'manual', 'running',
      'zero', '2026-08-01', '2026-08-29', 'now', 'v1', 0)`);
    const [zeroCost] = (
      await client.execute(`SELECT provider_cost_minor AS cost,
        typeof(provider_cost_minor) AS storage_type
        FROM growth_runs WHERE id = 'zero_cost'`)
    ).rows;
    expect(zeroCost).toMatchObject({ cost: 0, storage_type: "integer" });
    const [nullCost] = (
      await client.execute(`SELECT provider_cost_minor AS cost
        FROM growth_runs WHERE id = 'run_1'`)
    ).rows;
    expect(nullCost).toMatchObject({ cost: null });
    await expect(
      client.execute(`INSERT INTO growth_signals (
        id, project_id, run_id, signal_type, entity_type, entity_ref, metric,
        severity, confidence, period_start, period_end, baseline_value,
        current_value, delta_value, evidence_kind, evidence_ref, captured_at
      ) VALUES ('cross_project', 'project_2', 'run_1', 'page_clicks_down',
        'page', 'https://example.test/', 'clicks', 'warning', 0.5,
        '2026-08-01', '2026-08-29', 2, 1, -1, 'gsc_period', 'gsc:1', 'now')`),
    ).rejects.toThrow();
    for (const [id, severity, confidence, evidenceKind] of [
      ["bad_confidence", "warning", 2, "gsc_period"],
      ["bad_severity", "invalid", 0.5, "gsc_period"],
      ["bad_evidence", "warning", 0.5, "raw_payload"],
    ]) {
      await expect(
        client.execute({
          sql: `INSERT INTO growth_signals (
            id, project_id, run_id, signal_type, entity_type, entity_ref, metric,
            severity, confidence, period_start, period_end, baseline_value,
            current_value, delta_value, evidence_kind, evidence_ref, captured_at
          ) VALUES (?, 'project_1', 'run_1', 'page_clicks_down', 'page',
            'https://example.test/', 'clicks', ?, ?, '2026-08-01', '2026-08-29',
            2, 1, -1, ?, 'gsc:1', 'now')`,
          args: [id, severity, confidence, evidenceKind],
        }),
      ).rejects.toThrow();
    }
  });

  it("cascades the run and Signal with its project and leaves other projects intact", async () => {
    await client.execute(`INSERT INTO growth_signals (
      id, project_id, run_id, signal_type, entity_type, entity_ref, metric,
      severity, confidence, period_start, period_end, baseline_value,
      current_value, delta_value, evidence_kind, evidence_ref, captured_at
    ) VALUES ('signal_1', 'project_1', 'run_1', 'page_clicks_down', 'page',
      'https://example.test/', 'clicks', 'warning', 0.5, '2026-08-01',
      '2026-08-29', 2, 1, -1, 'gsc_period', 'gsc:1', 'now')`);
    await client.execute("DELETE FROM projects WHERE id = 'project_1'");
    expect(
      (await client.execute("SELECT * FROM growth_runs WHERE id = 'run_1'"))
        .rows,
    ).toHaveLength(0);
    expect(
      (
        await client.execute(
          "SELECT * FROM growth_signals WHERE id = 'signal_1'",
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (await client.execute("SELECT * FROM growth_runs WHERE id = 'run_2'"))
        .rows,
    ).toHaveLength(1);
    expect(
      (await client.execute("PRAGMA foreign_key_check")).rows,
    ).toHaveLength(0);
  });
});
