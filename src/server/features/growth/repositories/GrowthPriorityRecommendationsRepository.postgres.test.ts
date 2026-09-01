import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { withPgClient as withPgClientExport } from "@/db";
import type { GrowthPriorityRecommendationsRepository as RepositoryExport } from "./GrowthPriorityRecommendationsRepository";

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

describePostgres("GrowthPriorityRecommendationsRepository on Postgres", () => {
  beforeAll(async () => {
    sql = postgres(testUrl!, { max: 3 });
    ({ GrowthPriorityRecommendationsRepository: repository } =
      await import("./GrowthPriorityRecommendationsRepository"));
    ({ withPgClient } = await import("@/db"));
  });
  afterAll(async () => {
    if (testUrl) await sql.end({ timeout: 5 });
  });

  it("keeps filters, keyset paging, child reads and Action suppression project-scoped", async () => {
    const suffix = crypto.randomUUID();
    const org = `priority_read_org_${suffix}`;
    const project = `priority_read_project_${suffix}`;
    const foreignOrg = `priority_read_foreign_org_${suffix}`;
    const foreignProject = `priority_read_foreign_project_${suffix}`;
    const run = `priority_read_run_${suffix}`;
    const foreignRun = `priority_read_foreign_run_${suffix}`;
    try {
      await sql`INSERT INTO organization (id,name,slug,created_at) VALUES (${org},'Priority read',${`priority-read-${suffix}`},now()),(${foreignOrg},'Foreign priority read',${`priority-read-foreign-${suffix}`},now())`;
      await sql`INSERT INTO projects (id,organization_id,name,domain) VALUES (${project},${org},'Priority','example.com'),(${foreignProject},${foreignOrg},'Foreign','other.example')`;
      await sql`INSERT INTO growth_runs (id,project_id,run_type,trigger,status,cadence_slot,period_start,period_end,started_at,completed_at,detector_version) VALUES (${run},${project},'manual_analysis','manual','completed',${suffix},'2026-08-01','2026-08-31','2026-09-01T00:00:00.000Z','2026-09-01T00:00:00.000Z','v1'),(${foreignRun},${foreignProject},'manual_analysis','manual','completed',${`f-${suffix}`},'2026-08-01','2026-08-31','2026-09-01T00:00:00.000Z','2026-09-01T00:00:00.000Z','v1')`;
      const ids = {
        acceptedWithAction: `priority_read_accepted_action_${suffix}`,
        acceptedWithoutAction: `priority_read_accepted_open_${suffix}`,
        proposedZ: `priority_read_proposed_z_${suffix}`,
        proposedA: `priority_read_proposed_a_${suffix}`,
        snoozed: `priority_read_snoozed_${suffix}`,
        dismissed: `priority_read_dismissed_${suffix}`,
        foreign: `priority_read_foreign_${suffix}`,
      };
      await sql`
        INSERT INTO growth_recommendations (
          id, project_id, run_id, creation_key, fact_hash, title, rationale,
          category, impact, commercial_relevance, effort, urgency, confidence,
          priority_score, status, review_version, snoozed_until,
          dismissal_reason, created_at
        ) VALUES
          (${ids.acceptedWithAction}, ${project}, ${run}, 'accepted-action',
            ${"a".repeat(64)}, 'Accepted with Action', 'Why', 'content',
            1, 1, 1, 1, 1, 99, 'accepted', 1, NULL, NULL,
            '2026-09-02T00:00:00.000Z'),
          (${ids.proposedZ}, ${project}, ${run}, 'proposed-z',
            ${"b".repeat(64)}, 'Proposed z', 'Why', 'content',
            1, 1, 1, 1, 1, 10, 'proposed', 0, NULL, NULL,
            '2026-09-01T00:00:00.000Z'),
          (${ids.proposedA}, ${project}, ${run}, 'proposed-a',
            ${"c".repeat(64)}, 'Proposed a', 'Why', 'content',
            1, 1, 1, 1, 1, 10, 'proposed', 0, NULL, NULL,
            '2026-09-01T00:00:00.000Z'),
          (${ids.snoozed}, ${project}, ${run}, 'snoozed',
            ${"d".repeat(64)}, 'Snoozed', 'Why', 'technical',
            1, 1, 1, 1, 1, 9, 'snoozed', 1,
            '2026-10-01T00:00:00.000Z', NULL,
            '2026-08-31T00:00:00.000Z'),
          (${ids.acceptedWithoutAction}, ${project}, ${run}, 'accepted-open',
            ${"e".repeat(64)}, 'Accepted without Action', 'Why', 'commercial',
            1, 1, 1, 1, 1, 8, 'accepted', 2, NULL, NULL,
            '2026-08-30T00:00:00.000Z'),
          (${ids.dismissed}, ${project}, ${run}, 'dismissed',
            ${"f".repeat(64)}, 'Dismissed', 'Why', 'content',
            1, 1, 1, 1, 1, 200, 'dismissed', 1, NULL, 'irrelevant',
            '2026-09-03T00:00:00.000Z'),
          (${ids.foreign}, ${foreignProject}, ${foreignRun}, 'foreign',
            ${"0".repeat(64)}, 'Foreign', 'Why', 'content',
            1, 1, 1, 1, 1, 100, 'proposed', 0, NULL, NULL,
            '2026-09-03T00:00:00.000Z')
      `;
      await sql`
        INSERT INTO growth_actions (
          id, project_id, recommendation_id, creation_key, fact_hash, title,
          description, category, priority_score, status, state_version, due_at,
          approved_at, cancelled_at, created_at, updated_at
        ) VALUES (
          ${`priority_read_action_${suffix}`}, ${project},
          ${ids.acceptedWithAction}, 'action', ${"1".repeat(64)}, 'Action',
          'Action', 'content', 1, 'cancelled', 1,
          '2026-10-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z',
          '2026-09-02T00:00:00.000Z', '2026-09-01T00:00:00.000Z',
          '2026-09-02T00:00:00.000Z'
        )
      `;
      await sql`
        INSERT INTO growth_recommendation_targets (
          project_id, run_id, recommendation_id, target_type, target_value
        ) VALUES
          (${project}, ${run}, ${ids.proposedZ}, 'keyword', 'local'),
          (${foreignProject}, ${foreignRun}, ${ids.foreign}, 'keyword', 'foreign')
      `;
      await sql`
        INSERT INTO growth_recommendation_steps (
          project_id, run_id, recommendation_id, position, content
        ) VALUES
          (${project}, ${run}, ${ids.proposedZ}, 0, 'local'),
          (${foreignProject}, ${foreignRun}, ${ids.foreign}, 0, 'foreign')
      `;

      const first = await withPgClient(() =>
        repository.listRecommendationsPage({ projectId: project, limit: 1 }),
      );
      expect(first.map((row) => row.id)).toEqual([
        ids.proposedZ,
        ids.proposedA,
      ]);

      const second = await withPgClient(() =>
        repository.listRecommendationsPage({
          projectId: project,
          limit: 50,
          cursor: {
            priorityScore: 10,
            createdAt: "2026-09-01T00:00:00.000Z",
            id: ids.proposedZ,
          },
        }),
      );
      expect(second.map((row) => row.id)).toEqual([
        ids.proposedA,
        ids.snoozed,
        ids.acceptedWithoutAction,
      ]);

      const filtered = await withPgClient(() =>
        repository.listRecommendationsPage({
          projectId: project,
          statuses: ["accepted"],
          category: "commercial",
          minPriorityScore: 8,
          limit: 1,
        }),
      );
      expect(filtered.map((row) => row.id)).toEqual([
        ids.acceptedWithoutAction,
      ]);

      const [targets, steps] = await withPgClient(() =>
        Promise.all([
          repository.listTargetsForRecommendations(project, [
            ids.proposedZ,
            ids.foreign,
          ]),
          repository.listStepsForRecommendations(project, [
            ids.proposedZ,
            ids.foreign,
          ]),
        ]),
      );
      expect(targets).toMatchObject([
        { recommendationId: ids.proposedZ, targetValue: "local" },
      ]);
      expect(steps).toMatchObject([
        { recommendationId: ids.proposedZ, content: "local" },
      ]);
    } finally {
      await sql`DELETE FROM projects WHERE id IN (${project},${foreignProject})`;
      await sql`DELETE FROM organization WHERE id IN (${org},${foreignOrg})`;
    }
  }, 15_000);
});
