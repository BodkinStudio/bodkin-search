import {
  growthMonthlyReportDtoSchema,
  type GrowthMonthlyReportDto,
  type GrowthMonthlyReportExpectation,
  type GrowthMonthlyPublicationRequest,
} from "@/types/schemas/growth-monthly-reports";
import { AppError } from "@/server/lib/errors";
import { GrowthMonthlyReportsRepository } from "../repositories/GrowthMonthlyReportsRepository";
import type { MonthlySourceBounds } from "../repositories/GrowthMonthlyReportsRepository";
import { GrowthReportsService } from "./GrowthReportsService";
import { GrowthSettingsService } from "./GrowthSettingsService";
import {
  GROWTH_MONTHLY_REPORT_BUILDER_VERSION,
  buildGrowthMonthlyReportSections,
} from "./GrowthMonthlyReportBuilder";
import {
  calendarDateInTimezone,
  earliestUtcCalendarDateBoundary,
} from "./GrowthMeasurementFacts";
import { previousCompleteGrowthMonthlyPeriod } from "./GrowthMonthlyReportPeriod";

const TITLES: Record<string, string> = {
  executive_summary: "Executive summary",
  performance: "Performance",
  meaningful_changes: "Meaningful changes",
  work_completed: "Work completed",
  results_from_earlier_work: "Results from earlier work",
  risks: "Risks",
  opportunities: "Opportunities",
  next_month: "Next month",
};
function monthIndex(date: string) {
  return Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;
}

