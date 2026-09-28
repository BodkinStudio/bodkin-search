/* eslint-disable max-lines, max-lines-per-function -- exhaustive live-provider page/rank acceptance is clearest as one sequential fixture */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { withPgClient as WithPgClient } from "@/db";
import type { GrowthPageContextRepository as Repository } from "./GrowthPageContextRepository";

const testUrl = process.env.TEST_POSTGRES_DATABASE_URL;
const describePostgres = testUrl ? describe : describe.skip;

vi.mock("cloudflare:workers", () => ({
  env: {
    DATABASE_PROVIDER: "postgres",
    HYPERDRIVE: { connectionString: testUrl },
  },
}));

let sql: ReturnType<typeof postgres>;
let repository: typeof Repository;
let withPgClient: typeof WithPgClient;

function pageVariants(path: string) {
  return [
    `http://example.com${path}`,
    `http://example.com${path}/`,
    `http://www.example.com${path}`,
    `http://www.example.com${path}/`,
    `https://example.com${path}`,
    `https://example.com${path}/`,
    `https://www.example.com${path}`,
    `https://www.example.com${path}/`,
  ];
}

describePostgres("GrowthPageContextRepository on PostgreSQL", () => {
  beforeAll(async () => {
    sql = postgres(testUrl!, { max: 4 });
    ({ GrowthPageContextRepository: repository } =
      await import("./GrowthPageContextRepository"));
    ({ withPgClient } = await import("@/db"));
  });

  afterAll(async () => {
    if (testUrl) await sql.end({ timeout: 5 });
  });

  it("keeps every page-context read isolated, cutoff-safe, bounded and C-ordered", async () => {
    const suffix = crypto.randomUUID();
    const makeId = (label: string) => `page_ctx_${label}_${suffix}`;
    const organizationId = makeId("org");
    const foreignOrganizationId = makeId("foreign_org");
    const projectId = makeId("project");
    const foreignProjectId = makeId("foreign_project");
    const growthRunId = makeId("growth_run");
    const foreignGrowthRunId = makeId("foreign_growth_run");
    const asOf = "2026-06-01T00:00:00.000Z";
    const before = "2026-05-01T00:00:00.000Z";
    const after = "2026-07-01T00:00:00.000Z";
    const page = "https://example.com/page";
    const otherPage = "https://example.com/other";
    const hash = "a".repeat(64);
    const recId = (label: string) => makeId(`rec_${label}`);
    const actionId = (label: string) => makeId(`action_${label}`);
    const changeId = (label: string) => makeId(`change_${label}`);
    const planId = (label: string) => makeId(`plan_${label}`);
    const configId = (label: string) => makeId(`config_${label}`);
    const keywordId = (label: string) => makeId(`keyword_${label}`);
    const rankRunId = (label: string) => makeId(`rank_run_${label}`);
    const recommendations = [
      {
        label: "top",
        project: projectId,
        run: growthRunId,
        score: 20,
        status: "proposed",
        createdAt: before,
      },
      {
        label: "future_action",
        project: projectId,
        run: growthRunId,
        score: 19,
        status: "accepted",
        createdAt: before,
      },
      {
        label: "foreign_action",
        project: projectId,
        run: growthRunId,
        score: 18,
        status: "accepted",
        createdAt: before,
      },
      {
        label: "A",
        project: projectId,
        run: growthRunId,
        score: 10,
        status: "proposed",
        createdAt: before,
      },
      {
        label: "a",
        project: projectId,
        run: growthRunId,
        score: 10,
        status: "proposed",
        createdAt: before,
      },
      {
        label: "snoozed",
        project: projectId,
        run: growthRunId,
        score: 9,
        status: "snoozed",
        createdAt: before,
      },
      {
        label: "seventh",
        project: projectId,
        run: growthRunId,
        score: 8,
        status: "accepted",
        createdAt: before,
      },
      {
        label: "suppressed",
        project: projectId,
        run: growthRunId,
        score: 99,
        status: "accepted",
        createdAt: before,
      },
      {
        label: "future",
        project: projectId,
        run: growthRunId,
        score: 100,
        status: "proposed",
        createdAt: after,
      },
      {
        label: "wrong_url",
        project: projectId,
        run: growthRunId,
        score: 100,
        status: "proposed",
        createdAt: before,
      },
      {
        label: "foreign",
        project: foreignProjectId,
        run: foreignGrowthRunId,
        score: 100,
        status: "proposed",
        createdAt: before,
      },
    ] as const;

    const actionSpecs = [
      {
        label: "A",
        project: projectId,
        recommendation: "top",
        score: 10,
        status: "approved",
        createdAt: before,
        updatedAt: before,
      },
      {
        label: "a",
        project: projectId,
        recommendation: "top",
        score: 10,
        status: "ready",
        createdAt: before,
        updatedAt: after,
      },
      {
        label: "b",
        project: projectId,
        recommendation: "top",
        score: 10,
        status: "in_progress",
        createdAt: before,
        updatedAt: before,
      },
      {
        label: "blocked",
        project: projectId,
        recommendation: "top",
        score: 9,
        status: "blocked",
        createdAt: before,
        updatedAt: before,
      },
      {
        label: "implemented",
        project: projectId,
        recommendation: "top",
        score: 8,
        status: "implemented",
        createdAt: before,
        updatedAt: before,
      },
      {
        label: "measuring",
        project: projectId,
        recommendation: "top",
        score: 7,
        status: "measuring",
        createdAt: before,
        updatedAt: before,
      },
      {
        label: "seventh",
        project: projectId,
        recommendation: "top",
        score: 6,
        status: "ready",
        createdAt: before,
        updatedAt: before,
      },
      {
        label: "plan_extra",
        project: projectId,
        recommendation: "top",
        score: 0,
        status: "ready",
        createdAt: before,
        updatedAt: before,
      },
      {
        label: "suppresses",
        project: projectId,
        recommendation: "suppressed",
        score: 0,
        status: "ready",
        createdAt: before,
        updatedAt: before,
      },
      {
        label: "after_cutoff",
        project: projectId,
        recommendation: "future_action",
        score: 100,
        status: "ready",
        createdAt: after,
        updatedAt: after,
      },
      {
        label: "evaluated",
        project: projectId,
        recommendation: "top",
        score: 100,
        status: "evaluated",
        createdAt: before,
        updatedAt: before,
      },
      {
        label: "cancelled",
        project: projectId,
        recommendation: "top",
        score: 100,
        status: "cancelled",
        createdAt: before,
        updatedAt: before,
      },
      {
        label: "wrong_url",
        project: projectId,
        recommendation: "top",
        score: 100,
        status: "ready",
        createdAt: before,
        updatedAt: before,
      },
      {
        label: "foreign",
        project: foreignProjectId,
        recommendation: "foreign",
        score: 100,
        status: "ready",
        createdAt: before,
        updatedAt: before,
      },
    ] as const;
    const stateVersion: Record<string, number> = {
      approved: 0,
      ready: 1,
      in_progress: 2,
      blocked: 2,
      implemented: 3,
      measuring: 4,
      evaluated: 5,
      cancelled: 1,
    };

    try {
      await sql`
        INSERT INTO organization (id, name, slug, created_at) VALUES
          (${organizationId}, 'Page context', ${`page-context-${suffix}`}, now()),
          (${foreignOrganizationId}, 'Foreign page context', ${`foreign-page-context-${suffix}`}, now())
      `;
      await sql`
        INSERT INTO projects (id, organization_id, name, domain) VALUES
          (${projectId}, ${organizationId}, 'Page context', 'example.com'),
          (${foreignProjectId}, ${foreignOrganizationId}, 'Foreign context', 'foreign.example')
      `;
      await sql`
        INSERT INTO growth_runs (id, project_id, run_type, trigger, status, cadence_slot, period_start, period_end, started_at, completed_at, detector_version) VALUES
          (${growthRunId}, ${projectId}, 'manual_analysis', 'manual', 'completed', ${`page-${suffix}`}, '2026-04-01', '2026-04-30', ${before}, ${before}, 'v1'),
          (${foreignGrowthRunId}, ${foreignProjectId}, 'manual_analysis', 'manual', 'completed', ${`foreign-page-${suffix}`}, '2026-04-01', '2026-04-30', ${before}, ${before}, 'v1')
      `;
      await sql`
        INSERT INTO project_key_pages (id, project_id, url, role, commercial_weight, protected, actively_optimized, topic, notes, updated_at, updated_by) VALUES
          (${makeId("key_exact")}, ${projectId}, ${`${page}?variant=1`}, 'money', 5, true, true, 'Exact query', 'Exact notes', ${before}, 'user'),
          (${makeId("key_other")}, ${projectId}, ${`${page}?variant=2`}, 'spoke', 1, false, false, 'Other query', NULL, ${before}, 'user'),
          (${makeId("key_foreign")}, ${foreignProjectId}, ${`${page}?variant=1`}, 'hub', 2, false, false, 'Foreign', NULL, ${before}, 'user')
      `;

      for (const recommendation of recommendations) {
        await sql`
          INSERT INTO growth_recommendations (id, project_id, run_id, creation_key, fact_hash, title, rationale, category, impact, commercial_relevance, effort, urgency, confidence, priority_score, status, review_version, snoozed_until, created_at)
          VALUES (${recId(recommendation.label)}, ${recommendation.project}, ${recommendation.run}, ${`page-${recommendation.label}-${suffix}`}, ${hash}, ${recommendation.label}, 'Rationale', 'content', 5, 4, 2, 2, .9, ${recommendation.score}, ${recommendation.status}, 0, ${recommendation.status === "snoozed" ? "2026-08-01" : null}, ${recommendation.createdAt})
        `;
        await sql`
          INSERT INTO growth_recommendation_targets (project_id, run_id, recommendation_id, target_type, target_value)
          VALUES (${recommendation.project}, ${recommendation.run}, ${recId(recommendation.label)}, 'url', ${recommendation.label === "wrong_url" ? otherPage : page})
        `;
      }

      for (const action of actionSpecs) {
        const version = stateVersion[action.status];
        const startedAt = ["in_progress", "blocked"].includes(action.status)
          ? before
          : null;
        const implementedAt = [
          "implemented",
          "measuring",
          "evaluated",
        ].includes(action.status)
          ? before
          : null;
        await sql`
          INSERT INTO growth_actions (id, project_id, recommendation_id, creation_key, fact_hash, title, description, category, priority_score, status, state_version, due_at, approved_at, started_at, implemented_at, evaluated_at, cancelled_at, created_at, updated_at)
          VALUES (${actionId(action.label)}, ${action.project}, ${recId(action.recommendation)}, ${`action-${action.label}-${suffix}`}, ${hash}, ${action.label}, 'Description', 'content', ${action.score}, ${action.status}, ${version}, '2026-06-10', ${before}, ${startedAt}, ${implementedAt}, ${action.status === "evaluated" ? before : null}, ${action.status === "cancelled" ? before : null}, ${action.createdAt}, ${action.updatedAt})
        `;
        if (action.label !== "suppresses") {
          await sql`
            INSERT INTO growth_action_targets (project_id, action_id, target_type, target_value)
            VALUES (${action.project}, ${actionId(action.label)}, 'url', ${action.label === "wrong_url" ? otherPage : page})
          `;
        }
      }

      const changeSpecs = [
        {
          label: "A",
          project: projectId,
          happenedAt: "2026-05-20T00:00:00.000Z",
          createdAt: "2026-05-20T00:00:00.000Z",
        },
        {
          label: "a",
          project: projectId,
          happenedAt: "2026-05-20T00:00:00.000Z",
          createdAt: "2026-05-20T00:00:00.000Z",
        },
        {
          label: "3",
          project: projectId,
          happenedAt: "2026-05-19T00:00:00.000Z",
          createdAt: before,
        },
        {
          label: "4",
          project: projectId,
          happenedAt: "2026-05-18T00:00:00.000Z",
          createdAt: before,
        },
        {
          label: "5",
          project: projectId,
          happenedAt: "2026-05-17T00:00:00.000Z",
          createdAt: before,
        },
        {
          label: "6",
          project: projectId,
          happenedAt: "2026-05-16T00:00:00.000Z",
          createdAt: before,
        },
        {
          label: "7",
          project: projectId,
          happenedAt: "2026-05-15T00:00:00.000Z",
          createdAt: before,
        },
        {
          label: "future_created",
          project: projectId,
          happenedAt: "2026-05-30T00:00:00.000Z",
          createdAt: after,
        },
        {
          label: "future_happened",
          project: projectId,
          happenedAt: after,
          createdAt: before,
        },
        {
          label: "wrong_url",
          project: projectId,
          happenedAt: "2026-05-30T00:00:00.000Z",
          createdAt: before,
        },
        {
          label: "foreign",
          project: foreignProjectId,
          happenedAt: "2026-05-30T00:00:00.000Z",
          createdAt: before,
        },
      ];
      for (const change of changeSpecs) {
        await sql`
          INSERT INTO growth_change_events (id, project_id, creation_key, fact_hash, source, change_type, actor_type, actor_id, description, happened_at, created_at)
          VALUES (${changeId(change.label)}, ${change.project}, ${`change-${change.label}-${suffix}`}, ${hash}, 'manual', 'content_updated', 'system', 'test', ${change.label}, ${change.happenedAt}, ${change.createdAt})
        `;
        await sql`
          INSERT INTO growth_change_event_urls (project_id, change_event_id, url)
          VALUES (${change.project}, ${changeId(change.label)}, ${change.label === "wrong_url" ? otherPage : page})
        `;
      }

      const planSpecs = [
        {
          label: "A",
          action: "a",
          status: "active",
          version: 2,
          end: "2026-06-10",
          longEnd: null,
          createdAt: before,
          project: projectId,
        },
        {
          label: "a",
          action: "b",
          status: "active",
          version: 2,
          end: "2026-06-10",
          longEnd: null,
          createdAt: before,
          project: projectId,
        },
        {
          label: "3",
          action: "blocked",
          status: "active",
          version: 2,
          end: "2026-06-11",
          longEnd: null,
          createdAt: before,
          project: projectId,
        },
        {
          label: "4",
          action: "implemented",
          status: "active",
          version: 3,
          end: "2026-06-12",
          longEnd: null,
          createdAt: before,
          project: projectId,
        },
        {
          label: "5",
          action: "measuring",
          status: "active",
          version: 3,
          end: "2026-06-12",
          longEnd: "2026-06-13",
          createdAt: before,
          project: projectId,
        },
        {
          label: "6",
          action: "seventh",
          status: "active",
          version: 1,
          end: "2026-06-14",
          longEnd: null,
          createdAt: before,
          project: projectId,
        },
        {
          label: "7",
          action: "plan_extra",
          status: "active",
          version: 5,
          end: "2026-06-15",
          longEnd: null,
          createdAt: before,
          project: projectId,
        },
        {
          label: "completed",
          action: "evaluated",
          status: "completed",
          version: 5,
          end: "2026-05-20",
          longEnd: null,
          createdAt: before,
          project: projectId,
        },
        {
          label: "future",
          action: "suppresses",
          status: "active",
          version: 1,
          end: "2026-06-01",
          longEnd: null,
          createdAt: after,
          project: projectId,
        },
        {
          label: "future_action",
          action: "after_cutoff",
          status: "active",
          version: 1,
          end: "2026-06-01",
          longEnd: null,
          createdAt: before,
          project: projectId,
        },
        {
          label: "wrong_url",
          action: "wrong_url",
          status: "active",
          version: 1,
          end: "2026-06-01",
          longEnd: null,
          createdAt: before,
          project: projectId,
        },
        {
          label: "foreign",
          action: "foreign",
          status: "active",
          version: 1,
          end: "2026-06-01",
          longEnd: null,
          createdAt: before,
          project: foreignProjectId,
        },
      ] as const;
      for (const plan of planSpecs) {
        await sql`
          INSERT INTO growth_measurement_plans (id, project_id, action_id, fact_hash, status, action_version, anchor_at, anchor_date, report_timezone, baseline_start, baseline_end, cooldown_end, measurement_start, measurement_end, long_measurement_end, comparison_mode, completed_at, created_at)
          VALUES (${planId(plan.label)}, ${plan.project}, ${actionId(plan.action)}, ${hash}, ${plan.status}, ${plan.version}, '2026-02-01T00:00:00.000Z', '2026-02-01', 'UTC', '2026-01-01', '2026-01-31', '2026-02-02', '2026-02-03', ${plan.end}, ${plan.longEnd}, 'preceding_period', ${plan.status === "completed" ? "2026-05-21T00:00:00.000Z" : null}, ${plan.createdAt})
        `;
      }

      await sql`
        INSERT INTO rank_tracking_configs (id, project_id, domain, serp_depth, is_active) VALUES
          (${configId("active")}, ${projectId}, 'example.com', 20, true),
          (${configId("inactive")}, ${projectId}, 'inactive.example.com', 20, false),
          (${configId("foreign")}, ${foreignProjectId}, 'example.com', 20, true)
      `;
      const orderedSpecs = [
        { label: "01", keyword: "position 01", device: "desktop", position: 1 },
        { label: "02", keyword: "position 02", device: "desktop", position: 2 },
        { label: "03", keyword: "position 03", device: "desktop", position: 3 },
        { label: "04", keyword: "position 04", device: "desktop", position: 4 },
        { label: "05", keyword: "position 05", device: "desktop", position: 5 },
        { label: "06", keyword: "position 06", device: "desktop", position: 6 },
        { label: "A", keyword: "Alpha", device: "desktop", position: 20 },
        { label: "a", keyword: "alpha", device: "desktop", position: 20 },
        {
          label: "same",
          keyword: "same keyword",
          device: "desktop",
          position: 21,
        },
        {
          label: "same",
          keyword: "same keyword",
          device: "mobile",
          position: 21,
        },
        {
          label: "null_A",
          keyword: "Null A",
          device: "desktop",
          position: null,
        },
        {
          label: "null_a",
          keyword: "Null a",
          device: "desktop",
          position: null,
        },
      ] as const;
      const specialLabels = [
        "moved",
        "checked_tie",
        "id_tie",
        "future_run",
        "future_snapshot",
        "failed",
        "null_completed",
        "wrong_url",
      ];
      const uniqueOrdered = [
        ...new Map(
          orderedSpecs.map((row) => [row.label, row.keyword]),
        ).entries(),
      ];
      for (const [label, keyword] of uniqueOrdered) {
        await sql`INSERT INTO rank_tracking_keywords (id, config_id, keyword) VALUES (${keywordId(label)}, ${configId("active")}, ${keyword})`;
      }
      for (const label of specialLabels) {
        await sql`INSERT INTO rank_tracking_keywords (id, config_id, keyword) VALUES (${keywordId(label)}, ${configId("active")}, ${label})`;
      }
      await sql`
        INSERT INTO rank_tracking_keywords (id, config_id, keyword) VALUES
          (${keywordId("inactive")}, ${configId("inactive")}, 'inactive'),
          (${keywordId("foreign")}, ${configId("foreign")}, 'foreign')
      `;
      const rankRuns = [
        {
          label: "ordered",
          config: "active",
          project: projectId,
          status: "completed",
          completedAt: before,
        },
        {
          label: "old",
          config: "active",
          project: projectId,
          status: "completed",
          completedAt: "2026-04-01T00:00:00.000Z",
        },
        {
          label: "new",
          config: "active",
          project: projectId,
          status: "completed",
          completedAt: before,
        },
        {
          label: "same_1",
          config: "active",
          project: projectId,
          status: "completed",
          completedAt: "2026-05-15T00:00:00.000Z",
        },
        {
          label: "same_2",
          config: "active",
          project: projectId,
          status: "completed",
          completedAt: "2026-05-15T00:00:00.000Z",
        },
        {
          label: "future",
          config: "active",
          project: projectId,
          status: "completed",
          completedAt: after,
        },
        {
          label: "failed",
          config: "active",
          project: projectId,
          status: "failed",
          completedAt: "2026-05-20T00:00:00.000Z",
        },
        {
          label: "null",
          config: "active",
          project: projectId,
          status: "completed",
          completedAt: null,
        },
        {
          label: "inactive",
          config: "inactive",
          project: projectId,
          status: "completed",
          completedAt: "2026-05-20T00:00:00.000Z",
        },
        {
          label: "foreign",
          config: "foreign",
          project: foreignProjectId,
          status: "completed",
          completedAt: "2026-05-20T00:00:00.000Z",
        },
      ] as const;
      for (const run of rankRuns) {
        await sql`
          INSERT INTO rank_check_runs (id, config_id, project_id, status, started_at, completed_at)
          VALUES (${rankRunId(run.label)}, ${configId(run.config)}, ${run.project}, ${run.status}, '2026-04-01T00:00:00.000Z', ${run.completedAt})
        `;
      }
      const insertSnapshot = async (input: {
        run: string;
        keyword: string;
        keywordText?: string;
        device?: string;
        position: number | null;
        url: string;
        checkedAt: string;
      }) => {
        const [row] = await sql<{ id: number }[]>`
          INSERT INTO rank_snapshots (run_id, tracking_keyword_id, keyword, device, position, url, checked_at)
          VALUES (${rankRunId(input.run)}, ${keywordId(input.keyword)}, ${input.keywordText ?? input.keyword}, ${input.device ?? "desktop"}, ${input.position}, ${input.url}, ${input.checkedAt}) RETURNING id
        `;
        return row.id;
      };
      const variants = pageVariants("/page");
      for (const [index, row] of orderedSpecs.entries()) {
        await insertSnapshot({
          run: "ordered",
          keyword: row.label,
          keywordText: row.keyword,
          device: row.device,
          position: row.position,
          url: variants[index % variants.length],
          checkedAt: before,
        });
      }
      await insertSnapshot({
        run: "old",
        keyword: "moved",
        position: 1,
        url: "https://example.com/winner",
        checkedAt: "2026-04-01T00:00:00.000Z",
      });
      await insertSnapshot({
        run: "new",
        keyword: "moved",
        position: 1,
        url: otherPage,
        checkedAt: before,
      });
      await insertSnapshot({
        run: "same_1",
        keyword: "checked_tie",
        position: 2,
        url: "https://example.com/winner",
        checkedAt: before,
      });
      await insertSnapshot({
        run: "same_2",
        keyword: "checked_tie",
        position: 2,
        url: otherPage,
        checkedAt: "2026-05-02T00:00:00.000Z",
      });
      await insertSnapshot({
        run: "same_1",
        keyword: "id_tie",
        position: 3,
        url: "https://example.com/winner",
        checkedAt: "2026-05-03T00:00:00.000Z",
      });
      await insertSnapshot({
        run: "same_2",
        keyword: "id_tie",
        position: 3,
        url: otherPage,
        checkedAt: "2026-05-03T00:00:00.000Z",
      });
      const futureRunWinnerId = await insertSnapshot({
        run: "old",
        keyword: "future_run",
        position: 4,
        url: "http://www.example.com/winner/",
        checkedAt: "2026-04-01T00:00:00.000Z",
      });
      await insertSnapshot({
        run: "future",
        keyword: "future_run",
        position: 4,
        url: otherPage,
        checkedAt: "2026-05-30T00:00:00.000Z",
      });
      const futureSnapshotWinnerId = await insertSnapshot({
        run: "old",
        keyword: "future_snapshot",
        position: 5,
        url: "https://www.example.com/winner",
        checkedAt: "2026-04-01T00:00:00.000Z",
      });
      await insertSnapshot({
        run: "new",
        keyword: "future_snapshot",
        position: 5,
        url: otherPage,
        checkedAt: after,
      });
      await insertSnapshot({
        run: "failed",
        keyword: "failed",
        position: 1,
        url: "https://example.com/winner",
        checkedAt: before,
      });
      await insertSnapshot({
        run: "null",
        keyword: "null_completed",
        position: 1,
        url: "https://example.com/winner",
        checkedAt: before,
      });
      await insertSnapshot({
        run: "new",
        keyword: "removed",
        position: 1,
        url: "https://example.com/winner",
        checkedAt: before,
      });
      await insertSnapshot({
        run: "inactive",
        keyword: "inactive",
        position: 1,
        url: "https://example.com/winner",
        checkedAt: before,
      });
      await insertSnapshot({
        run: "foreign",
        keyword: "foreign",
        position: 1,
        url: "https://example.com/winner",
        checkedAt: before,
      });
      await insertSnapshot({
        run: "new",
        keyword: "wrong_url",
        position: 1,
        url: `${page}?query=1`,
        checkedAt: before,
      });

      await expect(
        withPgClient(() => repository.keyPage(projectId, `${page}?variant=1`)),
      ).resolves.toMatchObject({
        role: "money",
        topic: "Exact query",
        protected: true,
      });
      await expect(
        withPgClient(() => repository.keyPage(projectId, page)),
      ).resolves.toBeNull();

      const recommendationRows = await withPgClient(() =>
        repository.recommendations(projectId, page, asOf, 6),
      );
      expect(recommendationRows.map(({ id }) => id)).toEqual([
        recId("top"),
        recId("future_action"),
        recId("foreign_action"),
        recId("A"),
        recId("a"),
        recId("snoozed"),
      ]);
      const actionRows = await withPgClient(() =>
        repository.actions(projectId, page, asOf, 6),
      );
      expect(actionRows.map(({ id }) => id)).toEqual([
        actionId("A"),
        actionId("a"),
        actionId("b"),
        actionId("blocked"),
        actionId("implemented"),
        actionId("measuring"),
      ]);
      expect(actionRows.map(({ status }) => status)).toEqual([
        "approved",
        "ready",
        "in_progress",
        "blocked",
        "implemented",
        "measuring",
      ]);
      expect(actionRows[1]?.updatedAt).toBe(after);
      const changeRows = await withPgClient(() =>
        repository.changes(projectId, page, asOf, 6),
      );
      expect(changeRows.map(({ id }) => id)).toEqual([
        changeId("A"),
        changeId("a"),
        changeId("3"),
        changeId("4"),
        changeId("5"),
        changeId("6"),
      ]);
      const measurementRows = await withPgClient(() =>
        repository.measurements(projectId, page, asOf, 6),
      );
      expect(measurementRows.map(({ id }) => id)).toEqual([
        planId("A"),
        planId("a"),
        planId("3"),
        planId("4"),
        planId("5"),
        planId("6"),
      ]);
      expect(measurementRows[0]).toMatchObject({
        actionId: actionId("a"),
        actionVersion: 2,
        actionStatus: "ready",
        actionStateVersion: 1,
      });
      const winnerRows = await withPgClient(() =>
        repository.ranks(projectId, asOf, pageVariants("/winner"), 11),
      );
      expect(
        winnerRows.map(({ trackingKeywordId }) => trackingKeywordId),
      ).toEqual([keywordId("future_run"), keywordId("future_snapshot")]);
      expect(winnerRows.map(({ snapshotId }) => snapshotId)).toEqual([
        futureRunWinnerId,
        futureSnapshotWinnerId,
      ]);
      const orderedRows = await withPgClient(() =>
        repository.ranks(projectId, asOf, pageVariants("/page"), 11),
      );
      expect(
        orderedRows.map(({ trackingKeywordId }) => trackingKeywordId),
      ).toEqual([
        keywordId("01"),
        keywordId("02"),
        keywordId("03"),
        keywordId("04"),
        keywordId("05"),
        keywordId("06"),
        keywordId("A"),
        keywordId("a"),
        keywordId("same"),
        keywordId("same"),
        keywordId("null_A"),
      ]);
      expect(orderedRows.at(-1)?.position).toBeNull();
      expect(orderedRows).toHaveLength(11);
    } finally {
      await sql`DELETE FROM projects WHERE id IN (${projectId}, ${foreignProjectId})`;
      await sql`DELETE FROM organization WHERE id IN (${organizationId}, ${foreignOrganizationId})`;
    }
  }, 30_000);
});
