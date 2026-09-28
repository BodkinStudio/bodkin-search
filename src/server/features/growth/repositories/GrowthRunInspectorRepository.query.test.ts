import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type * as RepositoryModule from "./GrowthRunInspectorRepository";

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));

let client: Client;
let repository: typeof RepositoryModule.GrowthRunInspectorRepository;
const executedQueries: string[] = [];

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  vi.doMock("@/db", () => ({
    db: drizzle(client, {
      logger: {
        logQuery(query) {
          executedQueries.push(query);
        },
      },
    }),
  }));
  await client.executeMultiple(`
    CREATE TABLE growth_runs (
      id text PRIMARY KEY, project_id text NOT NULL, run_type text NOT NULL,
      trigger text NOT NULL, status text NOT NULL, cadence_slot text NOT NULL,
      period_start text NOT NULL, period_end text NOT NULL, started_at text NOT NULL,
      completed_at text, detector_version text NOT NULL, analysis_version text,
      model text, prompt_version text, provider_cost_minor integer,
      failure_code text, failure_message text
    );
    CREATE TABLE growth_signals (id text PRIMARY KEY, project_id text NOT NULL, run_id text NOT NULL);
    CREATE TABLE growth_insights (id text PRIMARY KEY, project_id text NOT NULL, run_id text NOT NULL);
    CREATE TABLE growth_recommendations (
      id text PRIMARY KEY, project_id text NOT NULL, run_id text NOT NULL,
      category text NOT NULL, status text NOT NULL, dismissal_reason text,
      created_at text NOT NULL
    );
    CREATE TABLE growth_reports (
      id text PRIMARY KEY, project_id text NOT NULL, report_type text NOT NULL,
      period_start text NOT NULL, period_end text NOT NULL, version integer NOT NULL,
      status text NOT NULL, report_timezone text NOT NULL, data_cutoff_at text NOT NULL,
      generated_at text NOT NULL, created_by_type text NOT NULL
    );
    CREATE TABLE growth_actions (id text PRIMARY KEY, project_id text NOT NULL, recommendation_id text NOT NULL);

    INSERT INTO growth_runs VALUES
      ('run_z','project_1','manual_analysis','manual','completed','slot_z','2026-08-01','2026-08-31','2026-09-02T00:00:00.000Z','2026-09-02T00:00:05.000Z','detector-v1','analysis-v1',NULL,NULL,12,NULL,NULL),
      ('run_a','project_1','weekly_review','scheduled','running','slot_a','2026-08-25','2026-08-31','2026-09-02T00:00:00.000Z',NULL,'weekly-v1',NULL,NULL,NULL,NULL,NULL,NULL),
      ('run_old','project_1','manual_analysis','manual','failed','slot_old','2026-07-01','2026-07-31','2026-08-01T00:00:00.000Z','2026-08-01T00:00:02.000Z','detector-v1',NULL,NULL,NULL,0,'FAILED','Safe failure'),
      ('run_foreign','project_2','manual_analysis','manual','completed','slot','2026-08-01','2026-08-31','2026-09-03T00:00:00.000Z','2026-09-03T00:00:01.000Z','detector-v1',NULL,NULL,NULL,NULL,NULL,NULL);
    INSERT INTO growth_runs VALUES
      ('monthly_b','project_1','monthly_review','scheduled','completed','monthly-review:scheduled:2026-08-01:2026-08-31','2026-08-01','2026-08-31','2026-07-04 01:00:00','2026-07-04T01:00:02.000Z','growth-monthly-review-v1',NULL,NULL,NULL,NULL,NULL,NULL),
      ('monthly_a','project_1','monthly_review','scheduled','failed','monthly-review:scheduled:2026-07-01:2026-07-31','2026-07-01','2026-07-31','2026-07-04T01:00:00.000Z','2026-07-04T01:00:02.000Z','growth-monthly-review-v1',NULL,NULL,NULL,NULL,'MONTHLY_REVIEW_FAILED','Saved monthly failure'),
      ('monthly_old','project_1','monthly_review','scheduled','completed','monthly-review:scheduled:2026-06-01:2026-06-30','2026-06-01','2026-06-30','2026-07-03T01:00:00.000Z','2026-07-03T01:00:02.000Z','growth-monthly-review-v1',NULL,NULL,NULL,NULL,NULL,NULL),
      ('monthly_foreign','project_2','monthly_review','scheduled','completed','monthly-review:scheduled:2026-08-01:2026-08-31','2026-08-01','2026-08-31','2026-07-05T01:00:00.000Z','2026-07-05T01:00:02.000Z','growth-monthly-review-v1',NULL,NULL,NULL,NULL,NULL,NULL),
      ('monthly_b_child','project_1','manual_analysis','scheduled','completed','priority-page-check:monthly_monthly_b','2026-08-01','2026-08-31','2026-07-04T01:00:03.000Z','2026-07-04T01:00:04.000Z','priority-page-click-decline-v1',NULL,NULL,NULL,NULL,NULL,NULL),
      ('monthly_wrong_child','project_1','manual_analysis','scheduled','completed','priority-page-check:monthly_monthly_a','2026-07-01','2026-07-31','2026-07-04T01:00:03.000Z','2026-07-04T01:00:04.000Z','wrong-detector-v1',NULL,NULL,NULL,NULL,NULL,NULL);
    INSERT INTO growth_signals VALUES
      ('signal_1','project_1','run_z'), ('signal_2','project_1','run_z'),
      ('signal_foreign','project_2','run_z');
    INSERT INTO growth_insights VALUES
      ('insight_1','project_1','run_z'), ('insight_2','project_1','run_z');
    INSERT INTO growth_recommendations VALUES
      ('recommendation_1','project_1','run_z','investigation','accepted',NULL,'2026-09-04T00:00:00.000Z'),
      ('recommendation_2','project_1','run_z','investigation','dismissed','irrelevant','2026-09-04T00:00:00.000Z'),
      ('recommendation_space_late','project_1','run_old','investigation','accepted',NULL,'2026-09-05 23:00:00'),
      ('recommendation_iso_early','project_1','run_old','investigation','accepted',NULL,'2026-09-05T01:00:00.000Z'),
      ('recommendation_tie_a','project_1','run_old','investigation','accepted',NULL,'2026-09-06T01:00:00.000Z'),
      ('recommendation_tie_z','project_1','run_old','investigation','accepted',NULL,'2026-09-06 01:00:00'),
      ('recommendation_old','project_1','run_old','investigation','proposed',NULL,'2026-08-01T00:00:00.000Z'),
      ('recommendation_weekly','project_1','run_a','investigation','accepted',NULL,'2026-09-05T00:00:00.000Z'),
      ('recommendation_foreign','project_2','run_z','investigation','accepted',NULL,'2026-09-06T00:00:00.000Z'),
      ('recommendation_foreign_real','project_2','run_foreign','investigation','accepted',NULL,'2026-09-06T00:00:00.000Z');
    INSERT INTO growth_recommendations VALUES
      ('monthly_accept','project_1','monthly_b_child','investigation','accepted',NULL,'2026-09-06T00:00:00.000Z'),
      ('monthly_duplicate','project_1','monthly_b_child','investigation','dismissed','duplicate','2026-09-06T00:00:00.000Z'),
      ('monthly_unresolved','project_1','monthly_b_child','investigation','proposed',NULL,'2026-09-06T00:00:00.000Z'),
      ('monthly_foreign_recommendation','project_2','monthly_b_child','investigation','accepted',NULL,'2026-09-06T00:00:00.000Z');
    INSERT INTO growth_reports VALUES
      ('report_exact','project_1','monthly','2026-08-01','2026-08-31',1,'draft','UTC','2026-09-04T01:00:00.000Z','2026-09-04T01:00:02.000Z','system'),
      ('report_wrong_version','project_1','monthly','2026-08-01','2026-08-31',2,'draft','UTC','2026-09-04T01:00:00.000Z','2026-09-04T01:00:02.000Z','system'),
      ('report_foreign','project_2','monthly','2026-08-01','2026-08-31',1,'draft','UTC','2026-09-04T01:00:00.000Z','2026-09-04T01:00:02.000Z','system');
    INSERT INTO growth_actions VALUES
      ('action_1','project_1','recommendation_1'),
      ('action_2','project_1','recommendation_2'),
      ('action_foreign','project_2','recommendation_1');
  `);
  ({ GrowthRunInspectorRepository: repository } =
    await import("./GrowthRunInspectorRepository"));
});

