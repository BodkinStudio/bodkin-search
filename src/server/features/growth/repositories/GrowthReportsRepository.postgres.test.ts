/* eslint-disable max-lines, max-lines-per-function -- live-provider concurrency acceptance is clearest in one fixture */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { withPgClient as withPgClientExport } from "@/db";
import {
  GROWTH_REPORT_CONTENT_SCHEMA_VERSION,
  GROWTH_REPORT_SECTION_POSITIONS,
  GROWTH_REPORT_SECTION_TYPES,
  type GrowthReportSection,
} from "@/types/schemas/growth-reports";
import {
  buildGrowthReportSnapshot,
  GROWTH_REPORT_BUILDER_VERSION,
} from "../services/GrowthReportSnapshot";
import type { GrowthReportsRepository as RepositoryExport } from "./GrowthReportsRepository";

const testUrl = process.env.TEST_POSTGRES_DATABASE_URL;

vi.mock("cloudflare:workers", () => ({
  env: {
    DATABASE_PROVIDER: "postgres",
    HYPERDRIVE: { connectionString: testUrl },
  },
}));

type Repository = typeof RepositoryExport;
type WithPgClient = typeof withPgClientExport;

let sql: ReturnType<typeof postgres>;
let repo: Repository;
let withPgClient: WithPgClient;

const describePostgres = testUrl ? describe : describe.skip;

function sections(
  actionId: string,
  resultId: string,
  summary: string,
): GrowthReportSection[] {
  return GROWTH_REPORT_SECTION_TYPES.map((sectionType) => ({
    sectionType,
    position: GROWTH_REPORT_SECTION_POSITIONS[sectionType],
    content: {
      summary: `${summary}: ${sectionType}`,
      items:
        sectionType === "executive_summary"
          ? [
              {
                key: "action",
                position: 0,
                title: "Completed work",
                summary,
                facts: [],
                evidence: [],
                source: { type: "action", id: actionId },
              },
            ]
          : sectionType === "performance"
            ? [
                {
                  key: "result",
                  position: 0,
                  title: "Measured result",
                  summary,
                  facts: [],
                  evidence: [],
                  source: { type: "measurement_result", id: resultId },
                },
              ]
            : [],
    },
  }));
}

async function reportWrite(input: {
  projectId: string;
  actionId: string;
  resultId: string;
  name: string;
  summary: string;
  version?: number;
}) {
  const version = input.version ?? 1;
  const snapshot = await buildGrowthReportSnapshot({
    projectId: input.projectId,
    reportType: "monthly",
    periodStart: "2026-07-01",
    periodEnd: "2026-07-31",
    version,
    reportTimezone: "Europe/London",
    dataCutoffAt: "2026-08-01T08:00:00.000Z",
    generatedAt: "2026-08-01T09:00:00.000Z",
    builderVersion: GROWTH_REPORT_BUILDER_VERSION,
    contentSchemaVersion: GROWTH_REPORT_CONTENT_SCHEMA_VERSION,
    createdByType: "agent",
    createdById: input.name,
    sections: sections(input.actionId, input.resultId, input.summary),
  });
  return {
    id: `gr_report_${input.name}`,
    projectId: input.projectId,
    factHash: snapshot.factHash,
    reportType: "monthly" as const,
    periodStart: "2026-07-01",
    periodEnd: "2026-07-31",
    version,
    reportTimezone: "Europe/London",
    dataCutoffAt: "2026-08-01T08:00:00.000Z",
    generatedAt: "2026-08-01T09:00:00.000Z",
    builderVersion: GROWTH_REPORT_BUILDER_VERSION,
    contentSchemaVersion: GROWTH_REPORT_CONTENT_SCHEMA_VERSION,
    createdByType: "agent" as const,
    createdById: input.name,
    sections: snapshot.sections.map((section, index) => ({
      id: `gr_section_${input.name}_${index}`,
      ...section,
    })),
    actionIds: [input.actionId],
    measurementResultIds: [input.resultId],
  };
}

