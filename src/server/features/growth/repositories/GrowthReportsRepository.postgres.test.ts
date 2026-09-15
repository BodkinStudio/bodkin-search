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
import type { GrowthMonthlyReportsRepository as MonthlyRepositoryExport } from "./GrowthMonthlyReportsRepository";
import type { GrowthMonthlyReportsService as MonthlyReportsServiceExport } from "../services/GrowthMonthlyReportsService";

const testUrl = process.env.TEST_POSTGRES_DATABASE_URL;

vi.mock("cloudflare:workers", () => ({
  env: {
    DATABASE_PROVIDER: "postgres",
    HYPERDRIVE: { connectionString: testUrl },
  },
}));

type Repository = typeof RepositoryExport;
type MonthlyRepository = typeof MonthlyRepositoryExport;
type MonthlyReportsService = typeof MonthlyReportsServiceExport;
type WithPgClient = typeof withPgClientExport;

let sql: ReturnType<typeof postgres>;
let repo: Repository;
let monthlyRepo: MonthlyRepository;
let monthlyReportsService: MonthlyReportsService;
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
    ({ GrowthMonthlyReportsRepository: monthlyRepo } =
      await import("./GrowthMonthlyReportsRepository"));
    ({ GrowthMonthlyReportsService: monthlyReportsService } =
      await import("../services/GrowthMonthlyReportsService"));
    ({ withPgClient } = await import("@/db"));
  });

  afterAll(async () => {
    if (testUrl) await sql.end({ timeout: 5 });
  });

  it("bounds monthly candidates by project and cutoff with deterministic tied IDs", async () => {
    const suffix = crypto.randomUUID();
    const source = await seedSource(suffix);
    const runId = `gr_run_${suffix}`;
    const tiedIds = [
      "Tie_A",
      "Tie_a",
      "Tie_B",
      "Tie_b",
      "Tie_C",
      "Tie_c",
      "Tie_D",
      "Tie_d",
      "Tie_E",
      "Tie_e",
      "Tie_F",
      "Tie_f",
      "Tie_G",
      "Tie_g",
    ].map((id) => `gr_monthly_${id}_${suffix}`);
    try {
      await sql`
        UPDATE growth_actions
        SET updated_at = '2026-07-31T12:00:00.000Z'
        WHERE project_id IN (${source.projectId}, ${source.foreignProjectId})
      `;
      await sql`
        UPDATE growth_measurement_results
        SET created_at = '2026-07-31T12:00:00.000Z'
        WHERE project_id IN (${source.projectId}, ${source.foreignProjectId})
      `;
      for (const actionId of tiedIds) {
        const recommendationId = `gr_monthly_recommendation_${actionId}`;
        await sql`
          INSERT INTO growth_recommendations (
            id, project_id, run_id, creation_key, fact_hash, title, rationale,
            category, impact, commercial_relevance, effort, urgency, confidence,
            priority_score, status, review_version, reviewed_at
          ) VALUES (
            ${recommendationId}, ${source.projectId}, ${runId}, ${`key-${actionId}`},
            ${"m".repeat(64)}, 'Tied monthly action', 'Saved fact', 'content',
            5, 5, 2, 3, 0.8, 10, 'accepted', 1, '2026-07-01T12:00:00.000Z'
          )
        `;
        await sql`
          INSERT INTO growth_actions (
            id, project_id, recommendation_id, creation_key, fact_hash, title,
            description, category, priority_score, status, state_version, due_at,
            approved_at, created_at, updated_at
          ) VALUES (
            ${actionId}, ${source.projectId}, ${recommendationId}, ${`key-${actionId}`},
            ${"n".repeat(64)}, 'Tied monthly action', 'Saved fact', 'content',
            10, 'ready', 1, '2026-10-15T12:00:00.000Z',
            '2026-07-01T12:00:00.000Z', '2026-07-01T12:00:00.000Z',
            '2026-07-31T12:00:00.000Z'
          )
        `;
      }
      const lateActionId = `gr_monthly_late_${suffix}`;
      await sql`
        INSERT INTO growth_recommendations (
          id, project_id, run_id, creation_key, fact_hash, title, rationale,
          category, impact, commercial_relevance, effort, urgency, confidence,
          priority_score, status, review_version, reviewed_at
        ) VALUES (
          ${`gr_monthly_recommendation_late_${suffix}`}, ${source.projectId}, ${runId},
          ${`key-${lateActionId}`}, ${"o".repeat(64)}, 'Late action', 'Saved fact',
          'content', 5, 5, 2, 3, 0.8, 10, 'accepted', 1,
          '2026-07-01T12:00:00.000Z'
        )
      `;
      await sql`
        INSERT INTO growth_actions (
          id, project_id, recommendation_id, creation_key, fact_hash, title,
          description, category, priority_score, status, state_version, due_at,
          approved_at, created_at, updated_at
        ) VALUES (
          ${lateActionId}, ${source.projectId}, ${`gr_monthly_recommendation_late_${suffix}`},
          ${`key-${lateActionId}`}, ${"p".repeat(64)}, 'Late action', 'Saved fact',
          'content', 10, 'ready', 1, '2026-10-15T12:00:00.000Z',
          '2026-07-01T12:00:00.000Z', '2026-07-01T12:00:00.000Z',
          '2026-08-01T08:00:00.001Z'
        )
      `;
      const facts = await withPgClient(() =>
        monthlyRepo.listMonthlySourceFacts(source.projectId, {
          dataCutoffAt: "2026-08-01T08:00:00.000Z",
          periodStartAt: "2026-07-01T00:00:00.000Z",
          periodEndExclusiveAt: "2026-08-01T00:00:00.000Z",
          cutoffStartAt: "2026-08-01T00:00:00.000Z",
          nextMonthStartAt: "2026-08-01T00:00:00.000Z",
          nextMonthEndExclusiveAt: "2026-09-01T00:00:00.000Z",
        }),
      );
      expect(facts.performance.map(({ id }) => id)).toEqual([source.resultId]);
      expect(facts.opportunities).toHaveLength(13);
      expect(facts.opportunities.map(({ id }) => id)).toEqual(
        [...tiedIds].toSorted().slice(0, 13),
      );
      expect(facts.opportunities.map(({ id }) => id)).not.toContain(
        lateActionId,
      );
      expect(facts.opportunities.map(({ id }) => id)).not.toContain(
        source.foreignActionId,
      );
    } finally {
      await sql`DELETE FROM projects WHERE id IN (${source.projectId}, ${source.foreignProjectId})`;
      await sql`DELETE FROM organization WHERE id = ${source.organizationId}`;
    }
  }, 30_000);

  it("serializes expected monthly settings at the Report insert boundary", async () => {
    const suffix = crypto.randomUUID();
    const source = await seedSource(suffix);
    const coordinate = (version: number) => ({
      projectId: source.projectId,
      reportType: "monthly" as const,
      periodStart: "2026-07-01",
      periodEnd: "2026-07-31",
      version,
    });
    try {
      const absentSettings = await reportWrite({
        projectId: source.projectId,
        actionId: source.actionId,
        resultId: source.resultId,
        name: `settings_absent_${suffix}`,
        summary: "No settings row yet",
        version: 7,
      });
      await withPgClient(() =>
        repo.createGrowthReportGraph({
          ...absentSettings,
          expectedSettings: {
            persisted: false,
            reportTimezone: "Europe/London",
            updatedAt: null,
          },
        }),
      );
      expect(
        await withPgClient(() => repo.getReportByCoordinate(coordinate(7))),
      ).toMatchObject({ id: absentSettings.id });

      const settingsUpdatedAt = "2026-08-01T08:00:00.000Z";
      await sql`
        INSERT INTO growth_project_settings (
          project_id, report_timezone, created_at, updated_at
        ) VALUES (
          ${source.projectId}, 'Europe/London', ${settingsUpdatedAt}, ${settingsUpdatedAt}
        )
      `;
      const writes = await Promise.all([
        reportWrite({
          projectId: source.projectId,
          actionId: source.actionId,
          resultId: source.resultId,
          name: `settings_a_${suffix}`,
          summary: "First settings writer",
          version: 8,
        }),
        reportWrite({
          projectId: source.projectId,
          actionId: source.actionId,
          resultId: source.resultId,
          name: `settings_b_${suffix}`,
          summary: "Second settings writer",
          version: 8,
        }),
      ]);
      const expectedSettings = {
        persisted: true,
        reportTimezone: "Europe/London",
        updatedAt: settingsUpdatedAt,
      };
      await Promise.all(
        writes.map((write) =>
          withPgClient(() =>
            repo.createGrowthReportGraph({ ...write, expectedSettings }),
          ),
        ),
      );
      const winner = await withPgClient(() =>
        repo.getReportByCoordinate(coordinate(8)),
      );
      expect(winner).not.toBeNull();
      expect(writes.map(({ factHash }) => factHash)).toContain(
        winner?.factHash,
      );

      const mismatch = await reportWrite({
        projectId: source.projectId,
        actionId: source.actionId,
        resultId: source.resultId,
        name: `settings_mismatch_${suffix}`,
        summary: "Mismatched settings writer",
        version: 9,
      });
      await withPgClient(() =>
        repo.createGrowthReportGraph({
          ...mismatch,
          expectedSettings: { ...expectedSettings, reportTimezone: "UTC" },
        }),
      );
      expect(
        await withPgClient(() => repo.getReportByCoordinate(coordinate(9))),
      ).toBeNull();
    } finally {
      await sql`DELETE FROM projects WHERE id IN (${source.projectId}, ${source.foreignProjectId})`;
      await sql`DELETE FROM organization WHERE id = ${source.organizationId}`;
    }
  }, 30_000);

  it("returns one immutable monthly winner after two bounded snapshots wait on settings", async () => {
    const suffix = crypto.randomUUID();
    const source = await seedSource(suffix);
    const runId = `gr_run_${suffix}`;
    const opportunityId = `gr_contention_opportunity_${suffix}`;
    const recommendationId = `gr_contention_recommendation_${suffix}`;
    const cutoffA = "2026-08-01T08:00:00.000Z";
    const cutoffB = "2026-08-01T09:00:00.000Z";
    const expectation = {
      projectId: source.projectId,
      periodStart: "2026-07-01",
      periodEnd: "2026-07-31",
      reportTimezone: "Europe/London",
    };
    const locker = postgres(testUrl!, { max: 1 });
    let releaseSettingsLock: (() => void) | undefined;
    try {
      await sql`
        UPDATE growth_actions SET updated_at = '2026-07-31T12:00:00.000Z'
        WHERE project_id IN (${source.projectId}, ${source.foreignProjectId})
      `;
      await sql`
        UPDATE growth_measurement_results SET created_at = '2026-07-31T12:00:00.000Z'
        WHERE project_id IN (${source.projectId}, ${source.foreignProjectId})
      `;
      await sql`
        INSERT INTO growth_project_settings (
          project_id, report_timezone, created_at, updated_at
        ) VALUES (${source.projectId}, 'Europe/London', ${cutoffA}, ${cutoffA})
      `;
      await sql`
        INSERT INTO growth_recommendations (
          id, project_id, run_id, creation_key, fact_hash, title, rationale,
          category, impact, commercial_relevance, effort, urgency, confidence,
          priority_score, status, review_version, reviewed_at
        ) VALUES (
          ${recommendationId}, ${source.projectId}, ${runId}, ${`key-${opportunityId}`},
          ${"q".repeat(64)}, 'Later opportunity', 'Saved fact', 'content',
          5, 5, 2, 3, 0.8, 10, 'accepted', 1, '2026-07-01T12:00:00.000Z'
        )
      `;
      await sql`
        INSERT INTO growth_actions (
          id, project_id, recommendation_id, creation_key, fact_hash, title,
          description, category, priority_score, status, state_version, due_at,
          approved_at, created_at, updated_at
        ) VALUES (
          ${opportunityId}, ${source.projectId}, ${recommendationId},
          ${`key-${opportunityId}`}, ${"r".repeat(64)}, 'Later opportunity',
          'Saved fact', 'content', 10, 'ready', 1,
          '2026-10-15T12:00:00.000Z', '2026-07-01T12:00:00.000Z',
          '2026-07-01T12:00:00.000Z', '2026-08-01T08:30:00.000Z'
        )
      `;
      let locked!: () => void;
      const lockHeld = new Promise<void>((resolve) => {
        locked = resolve;
      });
      const lockTransaction = locker.begin(async (tx) => {
        await tx`SELECT project_id FROM growth_project_settings WHERE project_id = ${source.projectId} FOR UPDATE`;
        locked();
        await new Promise<void>((resolve) => {
          releaseSettingsLock = resolve;
        });
      });
      await lockHeld;

      const builds = [cutoffA, cutoffB].map((cutoff, index) =>
        withPgClient(() =>
          monthlyReportsService.buildGrowthMonthlyReport(
            source.projectId,
            `contention_actor_${index}`,
            expectation,
            new Date(cutoff),
          ),
        ),
      );
      let waiters = 0;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const [activity] = await sql<{ waiters: number }[]>`
          SELECT count(*)::int AS waiters
          FROM pg_stat_activity
          WHERE datname = current_database()
            AND wait_event_type = 'Lock'
            AND query LIKE '%growth_project_settings%'
        `;
        waiters = activity?.waiters ?? 0;
        if (waiters >= 2) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(waiters).toBeGreaterThanOrEqual(2);
      releaseSettingsLock?.();
      await lockTransaction;
      const [first, second] = await Promise.all(builds);
      expect(first).toEqual(second);
      expect(first.state).toBe("report");
      if (first.state !== "report")
        throw new Error("Monthly contention did not return a report");
      expect([cutoffA, cutoffB]).toContain(first.report.dataCutoffAt);

      const coordinate = {
        projectId: source.projectId,
        reportType: "monthly" as const,
        periodStart: "2026-07-01",
        periodEnd: "2026-07-31",
        version: 1,
      };
      const stored = await withPgClient(() =>
        repo.getReportByCoordinate(coordinate),
      );
      expect(stored?.dataCutoffAt).toBe(first.report.dataCutoffAt);
      const graph = stored
        ? await withPgClient(() =>
            repo.getReportGraph(source.projectId, stored.id),
          )
        : null;
      expect(graph?.measurementResultIds).toEqual([source.resultId]);
      expect(graph?.actionIds).toEqual(
        first.report.dataCutoffAt === cutoffA
          ? [source.actionId]
          : [source.actionId, opportunityId].toSorted(),
      );
      const [counts] = await sql<{ reports: number }[]>`
        SELECT count(*)::int AS reports FROM growth_reports
        WHERE project_id = ${source.projectId}
      `;
      expect(counts?.reports).toBe(1);
    } finally {
      releaseSettingsLock?.();
      await locker.end({ timeout: 5 });
      await sql`DELETE FROM projects WHERE id IN (${source.projectId}, ${source.foreignProjectId})`;
      await sql`DELETE FROM organization WHERE id = ${source.organizationId}`;
    }
  }, 45_000);

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
