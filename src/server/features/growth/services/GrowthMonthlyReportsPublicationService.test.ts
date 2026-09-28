import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/lib/errors";
import { GROWTH_REPORT_SECTION_TYPES } from "@/types/schemas/growth-reports";

const settings = vi.hoisted(() => ({ getSettings: vi.fn() }));
const reports = vi.hoisted(() => ({
  getGrowthReportByCoordinate: vi.fn(),
  createGrowthReport: vi.fn(),
  publishGrowthReport: vi.fn(),
}));
const source = vi.hoisted(() => ({ listMonthlySourceFacts: vi.fn() }));
const builder = vi.hoisted(() => ({
  buildGrowthMonthlyReportSections: vi.fn(),
}));

vi.mock("./GrowthSettingsService", () => ({ GrowthSettingsService: settings }));
vi.mock("./GrowthReportsService", () => ({ GrowthReportsService: reports }));
vi.mock("../repositories/GrowthMonthlyReportsRepository", () => ({
  GrowthMonthlyReportsRepository: source,
}));
vi.mock("./GrowthMonthlyReportBuilder", () => ({
  GROWTH_MONTHLY_REPORT_BUILDER_VERSION: "growth-monthly-report-v1",
  buildGrowthMonthlyReportSections: builder.buildGrowthMonthlyReportSections,
}));

import { GrowthMonthlyReportsService } from "./GrowthMonthlyReportsService";

const current = {
  projectId: "project_authorized",
  periodStart: "2026-08-01",
  periodEnd: "2026-08-31",
  reportTimezone: "Europe/London",
};
const currentNow = new Date("2026-09-01T08:00:00.000Z");
const stored = {
  periodStart: current.periodStart,
  periodEnd: current.periodEnd,
  reportTimezone: current.reportTimezone,
  status: "draft" as const,
  version: 1,
  generatedAt: "2026-09-01T08:00:00.000Z",
  dataCutoffAt: "2026-09-01T08:00:00.000Z",
  sections: GROWTH_REPORT_SECTION_TYPES.map((sectionType) => ({
    sectionType,
    content: { summary: `${sectionType} summary`, items: [] },
  })),
};

describe("GrowthMonthlyReportsService publication", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    settings.getSettings.mockResolvedValue({
      reportTimezone: "Europe/London",
      updatedAt: "2026-08-01T00:00:00.000Z",
      persisted: true,
    });
    reports.getGrowthReportByCoordinate.mockResolvedValue(null);
  });

  it("publishes only the exact frozen coordinate through the core boundary", async () => {
    reports.getGrowthReportByCoordinate.mockResolvedValue({
      ...stored,
      id: "report_1",
    });
    reports.publishGrowthReport.mockResolvedValue({
      ...stored,
      id: "report_1",
      status: "published",
      publishedAt: "2026-09-01T09:00:00.000Z",
    });

    await expect(
      GrowthMonthlyReportsService.publishGrowthMonthlyReport(
        current.projectId,
        "user_authorized",
        { ...current, version: 1 },
        currentNow,
      ),
    ).resolves.toMatchObject({
      state: "report",
      report: { status: "published", publishedAt: "2026-09-01T09:00:00.000Z" },
    });
    expect(reports.publishGrowthReport).toHaveBeenCalledWith(
      {
        projectId: current.projectId,
        reportId: "report_1",
        actorType: "user",
        actorId: "user_authorized",
      },
      { now: currentNow },
    );
    expect(source.listMonthlySourceFacts).not.toHaveBeenCalled();
  });

  it("refuses missing and timezone-mismatched publication coordinates without source work", async () => {
    await expect(
      GrowthMonthlyReportsService.getGrowthMonthlyPublicationStatus(
        current.projectId,
        { ...current, version: 1 },
        currentNow,
      ),
    ).rejects.toThrow("not found");
    reports.getGrowthReportByCoordinate.mockResolvedValue({
      ...stored,
      id: "report_1",
    });

    await expect(
      GrowthMonthlyReportsService.publishGrowthMonthlyReport(
        current.projectId,
        "user_authorized",
        { ...current, reportTimezone: "UTC", version: 1 },
        currentNow,
      ),
    ).rejects.toThrow("timezone does not match");
    expect(reports.publishGrowthReport).not.toHaveBeenCalled();
    expect(source.listMonthlySourceFacts).not.toHaveBeenCalled();
  });

  it("allows one-month publication recovery but rejects an older coordinate", async () => {
    reports.getGrowthReportByCoordinate.mockResolvedValue({
      ...stored,
      id: "report_1",
    });
    reports.publishGrowthReport.mockResolvedValue({
      ...stored,
      id: "report_1",
      status: "published",
      publishedAt: "2026-10-01T09:00:00.000Z",
    });

    await expect(
      GrowthMonthlyReportsService.publishGrowthMonthlyReport(
        current.projectId,
        "user_authorized",
        { ...current, version: 1 },
        new Date("2026-10-01T08:00:00.000Z"),
      ),
    ).resolves.toMatchObject({ report: { status: "published" } });

    vi.clearAllMocks();
    settings.getSettings.mockResolvedValue({
      reportTimezone: "Europe/London",
      updatedAt: "2026-08-01T00:00:00.000Z",
      persisted: true,
    });
    await expect(
      GrowthMonthlyReportsService.publishGrowthMonthlyReport(
        current.projectId,
        "user_authorized",
        { ...current, version: 1 },
        new Date("2026-11-01T08:00:00.000Z"),
      ),
    ).rejects.toThrow("no longer eligible");
    expect(reports.getGrowthReportByCoordinate).not.toHaveBeenCalled();
    expect(reports.publishGrowthReport).not.toHaveBeenCalled();
  });

  it("propagates a source-pruned draft conflict without source or build work", async () => {
    const conflict = new AppError(
      "CONFLICT",
      "Stored draft Growth Report source manifest is incomplete",
    );
    reports.getGrowthReportByCoordinate.mockResolvedValue({
      ...stored,
      id: "report_1",
    });
    reports.publishGrowthReport.mockRejectedValue(conflict);

    await expect(
      GrowthMonthlyReportsService.publishGrowthMonthlyReport(
        current.projectId,
        "user_authorized",
        { ...current, version: 1 },
        currentNow,
      ),
    ).rejects.toBe(conflict);
    expect(source.listMonthlySourceFacts).not.toHaveBeenCalled();
    expect(builder.buildGrowthMonthlyReportSections).not.toHaveBeenCalled();
    expect(reports.createGrowthReport).not.toHaveBeenCalled();
  });

  it("returns an already-published pruned winner with its original timestamp", async () => {
    const published = {
      ...stored,
      id: "report_1",
      status: "published" as const,
      publishedAt: "2026-09-01T09:00:00.000Z",
    };
    reports.getGrowthReportByCoordinate.mockResolvedValue(published);
    reports.publishGrowthReport.mockResolvedValue(published);

    await expect(
      GrowthMonthlyReportsService.getGrowthMonthlyPublicationStatus(
        current.projectId,
        { ...current, version: 1 },
        currentNow,
      ),
    ).resolves.toMatchObject({
      report: {
        status: "published",
        publishedAt: published.publishedAt,
      },
    });
    await expect(
      GrowthMonthlyReportsService.publishGrowthMonthlyReport(
        current.projectId,
        "late_user",
        { ...current, version: 1 },
        new Date("2026-09-01T10:00:00.000Z"),
      ),
    ).resolves.toMatchObject({
      report: {
        status: "published",
        publishedAt: published.publishedAt,
      },
    });
    expect(source.listMonthlySourceFacts).not.toHaveBeenCalled();
  });
});