afterAll(() => client.close());

describe("GrowthRunInspectorRepository", () => {
  it("returns bounded project runs with stable ties and distinct graph counts", async () => {
    const rows = await repository.listRecentRuns("project_1", 2);
    const query = executedQueries.at(-1)!;
    expect(rows.map(({ id }) => id)).toEqual(["run_z", "run_a"]);
    expect(rows[0]).toMatchObject({
      signalCount: 2,
      insightCount: 2,
      recommendationCount: 2,
      linkedActionCount: 2,
    });
    expect(rows.some(({ id }) => id === "run_foreign")).toBe(false);
    expect(query).toContain("from (select");
    expect(query.indexOf("limit ?")).toBeLessThan(
      query.indexOf('left join "growth_signals"'),
    );
  });

  it("normalizes mixed timestamps before bounding with stable ties and project isolation", async () => {
    const rows = await repository.listRecentCalibrationRecommendations(
      "project_1",
      ["detector-v1"],
      4,
    );
    expect(rows.map(({ id }) => id)).toEqual([
      "recommendation_tie_z",
      "recommendation_tie_a",
      "recommendation_space_late",
      "recommendation_iso_early",
    ]);
    expect(rows).toHaveLength(4);
    expect(
      rows.every(({ detectorVersion }) => detectorVersion === "detector-v1"),
    ).toBe(true);
    expect(rows.some(({ id }) => id.includes("foreign"))).toBe(false);
    expect(rows.some(({ id }) => id === "recommendation_weekly")).toBe(false);
  });

  it("reads exact bounded monthly-cycle artifacts with stable mixed-time ordering", async () => {
    const rows = await repository.listRecentMonthlyCycles(
      "project_1",
      ["priority-page-click-decline-v1"],
      2,
    );
    expect(rows.map(({ parentId }) => parentId)).toEqual([
      "monthly_b",
      "monthly_a",
    ]);
    expect(rows[0]).toMatchObject({
      childId: "monthly_b_child",
      reportStatus: "draft",
      acceptedCount: 1,
      dismissedCount: 1,
      duplicateDismissalCount: 1,
      unresolvedCount: 1,
    });
    expect(rows[1]).toMatchObject({ childId: null, reportStatus: null });
    expect(rows.some(({ parentId }) => parentId === "monthly_old")).toBe(false);
    expect(rows.some(({ parentId }) => parentId === "monthly_foreign")).toBe(
      false,
    );
  });
});
