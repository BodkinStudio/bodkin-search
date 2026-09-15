import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { withPgClient as withPgClientExport } from "@/db";
import type { GrowthMonthlyCycleOperatorObservationsRepository as RepositoryExport } from "./GrowthMonthlyCycleOperatorObservationsRepository";

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
  "GrowthMonthlyCycleOperatorObservationsRepository on Postgres",
  () => {
    beforeAll(async () => {
      sql = postgres(testUrl!, { max: 3 });
      ({ GrowthMonthlyCycleOperatorObservationsRepository: repository } =
        await import("./GrowthMonthlyCycleOperatorObservationsRepository"));
      ({ withPgClient } = await import("@/db"));
    });

    afterAll(async () => {
      if (testUrl) await sql.end({ timeout: 5 });
    });

    it("qualifies idempotent writes and returns deterministic latest project evidence", async () => {
      const suffix = crypto.randomUUID();
      const organizationId = `cycle_observation_org_${suffix}`;
      const foreignOrganizationId = `cycle_observation_foreign_org_${suffix}`;
      const projectId = `cycle_observation_project_${suffix}`;
      const foreignProjectId = `cycle_observation_foreign_project_${suffix}`;
      const completeRunId = `cycle_observation_complete_${suffix}`;
      const failedRunId = `cycle_observation_failed_${suffix}`;
      const runningRunId = `cycle_observation_running_${suffix}`;
      const foreignRunId = `cycle_observation_foreign_${suffix}`;
      const record = {
        id: `cycle_observation_a_${suffix}`,
        projectId,
        runId: completeRunId,
        requestKey: crypto.randomUUID(),
        preparation: "none" as const,
        failure: "none_observed" as const,
        duplicateSpam: "not_observed" as const,
        note: null,
        reviewerId: `user_${suffix}`,
        createdAt: "2026-09-05T12:00:00.000Z",
      };
      try {
        await sql`
          INSERT INTO organization (id, name, slug, created_at) VALUES
            (${organizationId}, 'Cycle observations', ${`cycle-observations-${suffix}`}, now()),
            (${foreignOrganizationId}, 'Foreign cycle observations', ${`foreign-cycle-observations-${suffix}`}, now())
        `;
        await sql`
          INSERT INTO projects (id, organization_id, name) VALUES
            (${projectId}, ${organizationId}, 'Cycle observations'),
            (${foreignProjectId}, ${foreignOrganizationId}, 'Foreign cycle observations')
        `;
        await sql`
          INSERT INTO growth_runs (
            id, project_id, run_type, trigger, status, cadence_slot,
            period_start, period_end, started_at, completed_at,
            detector_version, failure_code, failure_message
          ) VALUES
            (${completeRunId}, ${projectId}, 'monthly_review', 'scheduled', 'completed',
              ${`monthly:complete:${suffix}`}, '2026-08-01', '2026-08-31',
              '2026-09-01T00:00:00.000Z', '2026-09-01T00:01:00.000Z',
              'growth-monthly-review-v1', NULL, NULL),
            (${failedRunId}, ${projectId}, 'monthly_review', 'scheduled', 'failed',
              ${`monthly:failed:${suffix}`}, '2026-07-01', '2026-07-31',
              '2026-08-01T00:00:00.000Z', '2026-08-01T00:01:00.000Z',
              'growth-monthly-review-v1', 'MONTHLY_REVIEW_FAILED', 'Saved failure'),
            (${runningRunId}, ${projectId}, 'monthly_review', 'scheduled', 'running',
              ${`monthly:running:${suffix}`}, '2026-09-01', '2026-09-30',
              '2026-10-01T00:00:00.000Z', NULL,
              'growth-monthly-review-v1', NULL, NULL),
            (${foreignRunId}, ${foreignProjectId}, 'monthly_review', 'scheduled', 'completed',
              ${`monthly:foreign:${suffix}`}, '2026-08-01', '2026-08-31',
              '2026-09-01T00:00:00.000Z', '2026-09-01T00:01:00.000Z',
              'growth-monthly-review-v1', NULL, NULL)
        `;

        await expect(
          withPgClient(() => repository.append(record)),
        ).resolves.toMatchObject(record);
        await expect(
          withPgClient(() =>
            repository.append({
              ...record,
              id: `ignored_retry_${suffix}`,
              preparation: "substantial",
            }),
          ),
        ).resolves.toMatchObject(record);
        await expect(
          withPgClient(() =>
            repository.append({
              ...record,
              id: `rejected_running_${suffix}`,
              runId: runningRunId,
              requestKey: crypto.randomUUID(),
            }),
          ),
        ).resolves.toBeNull();
        await expect(
          withPgClient(() =>
            repository.append({
              ...record,
              id: `rejected_foreign_${suffix}`,
              runId: foreignRunId,
              requestKey: crypto.randomUUID(),
            }),
          ),
        ).resolves.toBeNull();

        await withPgClient(() =>
          repository.append({
            ...record,
            id: `cycle_observation_z_${suffix}`,
            requestKey: crypto.randomUUID(),
            preparation: "substantial",
            createdAt: "2026-09-05T13:00:00+01:00",
          }),
        );
        await withPgClient(() =>
          repository.append({
            ...record,
            id: `cycle_observation_failed_${suffix}`,
            runId: failedRunId,
            requestKey: crypto.randomUUID(),
            failure: "explained",
            createdAt: "2026-08-05T12:00:00.000Z",
          }),
        );
        await withPgClient(() =>
          repository.append({
            ...record,
            id: `cycle_observation_foreign_${suffix}`,
            projectId: foreignProjectId,
            runId: foreignRunId,
            requestKey: crypto.randomUUID(),
            reviewerId: `foreign_user_${suffix}`,
            createdAt: "2026-10-05T12:00:00.000Z",
          }),
        );

        const rows = await withPgClient(() =>
          repository.listLatestForRuns(projectId, [completeRunId, failedRunId]),
        );
        expect(rows).toHaveLength(2);
        expect(rows).toEqual([
          expect.objectContaining({
            id: `cycle_observation_z_${suffix}`,
            runId: completeRunId,
            preparation: "substantial",
          }),
          expect.objectContaining({
            id: `cycle_observation_failed_${suffix}`,
            runId: failedRunId,
          }),
        ]);
        expect(rows.some(({ projectId: id }) => id === foreignProjectId)).toBe(
          false,
        );
      } finally {
        await sql`DELETE FROM organization WHERE id IN (${organizationId}, ${foreignOrganizationId})`;
      }
    });
  },
);
