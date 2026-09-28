import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { withPgClient as withPgClientExport } from "@/db";
import type { GrowthRunInspectorRepository as RepositoryExport } from "./GrowthRunInspectorRepository";

const testUrl = process.env.TEST_POSTGRES_DATABASE_URL;

vi.mock("cloudflare:workers", () => ({
  env: {
    DATABASE_PROVIDER: "postgres",
    HYPERDRIVE: { connectionString: testUrl },
  },
}));

const describePostgres = testUrl ? describe : describe.skip;
let sql: ReturnType<typeof postgres>;
let repository: typeof RepositoryExport;
let withPgClient: typeof withPgClientExport;

describePostgres(
  "GrowthRunInspectorRepository monthly cycles on Postgres",
  () => {
    beforeAll(async () => {
      sql = postgres(testUrl!, { max: 3 });
      ({ GrowthRunInspectorRepository: repository } =
        await import("./GrowthRunInspectorRepository"));
      ({ withPgClient } = await import("@/db"));
    });

    afterAll(async () => {
      if (testUrl) await sql.end({ timeout: 5 });
    });

    it("bounds chronologically equivalent parent times and reads only exact project artifacts", async () => {
      const suffix = crypto.randomUUID();
      const organizationId = `inspector_cycle_org_${suffix}`;
      const projectId = `inspector_cycle_project_${suffix}`;
      const foreignOrganizationId = `inspector_cycle_foreign_org_${suffix}`;
      const foreignProjectId = `inspector_cycle_foreign_project_${suffix}`;
      const ids = {
        parentZ: `inspector_cycle_parent_z_${suffix}`,
        parentA: `inspector_cycle_parent_a_${suffix}`,
        parentOld: `inspector_cycle_parent_old_${suffix}`,
        childZ: `inspector_cycle_child_z_${suffix}`,
        childWrongTrigger: `inspector_cycle_child_wrong_trigger_${suffix}`,
        childWrongDetector: `inspector_cycle_child_wrong_detector_${suffix}`,
        foreignParent: `inspector_cycle_foreign_parent_${suffix}`,
      };
      const detectorVersion = "priority-page-click-decline-v1";
      try {
        await sql`
        INSERT INTO organization (id, name, slug, created_at) VALUES
          (${organizationId}, 'Inspector cycles', ${`inspector-cycles-${suffix}`}, now()),
          (${foreignOrganizationId}, 'Foreign inspector cycles', ${`inspector-cycles-foreign-${suffix}`}, now())
      `;
        await sql`
        INSERT INTO projects (id, organization_id, name) VALUES
          (${projectId}, ${organizationId}, 'Inspector cycles'),
          (${foreignProjectId}, ${foreignOrganizationId}, 'Foreign inspector cycles')
      `;
        await sql`
        INSERT INTO growth_runs (
          id, project_id, run_type, trigger, status, cadence_slot, period_start,
          period_end, started_at, completed_at, detector_version
        ) VALUES
          (${ids.parentZ}, ${projectId}, 'monthly_review', 'scheduled', 'completed',
            ${`monthly-review:${suffix}:z`}, '2026-08-01', '2026-08-31',
            '2026-09-04T01:00:00.000Z', '2026-09-04T01:01:00.000Z', 'growth-monthly-review-v1'),
          (${ids.parentA}, ${projectId}, 'monthly_review', 'scheduled', 'completed',
            ${`monthly-review:${suffix}:a`}, '2026-07-01', '2026-07-31',
            '2026-09-04T02:00:00+01:00', '2026-09-04T02:01:00+01:00', 'growth-monthly-review-v1'),
          (${ids.parentOld}, ${projectId}, 'monthly_review', 'scheduled', 'completed',
            ${`monthly-review:${suffix}:old`}, '2026-06-01', '2026-06-30',
            '2026-08-04T01:00:00.000Z', '2026-08-04T01:01:00.000Z', 'growth-monthly-review-v1'),
          (${ids.foreignParent}, ${foreignProjectId}, 'monthly_review', 'scheduled', 'completed',
            ${`monthly-review:${suffix}:foreign`}, '2026-09-01', '2026-09-30',
            '2026-10-04T01:00:00.000Z', '2026-10-04T01:01:00.000Z', 'growth-monthly-review-v1'),
          (${ids.childZ}, ${projectId}, 'manual_analysis', 'scheduled', 'completed',
            ${`priority-page-check:monthly_${ids.parentZ}`}, '2026-08-01', '2026-08-31',
            '2026-09-04T01:02:00.000Z', '2026-09-04T01:03:00.000Z', ${detectorVersion}),
          (${ids.childWrongTrigger}, ${projectId}, 'manual_analysis', 'manual', 'completed',
            ${`priority-page-check:monthly_${ids.parentA}`}, '2026-07-01', '2026-07-31',
            '2026-09-04T01:02:00.000Z', '2026-09-04T01:03:00.000Z', ${detectorVersion}),
          (${ids.childWrongDetector}, ${projectId}, 'manual_analysis', 'scheduled', 'completed',
            ${`priority-page-check:monthly_${ids.parentOld}`}, '2026-06-01', '2026-06-30',
            '2026-09-04T01:02:00.000Z', '2026-09-04T01:03:00.000Z', 'unrecognized-detector-v1')
      `;
        await sql`
        INSERT INTO growth_reports (
          id, project_id, fact_hash, report_type, period_start, period_end,
          version, status, report_timezone, data_cutoff_at, generated_at,
          builder_version, content_schema_version, created_by_type, created_by_id
        ) VALUES
          (${`inspector_cycle_report_v1_${suffix}`}, ${projectId}, ${"a".repeat(64)}, 'monthly',
            '2026-08-01', '2026-08-31', 1, 'draft', 'UTC',
            '2026-09-04T01:00:00.000Z', '2026-09-04T01:01:00.000Z', 'test-v1', 1, 'system', 'test'),
          (${`inspector_cycle_report_v2_${suffix}`}, ${projectId}, ${"b".repeat(64)}, 'monthly',
            '2026-07-01', '2026-07-31', 2, 'draft', 'UTC',
            '2026-09-04T01:00:00.000Z', '2026-09-04T01:01:00.000Z', 'test-v1', 1, 'system', 'test'),
          (${`inspector_cycle_foreign_report_${suffix}`}, ${foreignProjectId}, ${"c".repeat(64)}, 'monthly',
            '2026-06-01', '2026-06-30', 1, 'draft', 'UTC',
            '2026-09-04T01:00:00.000Z', '2026-09-04T01:01:00.000Z', 'test-v1', 1, 'system', 'test')
      `;
        await sql`
        INSERT INTO growth_recommendations (
          id, project_id, run_id, creation_key, fact_hash, title, rationale,
          category, impact, commercial_relevance, effort, urgency, confidence,
          priority_score, status, review_version, snoozed_until, dismissal_reason, created_at
        ) VALUES
          (${`inspector_cycle_accepted_${suffix}`}, ${projectId}, ${ids.childZ}, 'accepted', ${"d".repeat(64)}, 'Accepted', 'Why', 'investigation', 1, 1, 1, 1, 1, 1, 'accepted', 0, NULL, NULL, '2026-09-04T01:04:00.000Z'),
          (${`inspector_cycle_duplicate_${suffix}`}, ${projectId}, ${ids.childZ}, 'duplicate', ${"e".repeat(64)}, 'Duplicate', 'Why', 'investigation', 1, 1, 1, 1, 1, 1, 'dismissed', 1, NULL, 'duplicate', '2026-09-04T01:04:00.000Z'),
          (${`inspector_cycle_dismissed_${suffix}`}, ${projectId}, ${ids.childZ}, 'dismissed', ${"f".repeat(64)}, 'Dismissed', 'Why', 'investigation', 1, 1, 1, 1, 1, 1, 'dismissed', 1, NULL, 'irrelevant', '2026-09-04T01:04:00.000Z'),
          (${`inspector_cycle_proposed_${suffix}`}, ${projectId}, ${ids.childZ}, 'proposed', ${"0".repeat(64)}, 'Proposed', 'Why', 'investigation', 1, 1, 1, 1, 1, 1, 'proposed', 0, NULL, NULL, '2026-09-04T01:04:00.000Z'),
          (${`inspector_cycle_snoozed_${suffix}`}, ${projectId}, ${ids.childZ}, 'snoozed', ${"1".repeat(64)}, 'Snoozed', 'Why', 'investigation', 1, 1, 1, 1, 1, 1, 'snoozed', 1, '2026-10-01T00:00:00.000Z', NULL, '2026-09-04T01:04:00.000Z')
      `;

        const rows = await withPgClient(() =>
          repository.listRecentMonthlyCycles(projectId, [detectorVersion], 3),
        );

        expect(rows.map(({ parentId }) => parentId)).toEqual([
          ids.parentZ,
          ids.parentA,
          ids.parentOld,
        ]);
        expect(rows[0]).toMatchObject({
          childId: ids.childZ,
          reportStatus: "draft",
          acceptedCount: 1,
          dismissedCount: 2,
          duplicateDismissalCount: 1,
          unresolvedCount: 2,
          reconciledCount: 0,
        });
        expect(rows[1]).toMatchObject({ childId: null, reportStatus: null });
        expect(rows[2]).toMatchObject({ childId: null, reportStatus: null });
        expect(
          rows.some(({ parentId }) => parentId === ids.foreignParent),
        ).toBe(false);
      } finally {
        await sql`DELETE FROM organization WHERE id IN (${organizationId}, ${foreignOrganizationId})`;
      }
    });
  },
);