function isCompleteCalendarMonth(period: GrowthMonthlyReportExpectation) {
  if (!/^\d{4}-\d{2}-01$/.test(period.periodStart)) return false;
  const start = new Date(`${period.periodStart}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) return false;
  const next = new Date(start);
  next.setUTCMonth(next.getUTCMonth() + 1);
  next.setUTCDate(0);
  return next.toISOString().slice(0, 10) === period.periodEnd;
}

function assertRecoveryExpectation(
  expected: GrowthMonthlyReportExpectation,
  current: { periodStart: string; periodEnd: string },
) {
  if (!isCompleteCalendarMonth(expected))
    throw new AppError("VALIDATION_ERROR", "Monthly report period is invalid");
  if (
    Math.abs(
      monthIndex(expected.periodStart) - monthIndex(current.periodStart),
    ) > 1
  )
    throw new AppError(
      "VALIDATION_ERROR",
      "Monthly report retry is no longer eligible",
    );
}
function nextDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
function sourceBounds(
  period: { periodStart: string; periodEnd: string },
  cutoff: string,
  timezone: string,
): MonthlySourceBounds {
  const nextMonthStart = nextDate(period.periodEnd);
  const nextMonthEnd = new Date(`${nextMonthStart}T00:00:00.000Z`);
  nextMonthEnd.setUTCMonth(nextMonthEnd.getUTCMonth() + 1);
  return {
    dataCutoffAt: cutoff,
    periodStartAt: earliestUtcCalendarDateBoundary(
      period.periodStart,
      timezone,
    ),
    periodEndExclusiveAt: earliestUtcCalendarDateBoundary(
      nextMonthStart,
      timezone,
    ),
    cutoffStartAt: earliestUtcCalendarDateBoundary(
      calendarDateInTimezone(cutoff, timezone),
      timezone,
    ),
    nextMonthStartAt: earliestUtcCalendarDateBoundary(nextMonthStart, timezone),
    nextMonthEndExclusiveAt: earliestUtcCalendarDateBoundary(
      nextMonthEnd.toISOString().slice(0, 10),
      timezone,
    ),
  };
}
function project(
  report: Awaited<ReturnType<typeof GrowthReportsService.getGrowthReport>>,
): GrowthMonthlyReportDto {
  return growthMonthlyReportDtoSchema.parse({
    state: "report",
    periodStart: report.periodStart,
    periodEnd: report.periodEnd,
    reportTimezone: report.reportTimezone,
    report: {
      status: report.status,
      version: report.version,
      generatedAt: report.generatedAt,
      dataCutoffAt: report.dataCutoffAt,
      ...(report.status === "published"
        ? { publishedAt: report.publishedAt }
        : {}),
      sections: report.sections.map((section) => {
        const content = section.content;
        return {
          sectionType: section.sectionType,
          title: TITLES[section.sectionType],
          summary: content.summary,
          items: content.items.map(({ title, summary, facts }) => ({
            title,
            summary,
            facts: facts.map(({ label, value }) => ({ label, value })),
          })),
        };
      }),
    },
  });
}
async function existing(
  projectId: string,
  periodStart: string,
  periodEnd: string,
) {
  return GrowthReportsService.getGrowthReportByCoordinate({
    projectId,
    reportType: "monthly",
    periodStart,
    periodEnd,
    version: 1,
  });
}

function expectationFromRequest(
  request:
    | { projectId: string }
    | ({ projectId: string } & GrowthMonthlyReportExpectation),
): GrowthMonthlyReportExpectation | undefined {
  if (!("periodStart" in request)) return undefined;
  return {
    periodStart: request.periodStart,
    periodEnd: request.periodEnd,
    reportTimezone: request.reportTimezone,
  };
}

async function currentRead(
  projectId: string,
  settings: Awaited<ReturnType<typeof GrowthSettingsService.getSettings>>,
  period: { periodStart: string; periodEnd: string },
) {
  const report = await existing(
    projectId,
    period.periodStart,
    period.periodEnd,
  );
  return report
    ? project(report)
    : growthMonthlyReportDtoSchema.parse({
        state: "ready",
        ...period,
        reportTimezone: settings.reportTimezone,
      });
}

async function getGrowthMonthlyReport(
  projectId: string,
  request:
    | { projectId: string }
    | ({ projectId: string } & GrowthMonthlyReportExpectation) = { projectId },
  now = new Date(),
): Promise<GrowthMonthlyReportDto> {
  const settings = await GrowthSettingsService.getSettings(projectId);
  const period = previousCompleteGrowthMonthlyPeriod(
    now.toISOString(),
    settings.reportTimezone,
  );
  const expected = expectationFromRequest(request);
  if (!expected) return currentRead(projectId, settings, period);
  assertRecoveryExpectation(expected, period);
  const winner = await existing(
    projectId,
    expected.periodStart,
    expected.periodEnd,
  );
  if (winner) return project(winner);
  if (
    expected.periodStart !== period.periodStart ||
    expected.periodEnd !== period.periodEnd ||
    expected.reportTimezone !== settings.reportTimezone
  )
    return currentRead(projectId, settings, period);
  return currentRead(projectId, settings, period);
}
async function buildGrowthMonthlyReport(
  projectId: string,
  actorId: string,
  request: { projectId: string } & GrowthMonthlyReportExpectation,
  now = new Date(),
): Promise<GrowthMonthlyReportDto> {
  const settings = await GrowthSettingsService.getSettings(projectId);
  const dataCutoffAt = now.toISOString();
  const period = previousCompleteGrowthMonthlyPeriod(
    dataCutoffAt,
    settings.reportTimezone,
  );
  const expected = expectationFromRequest(request);
  if (!expected)
    throw new AppError(
      "VALIDATION_ERROR",
      "Monthly report expectation is required",
    );
  assertRecoveryExpectation(expected, period);
  const winner = await existing(
    projectId,
    expected.periodStart,
    expected.periodEnd,
  );
  if (winner) return project(winner);
  if (
    expected.periodStart !== period.periodStart ||
    expected.periodEnd !== period.periodEnd ||
    expected.reportTimezone !== settings.reportTimezone
  )
    return currentRead(projectId, settings, period);
  const source = await GrowthMonthlyReportsRepository.listMonthlySourceFacts(
    projectId,
    sourceBounds(period, dataCutoffAt, settings.reportTimezone),
  );
  const sections = buildGrowthMonthlyReportSections({
    ...source,
    ...period,
    dataCutoffAt,
    reportTimezone: settings.reportTimezone,
  });
  if (!sections)
    return growthMonthlyReportDtoSchema.parse({
      state: "no_activity",
      ...period,
      reportTimezone: settings.reportTimezone,
      message:
        "There is no eligible saved Action or terminal Measurement Result for this monthly summary.",
    });
  try {
    const created = await GrowthReportsService.createGrowthReport(
      {
        projectId,
        reportType: "monthly",
        ...period,
        version: 1,
        dataCutoffAt,
        createdByType: "user",
        createdById: actorId,
        sections,
      },
      {
        now,
        expectedSettings: {
          reportTimezone: settings.reportTimezone,
          updatedAt: settings.updatedAt,
          persisted: settings.persisted,
        },
      },
    );
    return project(created);
  } catch (error) {
    const recovered = await existing(
      projectId,
      period.periodStart,
      period.periodEnd,
    );
    if (recovered) return project(recovered);
    throw error;
  }
}

async function exactMonthlyPublicationReport(
  projectId: string,
  request: GrowthMonthlyPublicationRequest,
  now = new Date(),
) {
  const settings = await GrowthSettingsService.getSettings(projectId);
  const current = previousCompleteGrowthMonthlyPeriod(
    now.toISOString(),
    settings.reportTimezone,
  );
  assertRecoveryExpectation(request, current);
  const report = await existing(
    projectId,
    request.periodStart,
    request.periodEnd,
  );
  if (!report)
    throw new AppError(
      "NOT_FOUND",
      "Monthly report was not found for this publication coordinate",
    );
  if (report.reportTimezone !== request.reportTimezone)
    throw new AppError(
      "VALIDATION_ERROR",
      "Monthly report timezone does not match the frozen report",
    );
  return report;
}

async function getGrowthMonthlyPublicationStatus(
  projectId: string,
  request: GrowthMonthlyPublicationRequest,
  now = new Date(),
) {
  return project(await exactMonthlyPublicationReport(projectId, request, now));
}

async function publishGrowthMonthlyReport(
  projectId: string,
  actorId: string,
  request: GrowthMonthlyPublicationRequest,
  now = new Date(),
) {
  const report = await exactMonthlyPublicationReport(projectId, request, now);
  return project(
    await GrowthReportsService.publishGrowthReport(
      { projectId, reportId: report.id, actorType: "user", actorId },
      { now },
    ),
  );
}
export const GrowthMonthlyReportsService = {
  getGrowthMonthlyReport,
  buildGrowthMonthlyReport,
  getGrowthMonthlyPublicationStatus,
  publishGrowthMonthlyReport,
  GROWTH_MONTHLY_REPORT_BUILDER_VERSION,
} as const;