async function seedSource(suffix: string) {
  const organizationId = `gr_org_${suffix}`;
  const projectId = `gr_project_${suffix}`;
  const foreignProjectId = `gr_foreign_project_${suffix}`;
  const runId = `gr_run_${suffix}`;
  const foreignRunId = `gr_foreign_run_${suffix}`;
  const actionId = `gr_action_${suffix}`;
  const foreignActionId = `gr_foreign_action_${suffix}`;
  const resultId = `gr_result_${suffix}`;
  const foreignResultId = `gr_foreign_result_${suffix}`;
  await sql`
    INSERT INTO organization (id, name, slug, created_at)
    VALUES (${organizationId}, 'Growth Report test', ${`gr-${suffix}`}, now())
  `;
  await sql`
    INSERT INTO projects (id, organization_id, name, domain)
    VALUES
      (${projectId}, ${organizationId}, 'Growth Report test', 'example.com'),
      (${foreignProjectId}, ${organizationId}, 'Foreign Report test', 'other.example')
  `;
  for (const source of [
    {
      projectId,
      runId,
      actionId,
      resultId,
      prefix: "main",
    },
    {
      projectId: foreignProjectId,
      runId: foreignRunId,
      actionId: foreignActionId,
      resultId: foreignResultId,
      prefix: "foreign",
    },
  ]) {
    const recommendationId = `gr_recommendation_${source.prefix}_${suffix}`;
    const planId = `gr_plan_${source.prefix}_${suffix}`;
    await sql`
      INSERT INTO growth_runs (
        id, project_id, run_type, trigger, status, cadence_slot, period_start,
        period_end, started_at, completed_at, detector_version
      ) VALUES (
        ${source.runId}, ${source.projectId}, 'manual_analysis', 'manual',
        'completed', ${`gr-${source.prefix}-${suffix}`}, '2026-07-01',
        '2026-07-31', '2026-08-01T07:00:00.000Z',
        '2026-08-01T08:00:00.000Z', 'v1'
      )
    `;
    await sql`
      INSERT INTO growth_recommendations (
        id, project_id, run_id, creation_key, fact_hash, title, rationale,
        category, impact, commercial_relevance, effort, urgency, confidence,
        priority_score, status, review_version, reviewed_at
      ) VALUES (
        ${recommendationId}, ${source.projectId}, ${source.runId},
        ${`gr-${source.prefix}-${suffix}`}, ${"a".repeat(64)}, 'Report work',
        'Useful work', 'content', 5, 5, 2, 3, 0.8, 10, 'accepted', 1,
        '2026-07-01T08:00:00.000Z'
      )
    `;
    await sql`
      INSERT INTO growth_actions (
        id, project_id, recommendation_id, creation_key, fact_hash, title,
        description, category, priority_score, status, state_version, due_at,
        approved_at, started_at, implemented_at, evaluated_at
      ) VALUES (
        ${source.actionId}, ${source.projectId}, ${recommendationId},
        ${`gr-${source.prefix}-${suffix}`}, ${"b".repeat(64)}, 'Report work',
        'Ship the work', 'content', 10, 'evaluated', 4,
        '2026-08-31T12:00:00.000Z', '2026-06-01T12:00:00.000Z',
        '2026-06-02T12:00:00.000Z', '2026-06-15T12:00:00.000Z',
        '2026-07-31T12:00:00.000Z'
      )
    `;
    await sql`
      INSERT INTO growth_measurement_plans (
        id, project_id, action_id, fact_hash, status, action_version, anchor_at,
        anchor_date, report_timezone, baseline_start, baseline_end,
        cooldown_end, measurement_start, measurement_end, comparison_mode,
        completed_at
      ) VALUES (
        ${planId}, ${source.projectId}, ${source.actionId}, ${"c".repeat(64)},
        'completed', 3, '2026-06-15T12:00:00.000Z', '2026-06-15',
        'Europe/London', '2026-06-01', '2026-06-14', '2026-06-15',
        '2026-06-16', '2026-07-30', 'preceding_period',
        '2026-07-31T12:00:00.000Z'
      )
    `;
    await sql`
      INSERT INTO growth_measurement_results (
        id, project_id, measurement_plan_id, fact_hash, observations_hash,
        outcome, confidence, summary, evaluated_at
      ) VALUES (
        ${source.resultId}, ${source.projectId}, ${planId}, ${"d".repeat(64)},
        ${"e".repeat(64)}, 'positive', 0.8, 'Clicks improved.',
        '2026-07-31T12:00:00.000Z'
      )
    `;
  }
  return {
    organizationId,
    projectId,
    foreignProjectId,
    actionId,
    foreignActionId,
    resultId,
    foreignResultId,
  };
}

