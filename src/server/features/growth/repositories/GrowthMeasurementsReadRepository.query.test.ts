import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { growthMeasurementsRequestSchema } from "@/types/schemas/growth-measurements-list";
import type * as RepositoryModule from "./GrowthMeasurementsReadRepository";

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));

let client: Client;
let repository: typeof RepositoryModule.GrowthMeasurementsReadRepository;
const plan = (
  id: string,
  project = "project_1",
  status = "active",
  created = "2026-08-20 09:00:00",
) =>
  `('${id}','${project}','action_${id}','${status}',3,'2026-08-01T00:00:00.000Z','2026-08-01','UTC','2026-07-01','2026-07-31','2026-08-01','2026-08-02','2026-08-31',NULL,'preceding_period',NULL,'${created}')`;
const action = (id: string, project = "project_1") =>
  `('action_${id}','${project}','Title ${id}','measuring',3)`;

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  vi.doMock("@/db", () => ({ db: drizzle(client) }));
  await client.executeMultiple(`
    CREATE TABLE growth_measurement_plans (id text PRIMARY KEY, project_id text NOT NULL, action_id text NOT NULL, status text NOT NULL, action_version integer NOT NULL, anchor_at text NOT NULL, anchor_date text NOT NULL, report_timezone text NOT NULL, baseline_start text NOT NULL, baseline_end text NOT NULL, cooldown_end text NOT NULL, measurement_start text NOT NULL, measurement_end text NOT NULL, long_measurement_end text, comparison_mode text NOT NULL, completed_at text, created_at text NOT NULL);
    CREATE TABLE growth_actions (id text PRIMARY KEY, project_id text NOT NULL, title text NOT NULL, status text NOT NULL, state_version integer NOT NULL);
    CREATE TABLE growth_measurement_metrics (id text PRIMARY KEY, project_id text NOT NULL, measurement_plan_id text NOT NULL, is_primary integer NOT NULL);
    CREATE TABLE growth_measurement_results (id text PRIMARY KEY, project_id text NOT NULL, measurement_plan_id text NOT NULL, outcome text NOT NULL, confidence real NOT NULL, summary text NOT NULL, evaluated_at text NOT NULL);
    INSERT INTO growth_measurement_plans VALUES ${plan("plan_z")},${plan("plan_a")},${plan("plan_old", "project_1", "completed", "2026-08-19 09:00:00")},${plan("plan_foreign", "project_2", "active", "2026-08-21 09:00:00")};
    INSERT INTO growth_actions VALUES ${action("plan_z")},${action("plan_a")},${action("plan_old")},${action("plan_foreign", "project_2")};
    INSERT INTO growth_measurement_metrics VALUES ('metric_z','project_1','plan_z',1),('metric_a','project_1','plan_a',1),('metric_old','project_1','plan_old',1),('metric_foreign','project_2','plan_z',1);
    INSERT INTO growth_measurement_results VALUES ('result_foreign','project_2','plan_z','positive',.5,'foreign','2026-08-01T00:00:00.000Z');
  `);
  ({ GrowthMeasurementsReadRepository: repository } =
    await import("./GrowthMeasurementsReadRepository"));
});
afterAll(() => client.close());

describe("GrowthMeasurementsReadRepository SQLite/D1", () => {
  it("normalizes default timestamps and uses binary ID ties without repeating or skipping", async () => {
    const first = await repository.listMeasurementPlansPage({
      projectId: "project_1",
      limit: 1,
    });
    expect(first.map((row) => row.id)).toEqual(["plan_z", "plan_a"]);
    const second = await repository.listMeasurementPlansPage(
      growthMeasurementsRequestSchema.parse({
        projectId: "project_1",
        limit: 50,
        cursor: { createdAt: "2026-08-20T10:00:00+01:00", id: "plan_z" },
      }),
    );
    expect(second.map((row) => row.id)).toEqual(["plan_a", "plan_old"]);
  });

  it("filters status before limit and keeps the Action join project-qualified", async () => {
    const rows = await repository.listMeasurementPlansPage({
      projectId: "project_1",
      statuses: ["completed"],
      limit: 1,
    });
    expect(rows.map((row) => row.id)).toEqual(["plan_old"]);
    expect(rows[0]?.actionTitle).toBe("Title plan_old");
  });

  it("keeps Metric and Result reads project-leading and bounds Metrics per parent", async () => {
    await client.executeMultiple(`
      INSERT INTO growth_measurement_metrics VALUES ${Array.from({ length: 51 }, (_, index) => `('many_${String(index).padStart(2, "0")}','project_1','plan_a',${index === 0 ? 1 : 0})`).join(",")};
      INSERT INTO growth_measurement_results VALUES ('result_local','project_1','plan_a','positive',.8,'local','2026-08-01T00:00:00.000Z');
    `);
    const metrics = await repository.listMetricsForMeasurementPlans(
      "project_1",
      ["plan_z", "plan_a", "plan_foreign"],
    );
    expect(
      metrics.filter((row) => row.measurementPlanId === "plan_a"),
    ).toHaveLength(51);
    expect(
      metrics.filter((row) => row.measurementPlanId === "plan_z"),
    ).toHaveLength(1);
    expect(
      metrics.some((row) => row.measurementPlanId === "plan_foreign"),
    ).toBe(false);
    await expect(
      repository.listResultsForMeasurementPlans("project_1", [
        "plan_a",
        "plan_z",
        "plan_foreign",
      ]),
    ).resolves.toEqual([
      expect.objectContaining({
        measurementPlanId: "plan_a",
        summary: "local",
      }),
    ]);
  });
});
