import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  GROWTH_REPORT_SECTION_POSITIONS,
  GROWTH_REPORT_SECTION_TYPES,
} from "@/types/schemas/growth-reports";

const settings = vi.hoisted(() => ({ getSettings: vi.fn() }));
const reports = vi.hoisted(() => ({
  getGrowthReportByCoordinate: vi.fn(),
  createGrowthReport: vi.fn(),
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
import { earliestUtcCalendarDateBoundary } from "./GrowthMeasurementFacts";

const current = {
  projectId: "project_authorized",
  periodStart: "2026-08-01",
  periodEnd: "2026-08-31",
  reportTimezone: "Europe/London",
};
const currentNow = new Date("2026-09-01T08:00:00.000Z");
const sourceFacts = {
  performance: [],
  earlierResults: [],
  completed: [],
  risks: [],
  next: [],
  opportunities: [],
  changes: [],
  actionUrls: [],
  changeUrls: [],
  links: [],
};
const monthlyCandidateAction = (id: string) => ({
  id,
  title: `Action ${id}`,
  description: `Candidate ${id}`,
  status: "ready",
  priorityScore: 10,
  dueAt: "2026-10-01T12:00:00.000Z",
  implementedAt: null,
});
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

describe("GrowthMonthlyReportsService", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    settings.getSettings.mockResolvedValue({
      reportTimezone: "Europe/London",
      updatedAt: "2026-08-01T00:00:00.000Z",
      persisted: true,
    });
    reports.getGrowthReportByCoordinate.mockResolvedValue(null);
    source.listMonthlySourceFacts.mockResolvedValue(sourceFacts);
    builder.buildGrowthMonthlyReportSections.mockReturnValue(null);
  });

  it("returns an existing echoed winner without rebuilding it", async () => {
    reports.getGrowthReportByCoordinate.mockResolvedValue(stored);

    await expect(
      GrowthMonthlyReportsService.buildGrowthMonthlyReport(
        current.projectId,
        "user_authorized",
        current,
        currentNow,
      ),
    ).resolves.toMatchObject({ state: "report", report: { version: 1 } });

    expect(source.listMonthlySourceFacts).not.toHaveBeenCalled();
    expect(builder.buildGrowthMonthlyReportSections).not.toHaveBeenCalled();
    expect(reports.createGrowthReport).not.toHaveBeenCalled();
  });

  it.each([
    {
      now: "2027-01-15T12:00:00.000Z",
      periodStart: "2026-12-01",
      periodEnd: "2026-12-31",
    },
    {
      now: "2028-03-01T12:00:00.000Z",
      periodStart: "2028-02-01",
      periodEnd: "2028-02-29",
    },
  ])(
    "derives the previous complete month at year and leap boundaries ($periodStart)",
    async ({ now, periodStart, periodEnd }) => {
      settings.getSettings.mockResolvedValue({
        reportTimezone: "UTC",
        updatedAt: "2026-08-01T00:00:00.000Z",
        persisted: true,
      });
      await expect(
        GrowthMonthlyReportsService.getGrowthMonthlyReport(
          current.projectId,
          { projectId: current.projectId },
          new Date(now),
        ),
      ).resolves.toEqual({
        state: "ready",
        periodStart,
        periodEnd,
        reportTimezone: "UTC",
      });
    },
  );

  it("refuses an unsaved stale month without querying sources or writing", async () => {
    await expect(
      GrowthMonthlyReportsService.buildGrowthMonthlyReport(
        current.projectId,
        "user_authorized",
        { ...current, periodStart: "2026-07-01", periodEnd: "2026-07-31" },
        currentNow,
      ),
    ).resolves.toEqual({
      state: "ready",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      reportTimezone: "Europe/London",
    });
    expect(source.listMonthlySourceFacts).not.toHaveBeenCalled();
    expect(reports.createGrowthReport).not.toHaveBeenCalled();
  });

  it("rejects a recovery coordinate more than one month from current", async () => {
    await expect(
      GrowthMonthlyReportsService.buildGrowthMonthlyReport(
        current.projectId,
        "user_authorized",
        { ...current, periodStart: "2026-06-01", periodEnd: "2026-06-30" },
        currentNow,
      ),
    ).rejects.toThrow("no longer eligible");
    expect(source.listMonthlySourceFacts).not.toHaveBeenCalled();
    expect(reports.createGrowthReport).not.toHaveBeenCalled();
  });

  it("refuses an unsaved stale timezone without querying sources or writing", async () => {
    settings.getSettings.mockResolvedValue({
      reportTimezone: "UTC",
      updatedAt: "2026-09-01T00:00:00.000Z",
      persisted: true,
    });

    await expect(
      GrowthMonthlyReportsService.buildGrowthMonthlyReport(
        current.projectId,
        "user_authorized",
        current,
        currentNow,
      ),
    ).resolves.toEqual({
      state: "ready",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      reportTimezone: "UTC",
    });
    expect(source.listMonthlySourceFacts).not.toHaveBeenCalled();
    expect(reports.createGrowthReport).not.toHaveBeenCalled();
  });

  it("returns an old winner across a timezone rollover before refusing stale work", async () => {
    settings.getSettings.mockResolvedValue({
      reportTimezone: "UTC",
      updatedAt: "2026-09-01T00:00:00.000Z",
      persisted: true,
    });
    reports.getGrowthReportByCoordinate.mockResolvedValue(stored);

    await expect(
      GrowthMonthlyReportsService.getGrowthMonthlyReport(
        current.projectId,
        current,
        currentNow,
      ),
    ).resolves.toMatchObject({
      state: "report",
      reportTimezone: "Europe/London",
    });
    expect(source.listMonthlySourceFacts).not.toHaveBeenCalled();
  });

  it("keeps no-activity builds read-only", async () => {
    await expect(
      GrowthMonthlyReportsService.buildGrowthMonthlyReport(
        current.projectId,
        "user_authorized",
        current,
        currentNow,
      ),
    ).resolves.toMatchObject({ state: "no_activity" });
    expect(source.listMonthlySourceFacts).toHaveBeenCalledOnce();
    expect(reports.createGrowthReport).not.toHaveBeenCalled();
  });

  it("uses timezone half-open DST boundaries for the current build", async () => {
    settings.getSettings.mockResolvedValue({
      reportTimezone: "Europe/London",
      updatedAt: "2026-03-01T00:00:00.000Z",
      persisted: true,
    });
    const march = {
      projectId: current.projectId,
      periodStart: "2026-03-01",
      periodEnd: "2026-03-31",
      reportTimezone: "Europe/London",
    };
    await GrowthMonthlyReportsService.buildGrowthMonthlyReport(
      current.projectId,
      "user_authorized",
      march,
      new Date("2026-04-01T08:00:00.000Z"),
    );
    expect(source.listMonthlySourceFacts.mock.calls[0]?.[1]).toMatchObject({
      periodStartAt: "2026-03-01T00:00:00.000Z",
      periodEndExclusiveAt: "2026-03-31T23:00:00.000Z",
    });
  });

  it("uses the shared earliest UTC boundaries for every Cairo monthly source bound", async () => {
    settings.getSettings.mockResolvedValue({
      reportTimezone: "Africa/Cairo",
      updatedAt: "2023-04-01T00:00:00.000Z",
      persisted: true,
    });
    const april = {
      projectId: current.projectId,
      periodStart: "2023-04-01",
      periodEnd: "2023-04-30",
      reportTimezone: "Africa/Cairo",
    };
    await GrowthMonthlyReportsService.buildGrowthMonthlyReport(
      current.projectId,
      "user_authorized",
      april,
      new Date("2023-05-01T08:00:00.000Z"),
    );
    expect(source.listMonthlySourceFacts.mock.calls[0]?.[1]).toMatchObject({
      periodStartAt: "2023-03-31T22:00:00.000Z",
      periodEndExclusiveAt: "2023-04-30T21:00:00.000Z",
      cutoffStartAt: "2023-04-30T21:00:00.000Z",
      nextMonthStartAt: "2023-04-30T21:00:00.000Z",
      nextMonthEndExclusiveAt: "2023-05-31T21:00:00.000Z",
    });
  });

  it("maps a skipped Cairo midnight and a wholly skipped Apia date forward", () => {
    expect(earliestUtcCalendarDateBoundary("2023-04-28", "Africa/Cairo")).toBe(
      "2023-04-27T22:00:00.000Z",
    );
    expect(earliestUtcCalendarDateBoundary("2026-04-24", "Africa/Cairo")).toBe(
      "2026-04-23T22:00:00.000Z",
    );
    expect(earliestUtcCalendarDateBoundary("2011-12-30", "Pacific/Apia")).toBe(
      "2011-12-30T10:00:00.000Z",
    );
  });

  it("recovers the persisted first writer after a distinct contender loses", async () => {
    builder.buildGrowthMonthlyReportSections.mockReturnValue([]);
    reports.createGrowthReport.mockRejectedValue(new Error("unique conflict"));
    reports.getGrowthReportByCoordinate
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(stored);

    await expect(
      GrowthMonthlyReportsService.buildGrowthMonthlyReport(
        current.projectId,
        "user_authorized",
        current,
        currentNow,
      ),
    ).resolves.toMatchObject({ state: "report", report: { version: 1 } });
    expect(reports.createGrowthReport).toHaveBeenCalledOnce();
    expect(reports.getGrowthReportByCoordinate).toHaveBeenCalledTimes(2);
  });

  it("returns one immutable winner to concurrent builders with distinct cutoffs and sources", async () => {
    source.listMonthlySourceFacts
      .mockResolvedValueOnce({
        ...sourceFacts,
        opportunities: [monthlyCandidateAction("candidate_a")],
      })
      .mockResolvedValueOnce({
        ...sourceFacts,
        opportunities: [monthlyCandidateAction("candidate_b")],
      });
    const sectionsFor = (summary: string) =>
      GROWTH_REPORT_SECTION_TYPES.map((sectionType) => ({
        sectionType,
        position: GROWTH_REPORT_SECTION_POSITIONS[sectionType],
        content: { summary, items: [] },
      }));
    const firstSections = sectionsFor("First candidate snapshot");
    const secondSections = sectionsFor("Second candidate snapshot");
    builder.buildGrowthMonthlyReportSections
      .mockReturnValueOnce(firstSections)
      .mockReturnValueOnce(secondSections);

    let winnerSaved = false;
    let initialReads = 0;
    let releaseInitialReads: (() => void) | undefined;
    const bothInitialReads = new Promise<void>((resolve) => {
      releaseInitialReads = resolve;
    });
    reports.getGrowthReportByCoordinate.mockImplementation(async () => {
      if (winnerSaved) return stored;
      initialReads += 1;
      if (initialReads === 2) releaseInitialReads?.();
      await bothInitialReads;
      return null;
    });
    let createCalls = 0;
    reports.createGrowthReport.mockImplementation(async () => {
      createCalls += 1;
      if (createCalls === 1) {
        winnerSaved = true;
        return stored;
      }
      throw new Error("unique conflict");
    });

    const results = await Promise.all([
      GrowthMonthlyReportsService.buildGrowthMonthlyReport(
        current.projectId,
        "user_a",
        current,
        new Date("2026-09-01T08:00:00.000Z"),
      ),
      GrowthMonthlyReportsService.buildGrowthMonthlyReport(
        current.projectId,
        "user_b",
        current,
        new Date("2026-09-01T09:00:00.000Z"),
      ),
    ]);

    expect(results[0]).toEqual(results[1]);
    expect(results[0]).toMatchObject({
      state: "report",
      report: { generatedAt: stored.generatedAt },
    });
    expect(reports.createGrowthReport).toHaveBeenCalledTimes(2);
    expect(reports.createGrowthReport.mock.calls[0]?.[0]).toMatchObject({
      dataCutoffAt: "2026-09-01T08:00:00.000Z",
      sections: firstSections,
    });
    expect(reports.createGrowthReport.mock.calls[1]?.[0]).toMatchObject({
      dataCutoffAt: "2026-09-01T09:00:00.000Z",
      sections: secondSections,
    });
  });
});
