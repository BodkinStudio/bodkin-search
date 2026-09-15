import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { withPgClient as withPgClientExport } from "@/db";
import type { GrowthActionsRepository as RepositoryExport } from "./GrowthActionsRepository";

const testUrl = process.env.TEST_POSTGRES_DATABASE_URL;

vi.mock("cloudflare:workers", () => ({
  env: {
    DATABASE_PROVIDER: "postgres",
    HYPERDRIVE: { connectionString: testUrl },
  },
}));

let sql: ReturnType<typeof postgres>;
let GrowthActionsRepository: typeof RepositoryExport;
let withPgClient: typeof withPgClientExport;

const describePostgres = testUrl ? describe : describe.skip;

describePostgres("GrowthActionsRepository current read on Postgres", () => {
  beforeAll(async () => {
    // TEST_POSTGRES_DATABASE_URL explicitly opts into a disposable migrated
    // OpenSEO database. This test never creates, drops, or migrates databases.
    sql = postgres(testUrl!, { max: 4 });
    ({ GrowthActionsRepository } = await import("./GrowthActionsRepository"));
    ({ withPgClient } = await import("@/db"));
  });

  afterAll(async () => {
    if (testUrl) await sql.end({ timeout: 5 });
  });

  it("uses project-scoped code-unit keyset pagination and combined filters", async () => {
    const suffix = crypto.randomUUID();
    const organizationId = `growth_action_read_org_${suffix}`;
    const projectId = `growth_action_read_project_${suffix}`;
    const runId = `growth_action_read_run_${suffix}`;
    const recommendationId = `growth_action_read_recommendation_${suffix}`;
    const foreignOrganizationId = `growth_action_read_foreign_org_${suffix}`;
    const foreignProjectId = `growth_action_read_foreign_project_${suffix}`;
    const foreignRunId = `growth_action_read_foreign_run_${suffix}`;
    const foreignRecommendationId = `growth_action_read_foreign_recommendation_${suffix}`;
    const sameCreatedAt = "2026-08-31T12:00:00.000Z";
    const olderCreatedAt = "2026-08-30T12:00:00.000Z";
    const actionIds = {
      lowerB: `growth_action_read_${suffix}_b`,
      lowerA: `growth_action_read_${suffix}_a`,
      upperZ: `growth_action_read_${suffix}_Z`,
      older: `growth_action_read_${suffix}_old`,
      foreign: `growth_action_read_${suffix}_zz`,
    };

    try {
      await sql`
        INSERT INTO organization (id, name, slug, created_at) VALUES
          (${organizationId}, 'Growth Action read', ${`growth-action-read-${suffix}`}, now()),
          (${foreignOrganizationId}, 'Foreign Growth Action read', ${`growth-action-read-foreign-${suffix}`}, now())
      `;
      await sql`
        INSERT INTO projects (id, organization_id, name, domain) VALUES
          (${projectId}, ${organizationId}, 'Growth Action read', 'example.com'),
          (${foreignProjectId}, ${foreignOrganizationId}, 'Foreign Growth Action read', 'other.example')
      `;
      await sql`
        INSERT INTO growth_runs (
          id, project_id, run_type, trigger, status, cadence_slot, period_start,
          period_end, started_at, completed_at, detector_version
        ) VALUES
          (${runId}, ${projectId}, 'manual_analysis', 'manual', 'completed',
            ${`action-read-${suffix}`}, '2026-08-01', '2026-08-29',
            ${sameCreatedAt}, ${sameCreatedAt}, 'v1'),
          (${foreignRunId}, ${foreignProjectId}, 'manual_analysis', 'manual',
            'completed', ${`action-read-foreign-${suffix}`}, '2026-08-01',
            '2026-08-29', ${sameCreatedAt}, ${sameCreatedAt}, 'v1')
      `;
      await sql`
        INSERT INTO growth_recommendations (
          id, project_id, run_id, creation_key, fact_hash, title, rationale,
          category, impact, commercial_relevance, effort, urgency, confidence,
          priority_score, status, review_version
        ) VALUES
          (${recommendationId}, ${projectId}, ${runId}, ${`action-read-${suffix}`},
            ${"a".repeat(64)}, 'Read Actions', 'Verify current Action reads.',
            'content', 5, 5, 2, 3, 0.8, 10, 'accepted', 1),
          (${foreignRecommendationId}, ${foreignProjectId}, ${foreignRunId},
            ${`action-read-foreign-${suffix}`}, ${"b".repeat(64)},
            'Foreign Actions', 'Verify project isolation.', 'content',
            5, 5, 2, 3, 0.8, 10, 'accepted', 1)
      `;
      await sql`
        INSERT INTO growth_actions (
          id, project_id, recommendation_id, creation_key, fact_hash, title,
          description, category, priority_score, status, state_version,
          due_at, approved_at, created_at, updated_at
        ) VALUES
          (${actionIds.lowerB}, ${projectId}, ${recommendationId},
            ${`read-b-${suffix}`}, ${"1".repeat(64)}, 'Action b',
            'Read pagination acceptance.', 'content', 10, 'approved', 0,
            '2026-09-30T12:00:00.000Z', ${sameCreatedAt}, ${sameCreatedAt},
            ${sameCreatedAt}),
          (${actionIds.lowerA}, ${projectId}, ${recommendationId},
            ${`read-a-${suffix}`}, ${"2".repeat(64)}, 'Action a',
            'Read pagination acceptance.', 'content', 8, 'ready', 1,
            '2026-09-30T12:00:00.000Z', ${sameCreatedAt}, ${sameCreatedAt},
            ${sameCreatedAt}),
          (${actionIds.upperZ}, ${projectId}, ${recommendationId},
            ${`read-Z-${suffix}`}, ${"3".repeat(64)}, 'Action Z',
            'Read pagination acceptance.', 'technical', 5, 'approved', 0,
            '2026-09-30T12:00:00.000Z', ${sameCreatedAt}, ${sameCreatedAt},
            ${sameCreatedAt}),
          (${actionIds.older}, ${projectId}, ${recommendationId},
            ${`read-old-${suffix}`}, ${"4".repeat(64)}, 'Older Action',
            'Read pagination acceptance.', 'content', 2, 'approved', 0,
            '2026-09-30T12:00:00.000Z', ${olderCreatedAt}, ${olderCreatedAt},
            ${olderCreatedAt}),
          (${actionIds.foreign}, ${foreignProjectId},
            ${foreignRecommendationId}, ${`read-foreign-${suffix}`},
            ${"5".repeat(64)}, 'Foreign Action',
            'Must remain outside the project read.', 'content', 99,
            'approved', 0, '2026-09-30T12:00:00.000Z', ${sameCreatedAt},
            ${sameCreatedAt}, ${sameCreatedAt})
      `;

      const firstPage = await withPgClient(() =>
        GrowthActionsRepository.listActionsPage({ projectId, limit: 2 }),
      );
      expect(firstPage.map(({ id }) => id)).toEqual([
        actionIds.lowerB,
        actionIds.lowerA,
        actionIds.upperZ,
      ]);

      const secondPage = await withPgClient(() =>
        GrowthActionsRepository.listActionsPage({
          projectId,
          limit: 2,
          cursor: { createdAt: sameCreatedAt, id: actionIds.lowerA },
        }),
      );
      expect(secondPage.map(({ id }) => id)).toEqual([
        actionIds.upperZ,
        actionIds.older,
      ]);

      const filtered = await withPgClient(() =>
        GrowthActionsRepository.listActionsPage({
          projectId,
          statuses: ["approved"],
          category: "content",
          minPriorityScore: 9,
          limit: 50,
        }),
      );
      expect(filtered.map(({ id }) => id)).toEqual([actionIds.lowerB]);
    } finally {
      await sql`DELETE FROM projects WHERE id IN (${projectId}, ${foreignProjectId})`;
      await sql`DELETE FROM organization WHERE id IN (${organizationId}, ${foreignOrganizationId})`;
    }
  }, 15_000);
});
