import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GROWTH_REPORT_SECTION_TYPES } from "@/types/schemas/growth-reports";
import type { GrowthMonthlyReportDto } from "@/types/schemas/growth-monthly-reports";
import {
  claimGrowthMonthlyReportDispatch,
  GrowthMonthlyReportState,
} from "./GrowthMonthlyReport";
import { GROWTH_REPORT_SECTION_TITLES } from "./GrowthReportPresentation";
import { GrowthReportView } from "./GrowthReportView";

vi.mock("@/serverFunctions/growthReports", () => ({
  getGrowthMonthlyReport: vi.fn(),
  buildGrowthMonthlyReport: vi.fn(),
}));

const common = {
  periodStart: "2026-08-01",
  periodEnd: "2026-08-31",
  reportTimezone: "Europe/London",
} as const;

const report = {
  state: "report",
  ...common,
  report: {
    status: "draft",
    version: 1,
    generatedAt: "2026-09-01T09:00:00.000Z",
    dataCutoffAt: "2026-09-01T08:59:00.000Z",
    sections: GROWTH_REPORT_SECTION_TYPES.map((sectionType, index) => ({
      sectionType,
      title: GROWTH_REPORT_SECTION_TITLES[sectionType],
      summary:
        index === 0
          ? "Saved <script>alert('unsafe')</script> summary."
          : `Saved ${GROWTH_REPORT_SECTION_TITLES[sectionType]} summary.`,
      items:
        index === 0
          ? [
              {
                title: "Bounded activity",
                summary: "No causal claim is made.",
                facts: [
                  { label: "Count", value: 0 },
                  { label: "Complete", value: false },
                  { label: "Comparison", value: null },
                ],
              },
            ]
          : [],
    })),
  },
} satisfies GrowthMonthlyReportDto;

describe("Growth Monthly Report rendered contract", () => {
  it("renders one frozen semantic article with all sections in order", () => {
    const html = renderToStaticMarkup(
      createElement(GrowthReportView, { data: report }),
    );
    expect(html).toContain("August 2026 Growth summary");
    expect(html).toContain(">Draft<");
    expect(html).toContain("Version 1");
    expect(html).toContain("Europe/London");
    expect(html).toContain("Data cutoff");
    expect(html).toContain("<article");
    expect(html).toContain(
      'aria-labelledby="growth-monthly-report-document-title"',
    );
    expect(html).toContain('<h3 id="growth-monthly-report-document-title"');
    expect(html).toContain("<section");
    expect(html).toContain("<ol");
    expect(html).toContain("<li");
    expect(html).toContain("<dl");
    expect(html).toContain('aria-labelledby="growth-report-performance"');
    expect(html).toContain("Not available");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("source");
    expect(html).not.toContain("evidence");
    let previous = -1;
    for (const sectionType of GROWTH_REPORT_SECTION_TYPES) {
      const current = html.indexOf(GROWTH_REPORT_SECTION_TITLES[sectionType]);
      expect(current).toBeGreaterThan(previous);
      previous = current;
    }
  });

  it("offers one explicit build for a ready period", () => {
    const html = renderToStaticMarkup(
      createElement(GrowthMonthlyReportState, {
        data: { state: "ready", ...common },
        building: false,
        locked: false,
        onBuild: vi.fn(),
      }),
    );
    expect(html).toContain("Build August 2026 summary");
    expect(html).toContain("creates version 1 once");
    expect(html).not.toContain("Publish");
  });

  it("keeps a truthful no-activity state linked to Work", () => {
    const html = renderToStaticMarkup(
      createElement(GrowthMonthlyReportState, {
        data: {
          state: "no_activity",
          ...common,
          message: "No eligible saved activity was found for August 2026.",
        },
        building: false,
        locked: false,
        onBuild: vi.fn(),
      }),
    );
    expect(html).toContain("No eligible saved activity");
    expect(html).toContain("Actions completed during August 2026");
    expect(html).toContain("terminal Measurements evaluated during it");
    expect(html).toContain("Risks, Opportunities or Next month");
    expect(html).toContain('href="#growth-work"');
    expect(html).not.toContain("Build August 2026 summary");
  });

  it("locks the build control while dispatching", () => {
    const html = renderToStaticMarkup(
      createElement(GrowthMonthlyReportState, {
        data: { state: "ready", ...common },
        building: true,
        locked: true,
        onBuild: vi.fn(),
      }),
    );
    expect(html).toContain("Building August 2026 summary…");
    expect(html).toContain("disabled");
  });

  it("admits only one dispatch until the active request releases its lock", () => {
    const lock = { current: false };
    expect(claimGrowthMonthlyReportDispatch(lock, false)).toBe(true);
    expect(claimGrowthMonthlyReportDispatch(lock, false)).toBe(false);
    lock.current = false;
    expect(claimGrowthMonthlyReportDispatch(lock, true)).toBe(false);
  });

  it("labels a previously published frozen report without offering publication", () => {
    const published = {
      ...report,
      report: { ...report.report, status: "published" as const },
    };
    const html = renderToStaticMarkup(
      createElement(GrowthReportView, { data: published }),
    );
    expect(html).toContain(">Published<");
    expect(html).not.toContain(">Publish<");
  });
});
