import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { withPgClient as withPgClientExport } from "@/db";
import type { GrowthProjectSummaryRepository as RepositoryExport } from "./GrowthProjectSummaryRepository";

const testUrl = process.env.TEST_POSTGRES_DATABASE_URL;

vi.mock("cloudflare:workers", () => ({
  env: {
    DATABASE_PROVIDER: "postgres",
    HYPERDRIVE: { connectionString: testUrl },
  },
}));

let sql: ReturnType<typeof postgres>;
let GrowthProjectSummaryRepository: typeof RepositoryExport;
let withPgClient: typeof withPgClientExport;
const describePostgres = testUrl ? describe : describe.skip;

describePostgres("GrowthProjectSummaryRepository on Postgres", () => {
  beforeAll(async () => {
    sql = postgres(testUrl!, { max: 4 });
    ({ GrowthProjectSummaryRepository } =
      await import("./GrowthProjectSummaryRepository"));
    ({ withPgClient } = await import("@/db"));
  });

  afterAll(async () => {
    if (testUrl) await sql.end({ timeout: 5 });
  });

  it("keeps the project summary reads portable, bounded, and ordered", async () => {
    const suffix = crypto.randomUUID();
    const organizationId = `growth_summary_org_${suffix}`;
    const projectId = `growth_summary_project_${suffix}`;
    const foreignOrganizationId = `growth_summary_foreign_org_${suffix}`;
    const foreignProjectId = `growth_summary_foreign_project_${suffix}`;
    const runId = `growth_summary_run_${suffix}`;
    const failedRunId = `growth_summary_failed_${suffix}`;
    const latestRunIds = {
      upper: `growth_summary_latest_A_${suffix}`,
      lower: `growth_summary_latest_a_${suffix}`,
    };
    const foreignRunId = `growth_summary_foreign_run_${suffix}`;
    const recommendationId = `growth_summary_rec_${suffix}`;
    const acceptedNoActionId = `growth_summary_rec_noaction_${suffix}`;
    const recommendationIds = {
      top: `growth_summary_rec_top_${suffix}`,
      upper: `growth_summary_rec_A_${suffix}`,
      lower: `growth_summary_rec_a_${suffix}`,
      mid: `growth_summary_rec_mid_${suffix}`,
      low: `growth_summary_rec_low_${suffix}`,
      last: `growth_summary_rec_last_${suffix}`,
    };
    const linkedRecommendationId = `growth_summary_rec_linked_${suffix}`;
    const actionIds = {
      upper: `growth_summary_action_A_${suffix}`,
      lower: `growth_summary_action_a_${suffix}`,
      middle: `growth_summary_action_mid_${suffix}`,
      low: `growth_summary_action_low_${suffix}`,
      last: `growth_summary_action_last_${suffix}`,
      linked: `growth_summary_action_linked_${suffix}`,
    };
    const asOf = "2026-04-02T00:00:00.000Z";
    const timestamp = "2026-03-01T00:00:00.000Z";

    try {
      await sql`
        INSERT INTO organization (id, name, slug, created_at) VALUES
          (${organizationId}, 'Growth summary', ${`growth-summary-${suffix}`}, now()),
          (${foreignOrganizationId}, 'Foreign growth summary', ${`growth-summary-foreign-${suffix}`}, now())
      `;
      await sql`
        INSERT INTO projects (id, organization_id, name, domain) VALUES
          (${projectId}, ${organizationId}, 'Growth summary', 'example.com'),
          (${foreignProjectId}, ${foreignOrganizationId}, 'Foreign summary', 'foreign.example')
      `;
      await sql`
        INSERT INTO growth_runs (id, project_id, run_type, trigger, status, cadence_slot, period_start, period_end, started_at, completed_at, detector_version) VALUES
          (${runId}, ${projectId}, 'manual_analysis', 'manual', 'completed', ${`summary-${suffix}`}, '2026-02-01', '2026-02-28', ${timestamp}, ${timestamp}, 'v1'),
          (${failedRunId}, ${projectId}, 'manual_analysis', 'manual', 'failed', ${`summary-failed-${suffix}`}, '2026-03-01', '2026-03-31', '2026-03-31T00:00:00.000Z', '2026-04-01T00:00:00.000Z', 'v1'),
          (${latestRunIds.upper}, ${projectId}, 'manual_analysis', 'manual', 'completed', ${`summary-latest-A-${suffix}`}, '2026-03-01', '2026-03-31', '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z', 'v1'),
          (${latestRunIds.lower}, ${projectId}, 'manual_analysis', 'manual', 'completed', ${`summary-latest-a-${suffix}`}, '2026-03-01', '2026-03-31', '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z', 'v1'),
          (${foreignRunId}, ${foreignProjectId}, 'manual_analysis', 'manual', 'completed', ${`summary-foreign-${suffix}`}, '2026-02-01', '2026-02-28', ${timestamp}, ${timestamp}, 'v1')
      `;
      await sql`
        INSERT INTO growth_recommendations (id, project_id, run_id, creation_key, fact_hash, title, rationale, category, impact, commercial_relevance, effort, urgency, confidence, priority_score, status, review_version, created_at) VALUES
          (${recommendationId}, ${projectId}, ${runId}, ${`rec-${suffix}`}, ${"a".repeat(64)}, 'Proposed', 'Why', 'content', 5, 4, 2, 2, .9, 6, 'proposed', 0, ${timestamp}),
          (${acceptedNoActionId}, ${projectId}, ${runId}, ${`noaction-${suffix}`}, ${"b".repeat(64)}, 'Accepted', 'Why', 'content', 5, 4, 2, 2, .9, 11, 'accepted', 1, ${timestamp}),
          (${recommendationIds.top}, ${projectId}, ${runId}, ${`top-${suffix}`}, ${"d".repeat(64)}, 'Top', 'Why', 'content', 5, 4, 2, 2, .9, 20, 'proposed', 0, ${timestamp}),
          (${recommendationIds.upper}, ${projectId}, ${runId}, ${`upper-${suffix}`}, ${"e".repeat(64)}, 'Upper', 'Why', 'content', 5, 4, 2, 2, .9, 10, 'proposed', 0, ${timestamp}),
          (${recommendationIds.lower}, ${projectId}, ${runId}, ${`lower-${suffix}`}, ${"f".repeat(64)}, 'Lower', 'Why', 'content', 5, 4, 2, 2, .9, 10, 'proposed', 0, ${timestamp}),
          (${recommendationIds.mid}, ${projectId}, ${runId}, ${`mid-${suffix}`}, ${"g".repeat(64)}, 'Mid', 'Why', 'content', 5, 4, 2, 2, .9, 9, 'proposed', 0, ${timestamp}),
          (${recommendationIds.low}, ${projectId}, ${runId}, ${`low-${suffix}`}, ${"h".repeat(64)}, 'Low', 'Why', 'content', 5, 4, 2, 2, .9, 8, 'proposed', 0, ${timestamp}),
          (${recommendationIds.last}, ${projectId}, ${runId}, ${`last-${suffix}`}, ${"i".repeat(64)}, 'Last', 'Why', 'content', 5, 4, 2, 2, .9, 7, 'proposed', 0, ${timestamp}),
          (${linkedRecommendationId}, ${projectId}, ${runId}, ${`linked-${suffix}`}, ${"j".repeat(64)}, 'Linked', 'Why', 'content', 5, 4, 2, 2, .9, 99, 'accepted', 1, ${timestamp})
      `;
      await sql`
        INSERT INTO growth_actions (id, project_id, recommendation_id, creation_key, fact_hash, title, description, category, priority_score, status, state_version, due_at, approved_at, created_at, updated_at) VALUES
          (${actionIds.upper}, ${projectId}, ${recommendationId}, ${`upper-${suffix}`}, ${"1".repeat(64)}, 'Upper', 'Description', 'content', 10, 'ready', 1, '2026-04-10', ${timestamp}, ${timestamp}, ${timestamp}),
          (${actionIds.lower}, ${projectId}, ${recommendationId}, ${`lower-${suffix}`}, ${"2".repeat(64)}, 'Lower', 'Description', 'content', 10, 'approved', 0, '2026-04-10', ${timestamp}, ${timestamp}, ${timestamp}),
          (${actionIds.middle}, ${projectId}, ${recommendationId}, ${`middle-${suffix}`}, ${"4".repeat(64)}, 'Middle', 'Description', 'content', 5, 'ready', 1, '2026-04-10', ${timestamp}, ${timestamp}, ${timestamp}),
          (${actionIds.low}, ${projectId}, ${recommendationId}, ${`low-action-${suffix}`}, ${"5".repeat(64)}, 'Low', 'Description', 'content', 2, 'ready', 1, '2026-04-10', ${timestamp}, ${timestamp}, ${timestamp}),
          (${actionIds.last}, ${projectId}, ${recommendationId}, ${`last-action-${suffix}`}, ${"6".repeat(64)}, 'Last', 'Description', 'content', 1, 'ready', 1, '2026-04-10', ${timestamp}, ${timestamp}, ${timestamp}),
          (${actionIds.linked}, ${projectId}, ${linkedRecommendationId}, ${`linked-action-${suffix}`}, ${"3".repeat(64)}, 'Linked', 'Description', 'content', 1, 'ready', 1, '2026-04-20', ${timestamp}, ${timestamp}, ${timestamp})
      `;
      await sql`
        INSERT INTO growth_measurement_plans (id, project_id, action_id, fact_hash, status, action_version, anchor_at, anchor_date, report_timezone, baseline_start, baseline_end, cooldown_end, measurement_start, measurement_end, long_measurement_end, comparison_mode) VALUES
          (${`growth_summary_plan_A_${suffix}`}, ${projectId}, ${actionIds.upper}, ${"7".repeat(64)}, 'active', 2, ${timestamp}, '2026-03-01', 'UTC', '2026-02-01', '2026-02-28', '2026-03-01', '2026-03-02', '2026-04-01', NULL, 'preceding_period'),
          (${`growth_summary_plan_a_${suffix}`}, ${projectId}, ${actionIds.lower}, ${"8".repeat(64)}, 'active', 1, ${timestamp}, '2026-03-01', 'UTC', '2026-02-01', '2026-02-28', '2026-03-01', '2026-03-02', '2026-04-01', NULL, 'preceding_period')
      `;
      await Promise.all(
        Array.from(
          { length: 7 },
          (_, index) =>
            sql`
          INSERT INTO growth_signals (id, project_id, run_id, signal_type, entity_type, entity_ref, metric, severity, confidence, period_start, period_end, baseline_value, current_value, delta_value, delta_percent, evidence_kind, evidence_ref, captured_at)
          VALUES (${`growth_summary_future_${suffix}_${index}`}, ${projectId}, ${runId}, 'future', 'url', 'future', 'clicks', 'critical', 1, '2026-02-01', '2026-02-28', 1, 2, 1, NULL, 'gsc_period', 'ref', '2026-12-01T00:00:00.000Z')
        `,
        ),
      );
      await sql`
        INSERT INTO growth_signals (id, project_id, run_id, signal_type, entity_type, entity_ref, metric, severity, confidence, period_start, period_end, baseline_value, current_value, delta_value, delta_percent, evidence_kind, evidence_ref, captured_at) VALUES
          (${`growth_summary_critical_A_${suffix}`}, ${projectId}, ${runId}, 'critical', 'url', 'one', 'clicks', 'critical', 1, '2026-02-01', '2026-02-28', 1, 2, 1, NULL, 'gsc_period', 'ref', '2026-03-02T00:00:00.000Z'),
          (${`growth_summary_critical_a_${suffix}`}, ${projectId}, ${runId}, 'critical', 'url', 'two', 'clicks', 'critical', 1, '2026-02-01', '2026-02-28', 1, 2, 1, NULL, 'gsc_period', 'ref', '2026-03-02T00:00:00.000Z'),
          (${`growth_summary_critical_old_${suffix}`}, ${projectId}, ${runId}, 'critical', 'url', 'three', 'clicks', 'critical', 1, '2026-02-01', '2026-02-28', 1, 2, 1, NULL, 'gsc_period', 'ref', '2026-03-01T00:00:00.000Z'),
          (${`growth_summary_warning_${suffix}`}, ${projectId}, ${runId}, 'warning', 'url', 'four', 'clicks', 'warning', 1, '2026-02-01', '2026-02-28', 1, 2, 1, NULL, 'ga4_period', 'ref', '2026-03-01T00:00:00.000Z'),
          (${`growth_summary_info_${suffix}`}, ${projectId}, ${runId}, 'info', 'url', 'five', 'clicks', 'info', 1, '2026-02-01', '2026-02-28', 1, 2, 1, NULL, 'gsc_period', 'ref', '2026-03-01T00:00:00.000Z'),
          (${`growth_summary_info_old_${suffix}`}, ${projectId}, ${runId}, 'info', 'url', 'six', 'clicks', 'info', 1, '2026-02-01', '2026-02-28', 1, 2, 1, NULL, 'gsc_period', 'ref', '2026-02-01T00:00:00.000Z'),
          (${`growth_summary_foreign_signal_${suffix}`}, ${foreignProjectId}, ${foreignRunId}, 'critical', 'url', 'foreign', 'clicks', 'critical', 1, '2026-02-01', '2026-02-28', 1, 2, 1, NULL, 'gsc_period', 'ref', '2026-03-03T00:00:00.000Z')
      `;

      const recommendations = await withPgClient(() =>
        GrowthProjectSummaryRepository.listUnresolvedRecommendations(
          projectId,
          6,
        ),
      );
      expect(recommendations.map(({ id }) => id)).toEqual([
        recommendationIds.top,
        acceptedNoActionId,
        recommendationIds.upper,
        recommendationIds.lower,
        recommendationIds.mid,
        recommendationIds.low,
      ]);
      const actions = await withPgClient(() =>
        GrowthProjectSummaryRepository.listCurrentActions(projectId, 6),
      );
      expect(actions.map(({ id }) => id)).toEqual([
        actionIds.upper,
        actionIds.lower,
        actionIds.middle,
        actionIds.low,
        actionIds.last,
        actionIds.linked,
      ]);
      const signalsRead = await withPgClient(() =>
        GrowthProjectSummaryRepository.listRecentSignals(projectId, asOf, 6),
      );
      expect(signalsRead.map(({ id }) => id)).toEqual([
        `growth_summary_critical_A_${suffix}`,
        `growth_summary_critical_a_${suffix}`,
        `growth_summary_critical_old_${suffix}`,
        `growth_summary_warning_${suffix}`,
        `growth_summary_info_${suffix}`,
        `growth_summary_info_old_${suffix}`,
      ]);
      expect(
        await withPgClient(() =>
          GrowthProjectSummaryRepository.listSignalFreshness(projectId, asOf),
        ),
      ).toEqual([
        { evidenceKind: "ga4_period", capturedAt: "2026-03-01T00:00:00.000Z" },
        { evidenceKind: "gsc_period", capturedAt: "2026-03-02T00:00:00.000Z" },
      ]);
      await expect(
        withPgClient(() =>
          GrowthProjectSummaryRepository.getLatestRun(projectId, asOf),
        ),
      ).resolves.toMatchObject({ id: latestRunIds.upper });
      const plans = await withPgClient(() =>
        GrowthProjectSummaryRepository.listActiveMeasurementCandidates(
          projectId,
          51,
        ),
      );
      expect(plans.map(({ id }) => id)).toEqual([
        `growth_summary_plan_A_${suffix}`,
        `growth_summary_plan_a_${suffix}`,
      ]);
      expect(plans[0]).toMatchObject({
        actionId: actionIds.upper,
        actionStatus: "ready",
        actionStateVersion: 1,
      });
    } finally {
      await sql`DELETE FROM projects WHERE id IN (${projectId}, ${foreignProjectId})`;
      await sql`DELETE FROM organization WHERE id IN (${organizationId}, ${foreignOrganizationId})`;
    }
  }, 20_000);
});
