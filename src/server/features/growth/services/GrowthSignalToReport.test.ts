/* eslint-disable max-lines, max-lines-per-function -- the Phase 1 service gate is intentionally auditable end to end */
import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type * as RunBatchModule from "@/db/runBatch";
import {
  GROWTH_REPORT_SECTION_POSITIONS,
  GROWTH_REPORT_SECTION_TYPES,
  type GrowthReportSection,
} from "@/types/schemas/growth-reports";
import type { GrowthActionsService as GrowthActionsServiceExport } from "./GrowthActionsService";
import type { GrowthChangeEventsService as GrowthChangeEventsServiceExport } from "./GrowthChangeEventsService";
import type { GrowthInsightsService as GrowthInsightsServiceExport } from "./GrowthInsightsService";
import type { GrowthMeasurementsService as GrowthMeasurementsServiceExport } from "./GrowthMeasurementsService";
import type { GrowthReportsService as GrowthReportsServiceExport } from "./GrowthReportsService";
import type { GrowthRunsService as GrowthRunsServiceExport } from "./GrowthRunsService";

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));

let client: Client;
let runs: typeof GrowthRunsServiceExport;
let insights: typeof GrowthInsightsServiceExport;
let actions: typeof GrowthActionsServiceExport;
let changes: typeof GrowthChangeEventsServiceExport;
let measurements: typeof GrowthMeasurementsServiceExport;
let reports: typeof GrowthReportsServiceExport;

function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function reportSections(
  actionId: string,
  measurementResultId: string,
  includeDirectActionSources = true,
): GrowthReportSection[] {
  return GROWTH_REPORT_SECTION_TYPES.map((sectionType) => ({
    sectionType,
    position: GROWTH_REPORT_SECTION_POSITIONS[sectionType],
    content: {
      summary:
        sectionType === "executive_summary"
          ? "The pricing-page work shipped and produced a measured improvement."
          : `${sectionType} snapshot for the completed monthly review.`,
      items:
        sectionType === "executive_summary"
          ? [
              {
                key: "pricing-page-work",
                position: 0,
                title: "Pricing page work completed",
                summary: "The accepted recommendation became measured work.",
                facts: [],
                evidence: [],
                source: includeDirectActionSources
                  ? { type: "action", id: actionId }
                  : null,
              },
            ]
          : sectionType === "performance"
            ? [
                {
                  key: "click-growth",
                  position: 0,
                  title: "Clicks increased",
                  summary: "The primary metric rose from 100 to 125 clicks.",
                  facts: [
                    {
                      key: "baseline",
                      position: 0,
                      label: "Baseline clicks",
                      value: 100,
                    },
                    {
                      key: "measurement",
                      position: 1,
                      label: "Measured clicks",
                      value: 125,
                    },
                  ],
                  evidence: [
                    { kind: "gsc_period", ref: "gsc:pricing:measurement" },
                  ],
                  source: {
                    type: "measurement_result",
                    id: measurementResultId,
                  },
                },
              ]
            : sectionType === "work_completed"
              ? [
                  {
                    key: "pricing-copy",
                    position: 0,
                    title: "Pricing copy updated",
                    summary: "The page change was recorded against the Action.",
                    facts: [],
                    evidence: [
                      { kind: "manual_observation", ref: "change:pricing" },
                    ],
                    source: includeDirectActionSources
                      ? { type: "action", id: actionId }
                      : null,
                  },
                ]
              : [],
    },
  }));
}

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  const testDb = drizzle(client);
  vi.doMock("@/db", () => ({ db: testDb }));
  type BatchStatement = Parameters<typeof testDb.batch>[0][number];
  vi.doMock("@/db/runBatch", async (loadOriginal) => {
    const original = await loadOriginal<typeof RunBatchModule>();
    return {
      ...original,
      runBatch: async (
        build: (tx: typeof testDb) => readonly Promise<unknown>[],
      ): Promise<void> => {
        const statements = build(testDb);
        if (statements.length === 0) return;
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the length guard proves this tuple is non-empty
        const batch = statements as unknown as [
          BatchStatement,
          ...BatchStatement[],
        ];
        await testDb.batch(batch);
      },
    };
  });

  const migration = (path: string) => readFileSync(path, "utf8");
  await client.executeMultiple(
    [
      "PRAGMA foreign_keys = ON;",
      "CREATE TABLE projects (id text PRIMARY KEY, domain text, archived_at text);",
      "CREATE TABLE user (id text PRIMARY KEY);",
      `CREATE TABLE project_key_pages (
        id text PRIMARY KEY, project_id text NOT NULL, url text NOT NULL,
        role text NOT NULL, topic text, notes text, updated_at text NOT NULL,
        updated_by text NOT NULL
      );`,
      "INSERT INTO projects (id, domain) VALUES ('phase1_project', 'example.com');",
      "INSERT INTO user (id) VALUES ('user_1');",
      migration("drizzle/0043_wild_proteus.sql"),
      migration("drizzle/0044_glossy_komodo.sql"),
      migration("drizzle/0045_mean_retro_girl.sql"),
      migration("drizzle/0046_living_misty_knight.sql"),
      migration("drizzle/0047_flaky_felicia_hardy.sql"),
      migration("drizzle/0048_dry_kate_bishop.sql"),
      migration("drizzle/0049_gray_hedge_knight.sql"),
      migration("drizzle/0051_noisy_agent_zero.sql"),
      migration("drizzle/0053_sweet_ben_grimm.sql"),
      migration("drizzle/0054_simple_sunspot.sql"),
      migration("drizzle/0055_lying_rick_jones.sql"),
      `INSERT INTO growth_project_settings
       (project_id, growth_enabled, report_timezone, report_cadence, report_day)
       VALUES ('phase1_project', 1, 'Europe/London', 'monthly', 1);`,
    ].join("\n"),
  );

  ({ GrowthRunsService: runs } = await import("./GrowthRunsService"));
  ({ GrowthInsightsService: insights } =
    await import("./GrowthInsightsService"));
  ({ GrowthActionsService: actions } = await import("./GrowthActionsService"));
  ({ GrowthChangeEventsService: changes } =
    await import("./GrowthChangeEventsService"));
  ({ GrowthMeasurementsService: measurements } =
    await import("./GrowthMeasurementsService"));
  ({ GrowthReportsService: reports } = await import("./GrowthReportsService"));
});

