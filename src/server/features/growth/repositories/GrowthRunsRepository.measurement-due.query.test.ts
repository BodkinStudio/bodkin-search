import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type * as RepositoryModule from "./GrowthRunsRepository";

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));

let client: Client;
let repository: typeof RepositoryModule.GrowthRunsRepository;

const signal = {
  projectId: "project_1",
  runId: "run_1",
  signalType: "action_measurement_due",
  entityType: "growth_action",
  entityRef: "action_1",
  metric: "measurement_review_due",
  severity: "info" as const,
  confidence: 1,
  periodStart: "2026-09-01",
  periodEnd: "2026-09-01",
  baselineValue: 0,
  currentValue: 1,
  deltaValue: 1,
  deltaPercent: null,
  evidenceKind: "manual_observation" as const,
  evidenceRef: "manual_observation:v1:measurement_due:plan_1:1:2026-09-04",
  capturedAt: "2026-09-04T07:00:00.000Z",
};
const eligibility = {
  measurementPlanId: "plan_1",
  actionId: "action_1",
  actionVersion: 1,
};

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  const testDb = drizzle(client);
  vi.doMock("@/db", () => ({ db: testDb }));
  await client.executeMultiple(
    [
      "PRAGMA foreign_keys = ON;",
      "CREATE TABLE projects (id text PRIMARY KEY);",
      "INSERT INTO projects (id) VALUES ('project_1');",
      readFileSync("drizzle/0044_glossy_komodo.sql", "utf8"),
      `CREATE TABLE growth_actions (
        id text PRIMARY KEY NOT NULL,
        project_id text NOT NULL,
        status text NOT NULL,
        state_version integer NOT NULL
      );`,
      `CREATE TABLE growth_measurement_plans (
        id text PRIMARY KEY NOT NULL,
        project_id text NOT NULL,
        action_id text NOT NULL,
        status text NOT NULL,
        action_version integer NOT NULL
      );`,
      `INSERT INTO growth_runs (
        id, project_id, run_type, trigger, status, cadence_slot, period_start,
        period_end, started_at, detector_version
      ) VALUES (
        'run_1', 'project_1', 'measurement_review', 'manual', 'running',
        'measurement-due-check:key', '2026-09-04', '2026-09-04',
        '2026-09-04T07:00:00.000Z', 'measurement-due-v1'
      );`,
      `INSERT INTO growth_actions (id, project_id, status, state_version)
       VALUES ('action_1', 'project_1', 'measuring', 1);`,
      `INSERT INTO growth_measurement_plans (
        id, project_id, action_id, status, action_version
      ) VALUES ('plan_1', 'project_1', 'action_1', 'active', 1);`,
    ].join("\n"),
  );
  ({ GrowthRunsRepository: repository } =
    await import("./GrowthRunsRepository"));
});

afterAll(() => client.close());

describe("GrowthRunsRepository measurement-due eligibility", () => {
  it("checks the active Plan and exact measuring Action version in the insert", async () => {
    await repository.tryRecordMeasurementDueSignalWhileEligible(
      signal,
      "eligible_signal",
      eligibility,
    );
    await expect(
      repository.getSignal("project_1", "eligible_signal"),
    ).resolves.toMatchObject({
      signalType: "action_measurement_due",
      entityRef: "action_1",
    });

    await client.execute(`UPDATE growth_actions
      SET status = 'evaluated', state_version = 2
      WHERE id = 'action_1'`);
    await repository.tryRecordMeasurementDueSignalWhileEligible(
      signal,
      "stale_action_signal",
      eligibility,
    );
    await expect(
      repository.getSignal("project_1", "stale_action_signal"),
    ).resolves.toBeNull();
  });
});
