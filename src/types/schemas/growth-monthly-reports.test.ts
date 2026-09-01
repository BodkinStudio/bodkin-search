import { describe, expect, it } from "vitest";
import { GROWTH_REPORT_SECTION_TYPES } from "./growth-reports";
import {
  growthMonthlyReportDtoSchema,
  publishGrowthMonthlyReportRequestSchema,
} from "./growth-monthly-reports";

function clientDto() {
  return {
    state: "report" as const,
    periodStart: "2026-08-01",
    periodEnd: "2026-08-31",
    reportTimezone: "UTC",
    report: {
      status: "draft" as const,
      version: 1,
      generatedAt: "2026-09-01T08:00:00.000Z",
      dataCutoffAt: "2026-09-01T08:00:00.000Z",
      sections: GROWTH_REPORT_SECTION_TYPES.map((sectionType) => ({
        sectionType,
        title: "Section",
        summary: "Safe client projection.",
        items: [
          {
            title: "Safe item",
            summary: "Safe narrative.",
            facts: [{ label: "URL 1", value: "https://example.com/safe" }],
          },
        ],
      })),
    },
  };
}

describe("growthMonthlyReportDtoSchema", () => {
  it("allows safe projected URLs but rejects internal identifiers and source metadata", () => {
    expect(growthMonthlyReportDtoSchema.safeParse(clientDto()).success).toBe(
      true,
    );

    const actor = clientDto();
    Object.assign(actor.report, { actorId: "actor_internal_only" });
    expect(growthMonthlyReportDtoSchema.safeParse(actor).success).toBe(false);

    const sectionEvidence = clientDto();
    Object.assign(sectionEvidence.report.sections[0], {
      evidence: [{ id: "evidence_internal_only" }],
    });
    expect(
      growthMonthlyReportDtoSchema.safeParse(sectionEvidence).success,
    ).toBe(false);

    const itemSource = clientDto();
    Object.assign(itemSource.report.sections[0].items[0], {
      source: { type: "action", id: "action_internal_only" },
    });
    expect(growthMonthlyReportDtoSchema.safeParse(itemSource).success).toBe(
      false,
    );
  });

  it("requires published metadata only for published reports", () => {
    const published = {
      ...clientDto(),
      report: {
        ...clientDto().report,
        status: "published" as const,
        publishedAt: "2026-09-01T09:00:00.000Z",
      },
    };
    expect(growthMonthlyReportDtoSchema.safeParse(published).success).toBe(
      true,
    );
    expect(
      growthMonthlyReportDtoSchema.safeParse({
        ...clientDto(),
        report: {
          ...clientDto().report,
          publishedAt: "2026-09-01T09:00:00.000Z",
        },
      }).success,
    ).toBe(false);
    expect(
      growthMonthlyReportDtoSchema.safeParse({
        ...published,
        report: { ...published.report, publishedAt: undefined },
      }).success,
    ).toBe(false);
  });

  it("accepts only a complete real monthly v1 publication coordinate", () => {
    const valid = {
      projectId: "project_1",
      periodStart: "2026-02-01",
      periodEnd: "2026-02-28",
      reportTimezone: "Europe/London",
      version: 1,
    };
    expect(
      publishGrowthMonthlyReportRequestSchema.safeParse(valid).success,
    ).toBe(true);
    for (const invalid of [
      { ...valid, periodStart: "2026-02-30" },
      { ...valid, periodEnd: "2026-02-29" },
      { ...valid, periodStart: "2026-02-02" },
      { ...valid, reportTimezone: "Mars/Olympus" },
      { ...valid, version: 2 },
      { ...valid, periodEnd: undefined },
      { ...valid, reportId: "forged" },
      { ...valid, reportType: "monthly" },
      { ...valid, status: "published" },
      { ...valid, actorType: "user" },
      { ...valid, actorId: "forged" },
      { ...valid, publishedById: "forged" },
      { ...valid, publishedAt: "2026-09-01T09:00:00.000Z" },
      { ...valid, factHash: "forged" },
    ])
      expect(
        publishGrowthMonthlyReportRequestSchema.safeParse(invalid).success,
      ).toBe(false);
  });
});