afterAll(() => client.close());

describe.sequential("Growth Phase 1 Signal-to-Report gate", () => {
  it("turns one measured signal into one frozen published monthly report", async () => {
    const run = await runs.createManualRun({
      projectId: "phase1_project",
      runType: "manual_analysis",
      cadenceSlot: "phase1-gate",
      periodStart: "2026-07-01",
      periodEnd: "2026-07-31",
      detectorVersion: "manual-v1",
    });
    const signal = await runs.recordSignal({
      projectId: "phase1_project",
      runId: run.id,
      signalType: "organic_click_decline",
      entityType: "url",
      entityRef: "https://example.com/pricing",
      metric: "search_clicks",
      severity: "warning",
      confidence: 0.9,
      periodStart: "2026-07-01",
      periodEnd: "2026-07-31",
      baselineValue: 120,
      currentValue: 100,
      deltaValue: -20,
      deltaPercent: -16.67,
      evidenceKind: "gsc_period",
      evidenceRef: "gsc:pricing:july",
      capturedAt: "2026-08-01T08:00:00.000Z",
    });
    const insight = await insights.createInsight({
      projectId: "phase1_project",
      runId: run.id,
      creationKey: "pricing-click-decline",
      title: "Pricing clicks declined",
      explanation: "The pricing page lost material organic clicks.",
      hypothesis: "Sharper pricing copy can recover qualified traffic.",
      confidence: 0.85,
      signalIds: [signal.id],
    });
    const recommendation = await insights.createRecommendation({
      projectId: "phase1_project",
      runId: run.id,
      creationKey: "refresh-pricing-copy",
      title: "Refresh pricing-page copy",
      rationale: "Clarify value and restore search intent alignment.",
      category: "content",
      insightIds: [insight.insight.id],
      impact: 5,
      commercialRelevance: 5,
      effort: 2,
      urgency: 3,
      confidence: 0.8,
      priorityScore: 12.5,
      targets: [{ type: "url", value: "https://example.com/pricing" }],
      steps: ["Rewrite the pricing proposition", "Publish and measure"],
    });
    const accepted = await insights.reviewRecommendation({
      projectId: "phase1_project",
      recommendationId: recommendation.recommendation.id,
      expectedStatus: "proposed",
      expectedVersion: 0,
      status: "accepted",
    });
    expect(accepted.status).toBe("accepted");

    const action = await actions.createAction({
      projectId: "phase1_project",
      recommendationId: recommendation.recommendation.id,
      creationKey: "pricing-copy-action",
      title: "Refresh pricing-page copy",
      description: "Rewrite and publish the agreed pricing proposition.",
      dueAt: "2026-09-30T12:00:00.000Z",
      targets: [{ type: "url", value: "https://example.com/pricing" }],
      actorType: "user",
      actorId: "user_1",
      note: "Approved for delivery",
    });
    await actions.transitionAction({
      projectId: "phase1_project",
      actionId: action.action.id,
      expectedStatus: "approved",
      expectedVersion: 0,
      status: "ready",
      actorType: "user",
      actorId: "user_1",
    });
    await actions.transitionAction({
      projectId: "phase1_project",
      actionId: action.action.id,
      expectedStatus: "ready",
      expectedVersion: 1,
      status: "in_progress",
      actorType: "user",
      actorId: "user_1",
    });
    const implemented = await actions.transitionAction({
      projectId: "phase1_project",
      actionId: action.action.id,
      expectedStatus: "in_progress",
      expectedVersion: 2,
      status: "implemented",
      actorType: "user",
      actorId: "user_1",
      note: "Published the pricing update",
    });
    expect(implemented.action.implementedAt).toBeTruthy();

    const change = await changes.recordManualEvent({
      projectId: "phase1_project",
      creationKey: "pricing-page-published",
      changeType: "content_updated",
      actorType: "user",
      actorId: "user_1",
      description: "Published the refreshed pricing proposition.",
      happenedAt: implemented.action.implementedAt!,
      urls: ["https://example.com/pricing"],
    });
    await changes.linkAction({
      projectId: "phase1_project",
      changeEventId: change.event.id,
      actionId: action.action.id,
    });

    const anchorDate = change.event.happenedAt.slice(0, 10);
    const baselineStart = addDays(anchorDate, -7);
    const baselineEnd = addDays(anchorDate, -1);
    const measurementStart = addDays(anchorDate, 1);
    const measurementEnd = addDays(anchorDate, 2);
    const plan = await measurements.startMeasurement({
      projectId: "phase1_project",
      actionId: action.action.id,
      implementationChangeEventId: change.event.id,
      expectedActionVersion: 3,
      baselineStart,
      baselineEnd,
      cooldownEnd: anchorDate,
      measurementStart,
      measurementEnd,
      longMeasurementEnd: null,
      comparisonMode: "preceding_period",
      metrics: [
        {
          metricType: "search_clicks",
          entityType: "url",
          entityKey: "https://example.com/pricing",
          isPrimary: true,
        },
      ],
      actorType: "agent",
      actorId: "growth-agent",
      note: "Start the agreed measurement",
    });
    const metric = plan.metrics[0];
    await measurements.recordObservation({
      projectId: "phase1_project",
      measurementPlanId: plan.plan.id,
      metricId: metric.id,
      periodType: "baseline",
      effectiveStart: baselineStart,
      effectiveEnd: baselineEnd,
      value: 100,
      completeness: 1,
      evidenceKind: "gsc_period",
      evidenceRef: "gsc:pricing:baseline",
      capturedAt: `${measurementEnd}T12:00:00.000Z`,
    });
    await measurements.recordObservation({
      projectId: "phase1_project",
      measurementPlanId: plan.plan.id,
      metricId: metric.id,
      periodType: "measurement",
      effectiveStart: measurementStart,
      effectiveEnd: measurementEnd,
      value: 125,
      completeness: 1,
      evidenceKind: "gsc_period",
      evidenceRef: "gsc:pricing:measurement",
      capturedAt: `${measurementEnd}T12:00:00.000Z`,
    });
    const measured = await measurements.finalizeMeasurement(
      {
        projectId: "phase1_project",
        measurementPlanId: plan.plan.id,
        expectedActionVersion: 4,
        outcome: "positive",
        confidence: 0.85,
        summary: "Clicks increased after the pricing-page update.",
        confoundingChangeEventIds: [],
        actorType: "agent",
        actorId: "growth-agent",
        note: "Complete the measured outcome",
      },
      { now: new Date(`${addDays(measurementEnd, 1)}T12:00:00.000Z`) },
    );
    expect(measured.result?.outcome).toBe("positive");
    const resultId = measured.result.id;

    await runs.completeRun({ projectId: "phase1_project", runId: run.id });
    const reportRequest = {
      projectId: "phase1_project",
      reportType: "monthly" as const,
      periodStart: "2026-07-01",
      periodEnd: "2026-07-31",
      version: 1,
      dataCutoffAt: `${addDays(measurementEnd, 1)}T12:00:00.000Z`,
      createdByType: "agent" as const,
      createdById: "growth-reporter",
      sections: reportSections(action.action.id, resultId, false),
    };
    const report = await reports.createGrowthReport(reportRequest, {
      now: new Date(`${addDays(measurementEnd, 2)}T12:00:00.000Z`),
    });
    expect(report).toMatchObject({
      status: "draft",
      reportTimezone: "Europe/London",
      actionIds: [action.action.id],
      measurementResultIds: [resultId],
    });
    expect(report.sections).toHaveLength(8);
    await client.execute(
      "UPDATE growth_project_settings SET report_timezone = 'UTC' WHERE project_id = 'phase1_project'",
    );
    const exactRetry = await reports.createGrowthReport(reportRequest, {
      now: new Date(`${addDays(measurementEnd, 3)}T12:00:00.000Z`),
    });
    expect(exactRetry).toMatchObject({
      id: report.id,
      generatedAt: report.generatedAt,
      reportTimezone: "Europe/London",
    });
    const driftSections = reportSections(action.action.id, resultId, false);
    driftSections[0] = {
      ...driftSections[0],
      content: {
        ...driftSections[0].content,
        summary: "A different immutable executive summary.",
      },
    };
    await expect(
      reports.createGrowthReport({ ...reportRequest, sections: driftSections }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await expect(
      reports.createGrowthReport(
        {
          ...reportRequest,
          version: 2,
          sections: reportSections("missing_action", resultId),
        },
        {
          now: new Date(`${addDays(measurementEnd, 3)}T12:00:00.000Z`),
        },
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(
      Number(
        (
          await client.execute(
            "SELECT count(*) AS count FROM growth_reports WHERE version = 2",
          )
        ).rows[0]?.count ?? 0,
      ),
    ).toBe(0);

    const published = await reports.publishGrowthReport(
      {
        projectId: "phase1_project",
        reportId: report.id,
        actorType: "user",
        actorId: "user_1",
      },
      { now: new Date(`${addDays(measurementEnd, 3)}T12:00:00.000Z`) },
    );
    expect(published).toMatchObject({
      id: report.id,
      status: "published",
      publishedByType: "user",
      publishedById: "user_1",
      actionIds: [action.action.id],
      measurementResultIds: [resultId],
    });
    expect(published.sections[1]?.content.items[0]?.source).toEqual({
      type: "measurement_result",
      id: resultId,
    });
    const repeatedPublish = await reports.publishGrowthReport(
      {
        projectId: "phase1_project",
        reportId: report.id,
        actorType: "agent",
        actorId: "late-publisher",
      },
      { now: new Date(`${addDays(measurementEnd, 4)}T12:00:00.000Z`) },
    );
    expect(repeatedPublish).toMatchObject({
      publishedAt: published.publishedAt,
      publishedByType: "user",
      publishedById: "user_1",
    });

    const draftRequest = { ...reportRequest, version: 2 };
    const prunableDraft = await reports.createGrowthReport(draftRequest, {
      now: new Date(`${addDays(measurementEnd, 4)}T13:00:00.000Z`),
    });
    expect(prunableDraft).toMatchObject({
      status: "draft",
      actionIds: [action.action.id],
      measurementResultIds: [resultId],
    });

    await client.execute({
      sql: "DELETE FROM growth_measurement_results WHERE id = ?",
      args: [resultId],
    });
    for (const frozen of [
      await reports.getGrowthReport("phase1_project", report.id),
      await reports.getGrowthReport("phase1_project", prunableDraft.id),
    ]) {
      expect(frozen).toMatchObject({
        actionIds: [action.action.id],
        measurementResultIds: [],
      });
      expect(frozen.sections[1]?.content.items[0]?.source).toEqual({
        type: "measurement_result",
        id: resultId,
      });
    }
    await expect(
      reports.createGrowthReport(reportRequest),
    ).resolves.toMatchObject({ id: report.id, status: "published" });
    await expect(
      reports.createGrowthReport(draftRequest),
    ).resolves.toMatchObject({ id: prunableDraft.id, status: "draft" });
    await expect(
      reports.publishGrowthReport(
        {
          projectId: "phase1_project",
          reportId: prunableDraft.id,
          actorType: "user",
          actorId: "user_1",
        },
        { now: new Date(`${addDays(measurementEnd, 5)}T12:00:00.000Z`) },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await client.execute({
      sql: "DELETE FROM growth_actions WHERE id = ?",
      args: [action.action.id],
    });
    const frozenAfterSourceDeletion = await reports.getGrowthReport(
      "phase1_project",
      report.id,
    );
    expect(frozenAfterSourceDeletion).toMatchObject({
      id: report.id,
      status: "published",
      actionIds: [],
      measurementResultIds: [],
    });
    expect(
      frozenAfterSourceDeletion.sections[1]?.content.items[0]?.source,
    ).toEqual({ type: "measurement_result", id: resultId });
    await expect(
      reports.createGrowthReport(reportRequest),
    ).resolves.toMatchObject({ id: report.id, status: "published" });
    await expect(
      reports.createGrowthReport(draftRequest),
    ).resolves.toMatchObject({ id: prunableDraft.id, status: "draft" });
    expect((await client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
  });
});
