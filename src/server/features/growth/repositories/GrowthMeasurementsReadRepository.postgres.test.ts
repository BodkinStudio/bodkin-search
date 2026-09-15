import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { withPgClient as WithPgClient } from "@/db";
import type { GrowthMeasurementsReadRepository as Repository } from "./GrowthMeasurementsReadRepository";

const testUrl = process.env.TEST_POSTGRES_DATABASE_URL;
vi.mock("cloudflare:workers", () => ({
  env: {
    DATABASE_PROVIDER: "postgres",
    HYPERDRIVE: { connectionString: testUrl },
  },
}));
const describePostgres = testUrl ? describe : describe.skip;
let sql: ReturnType<typeof postgres>;
let repository: typeof Repository;
let withPgClient: typeof WithPgClient;

describePostgres("GrowthMeasurementsReadRepository Postgres", () => {
  beforeAll(async () => {
    sql = postgres(testUrl!, { max: 3 });
    ({ GrowthMeasurementsReadRepository: repository } =
      await import("./GrowthMeasurementsReadRepository"));
    ({ withPgClient } = await import("@/db"));
  });
  afterAll(async () => {
    if (testUrl) await sql.end({ timeout: 5 });
  });

  it("keeps C-collated creation keysets and bounded project-leading children provider-equivalent", async () => {
    const suffix = crypto.randomUUID();
    const org = `gml_org_${suffix}`,
      project = `gml_project_${suffix}`,
      run = `gml_run_${suffix}`;
    const foreignOrg = `gml_foreign_org_${suffix}`,
      foreignProject = `gml_foreign_project_${suffix}`,
      foreignRun = `gml_foreign_run_${suffix}`;
    const recZ = `gml_rec_z_${suffix}`,
      recA = `gml_rec_a_${suffix}`;
    const actionZ = `gml_action_z_${suffix}`,
      actionA = `gml_action_a_${suffix}`;
    const planZ = `gml_plan_z_${suffix}`,
      planA = `gml_plan_a_${suffix}`;
    const foreignRec = `gml_foreign_rec_${suffix}`,
      foreignAction = `gml_foreign_action_${suffix}`,
      foreignPlan = `gml_foreign_plan_${suffix}`;
    try {
      await sql`INSERT INTO organization (id,name,slug,created_at) VALUES (${org},'Measurement list',${`gml-${suffix}`},now())`;
      await sql`INSERT INTO projects (id,organization_id,name,domain) VALUES (${project},${org},'Measurement list','example.com')`;
      await sql`INSERT INTO organization (id,name,slug,created_at) VALUES (${foreignOrg},'Foreign measurement list',${`gml-foreign-${suffix}`},now())`;
      await sql`INSERT INTO projects (id,organization_id,name,domain) VALUES (${foreignProject},${foreignOrg},'Foreign measurement list','foreign.example.com')`;
      await sql`INSERT INTO growth_runs (id,project_id,run_type,trigger,status,cadence_slot,period_start,period_end,started_at,completed_at,detector_version) VALUES (${run},${project},'manual_analysis','manual','completed',${`gml-${suffix}`},'2026-01-01','2026-01-31','2026-01-31T00:00:00.000Z','2026-01-31T00:00:00.000Z','v1')`;
      await sql`INSERT INTO growth_runs (id,project_id,run_type,trigger,status,cadence_slot,period_start,period_end,started_at,completed_at,detector_version) VALUES (${foreignRun},${foreignProject},'manual_analysis','manual','completed',${`gml-foreign-${suffix}`},'2026-01-01','2026-01-31','2026-01-31T00:00:00.000Z','2026-01-31T00:00:00.000Z','v1')`;
      await sql`INSERT INTO growth_recommendations (id,project_id,run_id,creation_key,fact_hash,title,rationale,category,impact,commercial_relevance,effort,urgency,confidence,priority_score,status,review_version) VALUES (${recZ},${project},${run},${`z-${suffix}`},${"a".repeat(64)},'Z','Why','content',1,1,1,1,.5,1,'accepted',1),(${recA},${project},${run},${`a-${suffix}`},${"b".repeat(64)},'A','Why','content',1,1,1,1,.5,1,'accepted',1)`;
      await sql`INSERT INTO growth_recommendations (id,project_id,run_id,creation_key,fact_hash,title,rationale,category,impact,commercial_relevance,effort,urgency,confidence,priority_score,status,review_version) VALUES (${foreignRec},${foreignProject},${foreignRun},${`foreign-${suffix}`},${"1".repeat(64)},'Foreign','Why','content',1,1,1,1,.5,1,'accepted',1)`;
      await sql`INSERT INTO growth_actions (id,project_id,recommendation_id,creation_key,fact_hash,title,description,category,priority_score,status,state_version,due_at,approved_at,implemented_at) VALUES (${actionZ},${project},${recZ},${`z-${suffix}`},${"c".repeat(64)},'Z','Do Z','content',1,'measuring',3,'2026-12-01T00:00:00.000Z','2026-01-01T00:00:00.000Z','2026-01-02T00:00:00.000Z'),(${actionA},${project},${recA},${`a-${suffix}`},${"d".repeat(64)},'A','Do A','content',1,'measuring',3,'2026-12-01T00:00:00.000Z','2026-01-01T00:00:00.000Z','2026-01-02T00:00:00.000Z')`;
      await sql`INSERT INTO growth_actions (id,project_id,recommendation_id,creation_key,fact_hash,title,description,category,priority_score,status,state_version,due_at,approved_at,implemented_at) VALUES (${foreignAction},${foreignProject},${foreignRec},${`foreign-${suffix}`},${"2".repeat(64)},'Foreign','Do foreign','content',1,'measuring',3,'2026-12-01T00:00:00.000Z','2026-01-01T00:00:00.000Z','2026-01-02T00:00:00.000Z')`;
      await sql`INSERT INTO growth_measurement_plans (id,project_id,action_id,fact_hash,status,action_version,anchor_at,anchor_date,report_timezone,baseline_start,baseline_end,cooldown_end,measurement_start,measurement_end,comparison_mode,created_at) VALUES (${planZ},${project},${actionZ},${"e".repeat(64)},'active',3,'2026-01-03T00:00:00.000Z','2026-01-03','UTC','2025-12-01','2026-01-02','2026-01-03','2026-01-04','2026-01-31','preceding_period','2026-01-03T00:00:00.000Z'),(${planA},${project},${actionA},${"f".repeat(64)},'active',3,'2026-01-03T00:00:00.000Z','2026-01-03','UTC','2025-12-01','2026-01-02','2026-01-03','2026-01-04','2026-01-31','preceding_period','2026-01-03T00:00:00.000Z')`;
      await sql`INSERT INTO growth_measurement_plans (id,project_id,action_id,fact_hash,status,action_version,anchor_at,anchor_date,report_timezone,baseline_start,baseline_end,cooldown_end,measurement_start,measurement_end,comparison_mode,created_at) VALUES (${foreignPlan},${foreignProject},${foreignAction},${"3".repeat(64)},'active',3,'2026-01-03T00:00:00.000Z','2026-01-03','UTC','2025-12-01','2026-01-02','2026-01-03','2026-01-04','2026-01-31','preceding_period','2026-01-04T00:00:00.000Z')`;
      await sql`UPDATE growth_measurement_plans SET status = 'completed', completed_at = '2026-02-01T00:00:00.000Z' WHERE id = ${planA}`;
      await sql`INSERT INTO growth_measurement_metrics (id,project_id,measurement_plan_id,metric_type,entity_type,entity_key,is_primary) SELECT ${`gml_metric_${suffix}_`} || series::text,${project},${planA},'search_clicks','site','site-' || series::text,series = 1 FROM generate_series(1,51) AS series`;
      await sql`INSERT INTO growth_measurement_metrics (id,project_id,measurement_plan_id,metric_type,entity_type,entity_key,is_primary) VALUES (${`gml_metric_z_${suffix}`},${project},${planZ},'search_clicks','site','site',true)`;
      await sql`INSERT INTO growth_measurement_metrics (id,project_id,measurement_plan_id,metric_type,entity_type,entity_key,is_primary) VALUES (${`gml_metric_foreign_${suffix}`},${foreignProject},${foreignPlan},'search_clicks','site','foreign',true)`;
      await sql`INSERT INTO growth_measurement_results (id,project_id,measurement_plan_id,fact_hash,observations_hash,outcome,confidence,summary,evaluated_at) VALUES (${`gml_result_${suffix}`},${project},${planA},${"4".repeat(64)},${"5".repeat(64)},'positive',.8,'local','2026-02-01T00:00:00.000Z'),(${`gml_result_foreign_${suffix}`},${foreignProject},${foreignPlan},${"6".repeat(64)},${"7".repeat(64)},'positive',.8,'foreign','2026-02-01T00:00:00.000Z')`;
      const first = await withPgClient(() =>
        repository.listMeasurementPlansPage({ projectId: project, limit: 1 }),
      );
      expect(first.map((row) => row.id)).toEqual([planZ, planA]);
      const second = await withPgClient(() =>
        repository.listMeasurementPlansPage({
          projectId: project,
          limit: 50,
          cursor: { createdAt: "2026-01-03T00:00:00.000Z", id: planZ },
        }),
      );
      expect(second.map((row) => row.id)).toEqual([planA]);
      const completed = await withPgClient(() =>
        repository.listMeasurementPlansPage({
          projectId: project,
          statuses: ["completed"],
          limit: 1,
        }),
      );
      expect(completed.map((row) => row.id)).toEqual([planA]);
      const metrics = await withPgClient(() =>
        repository.listMetricsForMeasurementPlans(project, [
          planZ,
          planA,
          foreignPlan,
        ]),
      );
      expect(
        metrics.filter((row) => row.measurementPlanId === planA),
      ).toHaveLength(51);
      expect(
        metrics.filter((row) => row.measurementPlanId === planZ),
      ).toHaveLength(1);
      await expect(
        withPgClient(() =>
          repository.listResultsForMeasurementPlans(project, [
            planA,
            planZ,
            foreignPlan,
          ]),
        ),
      ).resolves.toEqual([
        expect.objectContaining({ measurementPlanId: planA, summary: "local" }),
      ]);
    } finally {
      await sql`DELETE FROM organization WHERE id = ${org}`;
      await sql`DELETE FROM organization WHERE id = ${foreignOrg}`;
    }
  }, 15_000);
});