describePostgres("GrowthReportsRepository Postgres", () => {
  beforeAll(async () => {
    sql = postgres(testUrl!, { max: 12 });
    ({ GrowthReportsRepository: repo } =
      await import("./GrowthReportsRepository"));
    ({ withPgClient } = await import("@/db"));
  });

  afterAll(async () => {
    if (testUrl) await sql.end({ timeout: 5 });
  });

  it("serializes report drift and publication while preserving source deletion", async () => {
    const suffix = crypto.randomUUID();
    const source = await seedSource(suffix);
    const writes = await Promise.all([
      reportWrite({
        projectId: source.projectId,
        actionId: source.actionId,
        resultId: source.resultId,
        name: `a_${suffix}`,
        summary: "First report fact",
      }),
      reportWrite({
        projectId: source.projectId,
        actionId: source.actionId,
        resultId: source.resultId,
        name: `b_${suffix}`,
        summary: "Second report fact",
      }),
    ]);
    try {
      const [tables] = await sql<
        [
          {
            reports: string | null;
            sections: string | null;
            actions: string | null;
            results: string | null;
          },
        ]
      >`
        SELECT to_regclass('public.growth_reports') AS reports,
               to_regclass('public.growth_report_sections') AS sections,
               to_regclass('public.growth_report_actions') AS actions,
               to_regclass('public.growth_report_measurement_results') AS results
      `;
      expect(tables).toEqual({
        reports: "growth_reports",
        sections: "growth_report_sections",
        actions: "growth_report_actions",
        results: "growth_report_measurement_results",
      });

      await Promise.all(
        writes.map((write) =>
          withPgClient(() => repo.createGrowthReportGraph(write)),
        ),
      );
      const winner = await withPgClient(() =>
        repo.getReportByCoordinate({
          projectId: source.projectId,
          reportType: "monthly",
          periodStart: "2026-07-01",
          periodEnd: "2026-07-31",
          version: 1,
        }),
      );
      expect(winner).toBeDefined();
      if (!winner) throw new Error("Concurrent Report creation had no winner");
      const winningWrite = writes.find(
        (write) => write.factHash === winner.factHash,
      );
      expect(winningWrite).toBeDefined();
      if (!winningWrite) throw new Error("Report winner has unknown fact hash");
      const graph = await withPgClient(() =>
        repo.getReportGraph(source.projectId, winner.id),
      );
      expect(graph?.sections).toHaveLength(8);
      expect(
        graph?.sections.map(({ structuredContent }) => structuredContent),
      ).toEqual(
        winningWrite.sections.map(({ structuredContent }) => structuredContent),
      );
      expect(graph?.actionIds).toEqual([source.actionId]);
      expect(graph?.measurementResultIds).toEqual([source.resultId]);

      for (const manifest of [
        {
          actionIds: [source.foreignActionId],
          measurementResultIds: winningWrite.measurementResultIds,
        },
        {
          actionIds: winningWrite.actionIds,
          measurementResultIds: [source.foreignResultId],
        },
      ]) {
        await withPgClient(() =>
          repo.publishGrowthReportGraph({
            projectId: source.projectId,
            reportId: winner.id,
            factHash: winner.factHash,
            sections: winningWrite.sections,
            publishedAt: "2026-08-01T10:00:00.000Z",
            publishedByType: "user",
            publishedById: "drifting-publisher",
            ...manifest,
          }),
        );
        expect(
          await withPgClient(() => repo.getReport(source.projectId, winner.id)),
        ).toMatchObject({ status: "draft", publishedAt: null });
      }

      const publications = [
        {
          publishedAt: "2026-08-01T10:00:00.000Z",
          publishedByType: "user" as const,
          publishedById: "first-publisher",
        },
        {
          publishedAt: "2026-08-01T11:00:00.000Z",
          publishedByType: "agent" as const,
          publishedById: "second-publisher",
        },
      ];
      await Promise.all(
        publications.map((publication) =>
          withPgClient(() =>
            repo.publishGrowthReportGraph({
              projectId: source.projectId,
              reportId: winner.id,
              factHash: winner.factHash,
              sections: winningWrite.sections,
              actionIds: winningWrite.actionIds,
              measurementResultIds: winningWrite.measurementResultIds,
              ...publication,
            }),
          ),
        ),
      );
      const published = await withPgClient(() =>
        repo.getReport(source.projectId, winner.id),
      );
      expect(published?.status).toBe("published");
      expect(publications).toContainEqual({
        publishedAt: published?.publishedAt,
        publishedByType: published?.publishedByType,
        publishedById: published?.publishedById,
      });

      const invalid = await reportWrite({
        projectId: source.projectId,
        actionId: source.foreignActionId,
        resultId: source.foreignResultId,
        name: `foreign_${suffix}`,
        summary: "Cross-project source",
        version: 2,
      });
      await expect(
        withPgClient(() => repo.createGrowthReportGraph(invalid)),
      ).rejects.toThrow();
      expect(
        await withPgClient(() =>
          repo.getReportByCoordinate({
            projectId: source.projectId,
            reportType: "monthly",
            periodStart: "2026-07-01",
            periodEnd: "2026-07-31",
            version: 2,
          }),
        ),
      ).toBeNull();

      await sql`DELETE FROM growth_measurement_results WHERE id = ${source.resultId}`;
      const afterResultDeletion = await withPgClient(() =>
        repo.getReportGraph(source.projectId, winner.id),
      );
      expect(afterResultDeletion?.report.status).toBe("published");
      expect(afterResultDeletion?.sections).toHaveLength(8);
      expect(afterResultDeletion?.actionIds).toEqual([source.actionId]);
      expect(afterResultDeletion?.measurementResultIds).toEqual([]);

      await sql`DELETE FROM growth_actions WHERE id = ${source.actionId}`;
      const afterActionDeletion = await withPgClient(() =>
        repo.getReportGraph(source.projectId, winner.id),
      );
      expect(afterActionDeletion?.report.status).toBe("published");
      expect(afterActionDeletion?.sections).toHaveLength(8);
      expect(afterActionDeletion?.actionIds).toEqual([]);
      expect(afterActionDeletion?.measurementResultIds).toEqual([]);
    } finally {
      await sql`DELETE FROM projects WHERE id IN (${source.projectId}, ${source.foreignProjectId})`;
      await sql`DELETE FROM organization WHERE id = ${source.organizationId}`;
    }
  }, 30_000);
});
