import { describe, expect, it } from "vitest";
import {
  GROWTH_REPORT_CONTENT_SCHEMA_VERSION,
  GROWTH_REPORT_SECTION_POSITIONS,
  GROWTH_REPORT_SECTION_TYPES,
  type CreateGrowthReportInput,
  type GrowthReportSection,
} from "@/types/schemas/growth-reports";
import {
  buildGrowthReportSnapshot,
  decodeGrowthReportSections,
  GROWTH_REPORT_BUILDER_VERSION,
} from "./GrowthReportSnapshot";

function sections(): GrowthReportSection[] {
  return GROWTH_REPORT_SECTION_TYPES.toReversed().map((sectionType) => ({
    sectionType,
    position: GROWTH_REPORT_SECTION_POSITIONS[sectionType],
    content: {
      summary: `${sectionType} summary`,
      items:
        sectionType === "executive_summary"
          ? [
              {
                key: "won-work",
                position: 0,
                title: "Completed the priority page",
                summary: "The agreed page change shipped during the period.",
                facts: [
                  {
                    key: "delta",
                    position: 1,
                    label: "Change",
                    value: -0,
                  },
                  {
                    key: "clicks",
                    position: 0,
                    label: "Clicks",
                    value: 42,
                  },
                ],
                evidence: [
                  { kind: "manual_observation", ref: "worklog:42" },
                  { kind: "manual_observation", ref: "worklog:42" },
                ],
                source: { type: "action", id: "action_1" },
              },
            ]
          : [],
    },
  }));
}

function input(
  overrides: Partial<CreateGrowthReportInput> = {},
): CreateGrowthReportInput {
  return {
    projectId: "project_1",
    reportType: "monthly" as const,
    periodStart: "2026-07-01",
    periodEnd: "2026-07-31",
    version: 1,
    reportTimezone: "Europe/London",
    dataCutoffAt: "2026-08-01T08:00:00.000Z",
    generatedAt: "2026-08-01T09:00:00.000Z",
    builderVersion: GROWTH_REPORT_BUILDER_VERSION,
    contentSchemaVersion: GROWTH_REPORT_CONTENT_SCHEMA_VERSION,
    createdByType: "agent" as const,
    createdById: "growth-reporter",
    sections: sections(),
    ...overrides,
  };
}

describe("GrowthReportSnapshot", () => {
  it("canonicalizes presentation order, facts and evidence", async () => {
    const snapshot = await buildGrowthReportSnapshot(input());

    expect(
      snapshot.input.sections.map(({ sectionType }) => sectionType),
    ).toEqual(GROWTH_REPORT_SECTION_TYPES);
    expect(snapshot.input.sections[0]?.content.items[0]?.facts).toMatchObject([
      { key: "clicks", position: 0, value: 42 },
      { key: "delta", position: 1, value: 0 },
    ]);
    expect(snapshot.input.sections[0]?.content.items[0]?.evidence).toEqual([
      { kind: "manual_observation", ref: "worklog:42" },
    ]);
    expect(snapshot.directActionIds).toEqual(["action_1"]);
    expect(snapshot.measurementResultIds).toEqual([]);
    expect(decodeGrowthReportSections(snapshot.sections)).toEqual(
      snapshot.input.sections,
    );
  });

  it("excludes server generation time but not semantic content from the hash", async () => {
    const first = await buildGrowthReportSnapshot(input());
    const later = await buildGrowthReportSnapshot(
      input({ generatedAt: "2026-08-01T10:00:00.000Z" }),
    );
    const changed = await buildGrowthReportSnapshot(
      input({ createdById: "different-agent" }),
    );

    expect(later.factHash).toBe(first.factHash);
    expect(changed.factHash).not.toBe(first.factHash);
  });
});
