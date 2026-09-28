import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { withPgClient as withPgClientExport } from "@/db";
import type { GrowthMeasurementsRepository as RepositoryExport } from "./GrowthMeasurementsRepository";

const testUrl = process.env.TEST_POSTGRES_DATABASE_URL;

vi.mock("cloudflare:workers", () => ({
  env: {
    DATABASE_PROVIDER: "postgres",
    HYPERDRIVE: { connectionString: testUrl },
  },
}));

const describePostgres = testUrl ? describe : describe.skip;

type Repository = typeof RepositoryExport;
type WithPgClient = typeof withPgClientExport;

let sql: ReturnType<typeof postgres>;
let repo: Repository;
let withPgClient: WithPgClient;

describePostgres("GrowthMeasurementsRepository Postgres bounded reads", () => {
  beforeAll(async () => {
    sql = postgres(testUrl!, { max: 4 });
    ({ GrowthMeasurementsRepository: repo } =
      await import("./GrowthMeasurementsRepository"));
    ({ withPgClient } = await import("@/db"));
  });

  afterAll(async () => {
    if (testUrl) await sql.end({ timeout: 5 });
  });

  it("returns 51/151/51 sentinels and only lifecycle versions V/V+1", async () => {
    const suffix = crypto.randomUUID();
    const organizationId = `gmr_org_${suffix}`;
    const projectId = `gmr_project_${suffix}`;
    const runId = `gmr_run_${suffix}`;
    const recommendationId = `gmr_recommendation_${suffix}`;
    const actionId = `gmr_action_${suffix}`;
    const planId = `gmr_plan_${suffix}`;
    const anchorChangeId = `gmr_anchor_${suffix}`;
    const resultId = `gmr_result_${suffix}`;
    const lifecycleVersion = 5;

    try {
      await sql`
        INSERT INTO organization (id, name, slug, created_at)
        VALUES (${organizationId}, 'Measurement read regression', ${`gmr-${suffix}`}, now())
      `;
      await sql`
        INSERT INTO projects (id, organization_id, name, domain)
        VALUES (${projectId}, ${organizationId}, 'Measurement read regression', 'example.com')
      `;
      await sql`
        INSERT INTO growth_runs (
          id, project_id, run_type, trigger, status, cadence_slot, period_start,
          period_end, started_at, completed_at, detector_version
        ) VALUES (
          ${runId}, ${projectId}, 'manual_analysis', 'manual', 'completed',
          ${`measurement-read-${suffix}`}, '2026-08-01', '2026-08-31',
          '2026-08-31T10:00:00.000Z', '2026-08-31T11:00:00.000Z', 'v1'
        )
      `;
      await sql`
        INSERT INTO growth_recommendations (
          id, project_id, run_id, creation_key, fact_hash, title, rationale,
          category, impact, commercial_relevance, effort, urgency, confidence,
          priority_score, status, review_version
        ) VALUES (
          ${recommendationId}, ${projectId}, ${runId}, ${`gmr-rec-${suffix}`},
          ${"a".repeat(64)}, 'Repair pricing', 'Traffic declined', 'content',
          5, 5, 2, 3, 0.8, 10, 'accepted', 1
        )
      `;
      await sql`
        INSERT INTO growth_actions (
          id, project_id, recommendation_id, creation_key, fact_hash, title,
          description, category, priority_score, status, state_version, due_at,
          approved_at, started_at, implemented_at, evaluated_at
        ) VALUES (
          ${actionId}, ${projectId}, ${recommendationId}, ${`gmr-action-${suffix}`},
          ${"b".repeat(64)}, 'Repair pricing', 'Ship the change', 'content',
          10, 'evaluated', 6, '2026-10-01T12:00:00.000Z',
          '2026-08-01T12:00:00.000Z', '2026-08-15T12:00:00.000Z',
          '2026-08-29T12:00:00.000Z', '2026-10-01T12:00:00.000Z'
        )
      `;
      await sql`
        INSERT INTO growth_change_events (
          id, project_id, creation_key, fact_hash, source, change_type,
          actor_type, actor_id, description, happened_at
        ) VALUES (
          ${anchorChangeId}, ${projectId}, ${`gmr-anchor-${suffix}`},
          ${"c".repeat(64)}, 'manual', 'content_updated', 'user', 'test-user',
          'Implemented pricing change', '2026-08-29T12:00:00.000Z'
        )
      `;
      await sql`
        INSERT INTO growth_action_changes (project_id, action_id, change_event_id)
        VALUES (${projectId}, ${actionId}, ${anchorChangeId})
      `;
      await sql`
        INSERT INTO growth_measurement_plans (
          id, project_id, action_id, fact_hash, status, action_version, anchor_at,
          anchor_date, report_timezone, baseline_start, baseline_end, cooldown_end,
          measurement_start, measurement_end, long_measurement_end, comparison_mode,
          completed_at
        ) VALUES (
          ${planId}, ${projectId}, ${actionId}, ${"d".repeat(64)}, 'completed',
          ${lifecycleVersion}, '2026-08-29T12:00:00.000Z', '2026-08-29',
          'Europe/London', '2026-08-01', '2026-08-14', '2026-08-31',
          '2026-09-01', '2026-09-14', '2026-10-01', 'preceding_period',
          '2026-10-02T12:00:00.000Z'
        )
      `;
      await sql`
        INSERT INTO growth_measurement_plan_anchors (
          project_id, measurement_plan_id, action_id, change_event_id
        ) VALUES (${projectId}, ${planId}, ${actionId}, ${anchorChangeId})
      `;
      await sql`
        INSERT INTO growth_measurement_metrics (
          id, project_id, measurement_plan_id, metric_type, entity_type, entity_key,
          is_primary
        )
        SELECT
          ${`gmr_metric_${suffix}_`} || series::text, ${projectId}, ${planId},
          'search_clicks', 'site', 'entity-' || series::text, series = 1
        FROM generate_series(1, 51) AS series
      `;
      await sql`
        INSERT INTO growth_measurement_observations (
          id, project_id, measurement_plan_id, metric_id, period_type, fact_hash,
          effective_start, effective_end, value, completeness, evidence_kind,
          evidence_ref, captured_at
        )
        SELECT
          ${`gmr_observation_${suffix}_`} || series::text, ${projectId}, ${planId},
          ${`gmr_metric_${suffix}_`} || (((series - 1) % 51) + 1)::text,
          CASE WHEN series <= 51 THEN 'baseline'
               WHEN series <= 102 THEN 'measurement'
               ELSE 'long_term' END,
          ${"e".repeat(64)}, '2026-08-01', '2026-08-14', 1, 1,
          'gsc_period', 'private', '2026-10-02T12:00:00.000Z'
        FROM generate_series(1, 151) AS series
      `;
      await sql`
        INSERT INTO growth_measurement_results (
          id, project_id, measurement_plan_id, fact_hash, observations_hash, outcome,
          confidence, summary, evaluated_at, model, prompt_version
        ) VALUES (
          ${resultId}, ${projectId}, ${planId}, ${"f".repeat(64)},
          ${"0".repeat(64)}, 'positive', 0.8, 'Observed improvement',
          '2026-10-02T12:00:00.000Z', NULL, NULL
        )
      `;
      await sql`
        INSERT INTO growth_change_events (
          id, project_id, creation_key, fact_hash, source, change_type,
          actor_type, actor_id, description, happened_at
        )
        SELECT
          ${`gmr_confounder_${suffix}_`} || series::text, ${projectId},
          ${`gmr-confounder-${suffix}-`} || series::text, ${"1".repeat(64)},
          'manual', 'content_updated', 'user', 'test-user', 'Context change',
          '2026-09-01T12:00:00.000Z'
        FROM generate_series(1, 51) AS series
      `;
      await sql`
        INSERT INTO growth_measurement_result_changes (
          project_id, measurement_result_id, change_event_id
        )
        SELECT ${projectId}, ${resultId}, ${`gmr_confounder_${suffix}_`} || series::text
        FROM generate_series(1, 51) AS series
      `;
      await sql`
        INSERT INTO growth_action_events (
          id, project_id, action_id, action_version, fact_hash, event_type,
          actor_type, actor_id, from_status, to_status, note, created_at
        ) VALUES
          (${`gmr_event_before_${suffix}`}, ${projectId}, ${actionId}, 4,
            ${"2".repeat(64)}, 'status_changed', 'agent', 'test-agent',
            'in_progress', 'implemented', NULL, '2026-08-29T11:00:00.000Z'),
          (${`gmr_event_start_${suffix}`}, ${projectId}, ${actionId}, 5,
            ${"3".repeat(64)}, 'status_changed', 'agent', 'test-agent',
            'implemented', 'measuring', NULL, '2026-08-29T12:00:00.000Z'),
          (${`gmr_event_finish_${suffix}`}, ${projectId}, ${actionId}, 6,
            ${"4".repeat(64)}, 'status_changed', 'agent', 'test-agent',
            'measuring', 'evaluated', NULL, '2026-10-02T12:00:00.000Z'),
          (${`gmr_event_after_${suffix}`}, ${projectId}, ${actionId}, 7,
            ${"5".repeat(64)}, 'status_changed', 'agent', 'test-agent',
            'measuring', 'evaluated', NULL, '2026-10-03T12:00:00.000Z')
      `;

      const graph = await withPgClient(() => repo.getGraph(projectId, planId));
      expect(graph?.metrics).toHaveLength(51);
      expect(graph?.observations).toHaveLength(151);
      expect(graph?.confoundingChangeEventIds).toHaveLength(51);
      expect(
        graph?.actionEvents.map(({ actionVersion }) => actionVersion),
      ).toEqual([lifecycleVersion, lifecycleVersion + 1]);
    } finally {
      await sql`DELETE FROM organization WHERE id = ${organizationId}`;
    }
  }, 25_000);
});
