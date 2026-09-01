/* eslint-disable max-lines -- provider-specific Action-detail fixture remains auditable in one place */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { withPgClient as WithPgClient } from "@/db";
import type { GrowthActionDetailRepository as Repository } from "./GrowthActionDetailRepository";

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

describePostgres("GrowthActionDetailRepository PostgreSQL", () => {
  beforeAll(async () => {
    sql = postgres(testUrl!, { max: 4 });
    ({ GrowthActionDetailRepository: repository } =
      await import("./GrowthActionDetailRepository"));
    ({ withPgClient } = await import("@/db"));
  });
  afterAll(async () => {
    if (testUrl) await sql.end({ timeout: 5 });
  });

  it("keeps Action-detail roots project-leading and applies C-ordered bounded windows", async () => {
    const suffix = crypto.randomUUID();
    const org = `detail_org_${suffix}`;
    const project = `detail_project_${suffix}`;
    const foreign = `detail_foreign_${suffix}`;
    const run = `detail_run_${suffix}`;
    const action = `detail_action_${suffix}`;
    const rec = `detail_rec_${suffix}`;
    const hash = "a".repeat(64);
    try {
      await sql`INSERT INTO organization (id, name, slug, created_at) VALUES (${org}, 'detail', ${`detail-${suffix}`}, now())`;
      await sql`INSERT INTO projects (id, organization_id, name, domain) VALUES (${project}, ${org}, 'detail', 'example.com'), (${foreign}, ${org}, 'foreign', 'foreign.example')`;
      await sql`INSERT INTO growth_runs (id, project_id, run_type, trigger, status, cadence_slot, period_start, period_end, started_at, completed_at, detector_version) VALUES (${run}, ${project}, 'manual_analysis', 'manual', 'completed', ${suffix}, '2026-05-01', '2026-05-31', '2026-05-01T00:00:00.000Z', '2026-05-31T00:00:00.000Z', 'v1')`;
      await sql`INSERT INTO growth_recommendations (id, project_id, run_id, creation_key, fact_hash, title, rationale, category, impact, commercial_relevance, effort, urgency, confidence, priority_score, status, review_version) VALUES (${rec}, ${project}, ${run}, ${`rec-${suffix}`}, ${hash}, 'Recommendation', 'Rationale', 'content', 5, 4, 2, 3, .8, 10, 'accepted', 1)`;
      await sql`INSERT INTO growth_actions (id, project_id, recommendation_id, creation_key, fact_hash, title, description, category, priority_score, status, state_version, due_at, approved_at) VALUES (${action}, ${project}, ${rec}, ${`action-${suffix}`}, ${hash}, 'Action', 'Description', 'content', 10, 'ready', 1, '2026-06-30T00:00:00.000Z', '2026-05-01T00:00:00.000Z')`;
      await sql`INSERT INTO growth_action_targets (project_id, action_id, target_type, target_value) VALUES (${project}, ${action}, 'keyword', 'a'), (${project}, ${action}, 'keyword', 'A')`;
      await sql`INSERT INTO growth_action_events (id, project_id, action_id, action_version, fact_hash, event_type, actor_type, actor_id, from_status, to_status, created_at) VALUES (${`event0-${suffix}`}, ${project}, ${action}, 0, ${hash}, 'created', 'user', 'u', null, 'approved', '2026-06-01T11:00:00.000Z'), (${`event1-${suffix}`}, ${project}, ${action}, 1, ${hash}, 'status_changed', 'user', 'u', 'approved', 'ready', '2026-06-01T12:00:00.000Z')`;
      for (const insightSuffix of ["A", "a", "b", "c", "d", "e"]) {
        const insight = `detail_insight_${insightSuffix}_${suffix}`;
        await sql`INSERT INTO growth_insights (id, project_id, run_id, creation_key, fact_hash, title, explanation, hypothesis, confidence, created_at) VALUES (${insight}, ${project}, ${run}, ${`insight-${insightSuffix}-${suffix}`}, ${hash}, ${`Insight ${insightSuffix}`}, 'Explanation', 'Hypothesis', .7, '2026-06-01T10:00:00.000Z')`;
        await sql`INSERT INTO growth_recommendation_insights (project_id, run_id, recommendation_id, insight_id) VALUES (${project}, ${run}, ${rec}, ${insight})`;
      }
      const firstInsight = `detail_insight_A_${suffix}`;
      for (let index = 0; index < 7; index++) {
        const signal = `detail_signal_${index}_${suffix}`;
        await sql`INSERT INTO growth_signals (id, project_id, run_id, signal_type, entity_type, entity_ref, metric, severity, confidence, period_start, period_end, baseline_value, current_value, delta_value, delta_percent, evidence_kind, evidence_ref, captured_at) VALUES (${signal}, ${project}, ${run}, 'signal', 'url', ${`https://example.com/${index}`}, 'clicks', 'warning', .5, '2026-05-01', '2026-05-31', 1, 2, 1, 100, 'gsc_period', 'ref', '2026-06-01T10:00:00.000Z')`;
        await sql`INSERT INTO growth_insight_signals (project_id, run_id, insight_id, signal_id) VALUES (${project}, ${run}, ${firstInsight}, ${signal})`;
      }
      const sources = [
        "manual",
        "sherpa",
        "cms_webhook",
        "deployment",
      ] as const;
      const changes: string[] = [];
      for (let index = 0; index < 11; index++) {
        const change = `detail_change_${index}_${suffix}`;
        changes.push(change);
        await sql`INSERT INTO growth_change_events (id, project_id, creation_key, fact_hash, source, change_type, actor_type, actor_id, description, happened_at, created_at) VALUES (${change}, ${project}, ${`change-${index}-${suffix}`}, ${hash}, ${sources[index % sources.length]}, 'content_updated', 'user', 'u', ${`change ${index}`}, ${`2026-06-01T11:${String(index).padStart(2, "0")}:00.000Z`}, '2026-06-01T11:00:00.000Z')`;
        await sql`INSERT INTO growth_action_changes (project_id, action_id, change_event_id) VALUES (${project}, ${action}, ${change})`;
      }
      for (const [label, happenedAt, createdAt] of [
        [
          "future_happened",
          "2026-06-01T13:00:00.000Z",
          "2026-06-01T11:00:00.000Z",
        ],
        [
          "future_created",
          "2026-06-01T11:00:00.000Z",
          "2026-06-01T13:00:00.000Z",
        ],
      ] as const) {
        const change = `detail_${label}_${suffix}`;
        await sql`INSERT INTO growth_change_events (id, project_id, creation_key, fact_hash, source, change_type, actor_type, actor_id, description, happened_at, created_at) VALUES (${change}, ${project}, ${`change-${label}-${suffix}`}, ${hash}, 'manual', 'content_updated', 'user', 'u', ${label}, ${happenedAt}, ${createdAt})`;
        await sql`INSERT INTO growth_action_changes (project_id, action_id, change_event_id) VALUES (${project}, ${action}, ${change})`;
      }
      for (const change of [changes[9], changes[10]]) {
        for (const letter of ["A", "a", "b", "c", "d", "e", "z"]) {
          await sql`INSERT INTO growth_change_event_urls (project_id, change_event_id, url) VALUES (${project}, ${change}, ${`https://example.com/${letter}`})`;
        }
      }
      const result = await withPgClient(() =>
        repository.getDetail(project, action, "2026-06-01T12:00:00.000Z"),
      );
      expect(
        result?.actionTargets.map(({ targetValue }) => targetValue),
      ).toEqual(["A", "a"]);
      expect(result?.history.map(({ actionVersion }) => actionVersion)).toEqual(
        [1, 0],
      );
      expect(result?.insights.map(({ id }) => id)).toEqual([
        `detail_insight_A_${suffix}`,
        `detail_insight_a_${suffix}`,
        `detail_insight_b_${suffix}`,
        `detail_insight_c_${suffix}`,
        `detail_insight_d_${suffix}`,
        `detail_insight_e_${suffix}`,
      ]);
      expect(result?.signals).toHaveLength(6);
      expect(result?.signals.map(({ id }) => id)).toEqual(
        Array.from(
          { length: 6 },
          (_, index) => `detail_signal_${index}_${suffix}`,
        ),
      );
      expect(result?.changes).toHaveLength(11);
      expect(result?.changes.some(({ id }) => id.includes("future_"))).toBe(
        false,
      );
      expect(new Set(result?.changes.map(({ source }) => source)).size).toBe(4);
      expect(result?.urls).toHaveLength(12);
      for (const change of [changes[9], changes[10]]) {
        expect(
          result?.urls
            .filter(({ changeEventId }) => changeEventId === change)
            .map(({ url }) => url),
        ).toEqual([
          "https://example.com/A",
          "https://example.com/a",
          "https://example.com/b",
          "https://example.com/c",
          "https://example.com/d",
          "https://example.com/e",
        ]);
      }
      await expect(
        withPgClient(() =>
          repository.getDetail(foreign, action, "2026-06-01T12:00:00.000Z"),
        ),
      ).resolves.toBeNull();
    } finally {
      await sql`DELETE FROM organization WHERE id = ${org}`;
    }
  });
});
