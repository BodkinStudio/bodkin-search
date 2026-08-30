/* eslint-disable max-lines, max-lines-per-function -- report contract cases stay grouped by their public boundary */
import { describe, expect, it } from "vitest";
import {
  canonicalizeGrowthReportSections,
  collectGrowthReportSourceIds,
  createGrowthReportSchema,
  decodeGrowthReportSectionContent,
  encodeGrowthReportSectionContent,
  GROWTH_REPORT_CONTENT_SCHEMA_VERSION,
  GROWTH_REPORT_SECTION_POSITIONS,
  GROWTH_REPORT_SECTION_TYPES,
  GROWTH_REPORT_STATUSES,
  GROWTH_REPORT_TYPES,
  growthReportSectionContentSchema,
  growthReportSectionSchema,
  MAX_GROWTH_REPORT_ACTION_SOURCES,
  MAX_GROWTH_REPORT_EVIDENCE_PER_ITEM,
  MAX_GROWTH_REPORT_FACTS_PER_ITEM,
  MAX_GROWTH_REPORT_ITEMS_PER_SECTION,
  MAX_GROWTH_REPORT_RESULT_SOURCES,
  publishGrowthReportSchema,
  type GrowthReportItem,
  type GrowthReportSection,
  type GrowthReportSectionType,
} from "./growth-reports";

const actionSource = { type: "action" as const, id: "action_1" };
const resultSource = {
  type: "measurement_result" as const,
  id: "result_1",
};

function item(overrides: Partial<GrowthReportItem> = {}): GrowthReportItem {
  return {
    key: "item-1",
    position: 0,
    title: "Pricing work completed",
    summary: "The approved pricing-page work was implemented.",
    facts: [],
    evidence: [],
    source: actionSource,
    ...overrides,
  };
}

function section(
  sectionType: GrowthReportSectionType,
  overrides: Partial<GrowthReportSection> = {},
): GrowthReportSection {
  return {
    sectionType,
    position: GROWTH_REPORT_SECTION_POSITIONS[sectionType],
    content: {
      summary: `Summary for ${sectionType}.`,
      items: sectionType === "work_completed" ? [item()] : [],
    },
    ...overrides,
  };
}

function sections(): GrowthReportSection[] {
  return GROWTH_REPORT_SECTION_TYPES.map((sectionType) => section(sectionType));
}

const report = {
  projectId: "project_1",
  reportType: "monthly" as const,
  periodStart: "2026-08-01",
  periodEnd: "2026-08-31",
  version: 1,
  reportTimezone: "Europe/London",
  dataCutoffAt: "2026-08-31T22:00:00+01:00",
  generatedAt: "2026-08-31T21:30:00.000Z",
  builderVersion: "growth-report-builder-v1",
  contentSchemaVersion: GROWTH_REPORT_CONTENT_SCHEMA_VERSION,
  createdByType: "agent" as const,
  createdById: "growth-agent",
  sections: sections(),
};

describe("Growth Report contracts", () => {
  it("accepts monthly only and canonicalizes the exact section order", () => {
    expect(GROWTH_REPORT_TYPES).toEqual(["monthly"]);
    expect(GROWTH_REPORT_STATUSES).toEqual(["draft", "published"]);
    expect(GROWTH_REPORT_SECTION_TYPES).toEqual([
      "executive_summary",
      "performance",
      "meaningful_changes",
      "work_completed",
      "results_from_earlier_work",
      "risks",
      "opportunities",
      "next_month",
    ]);
    const parsed = createGrowthReportSchema.parse({
      ...report,
      sections: report.sections.toReversed(),
    });
    expect(parsed.sections.map(({ sectionType }) => sectionType)).toEqual(
      GROWTH_REPORT_SECTION_TYPES,
    );
    expect(parsed.dataCutoffAt).toBe("2026-08-31T21:00:00.000Z");
    expect(() =>
      createGrowthReportSchema.parse({ ...report, reportType: "weekly" }),
    ).toThrow();
  });

  it("requires every section exactly once at its fixed position", () => {
    expect(() =>
      createGrowthReportSchema.parse({
        ...report,
        sections: report.sections.slice(0, 7),
      }),
    ).toThrow();
    expect(() =>
      createGrowthReportSchema.parse({
        ...report,
        sections: report.sections.map((value, index) =>
          index === 7 ? section("executive_summary") : value,
        ),
      }),
    ).toThrow("A Report must contain every section exactly once");
    expect(() =>
      growthReportSectionSchema.parse({
        ...section("performance"),
        position: 7,
      }),
    ).toThrow("Section position does not match the canonical report order");
  });

  it("accepts valid inclusive dates and rejects malformed snapshot metadata", () => {
    expect(
      createGrowthReportSchema.parse({
        ...report,
        periodStart: "2026-08-31",
      }),
    ).toMatchObject({ periodStart: "2026-08-31", periodEnd: "2026-08-31" });
    expect(() =>
      createGrowthReportSchema.parse({ ...report, periodStart: "2026-02-30" }),
    ).toThrow("Use a valid calendar date");
    expect(() =>
      createGrowthReportSchema.parse({ ...report, periodStart: "2026-09-01" }),
    ).toThrow("Period end must be on or after period start");
    expect(() =>
      createGrowthReportSchema.parse({ ...report, version: 0 }),
    ).toThrow();
    expect(() =>
      createGrowthReportSchema.parse({ ...report, version: 1.5 }),
    ).toThrow();
    expect(() =>
      createGrowthReportSchema.parse({
        ...report,
        reportTimezone: "Mars/Olympus_Mons",
      }),
    ).toThrow("Use a valid IANA timezone");
    expect(() =>
      createGrowthReportSchema.parse({ ...report, generatedAt: "yesterday" }),
    ).toThrow();
    expect(() =>
      createGrowthReportSchema.parse({
        ...report,
        dataCutoffAt: "2026-09-01T00:00:00.000Z",
      }),
    ).toThrow("Data cutoff cannot follow report generation");
  });

  it("bounds versions and creator/publisher actor metadata", () => {
    expect(() =>
      createGrowthReportSchema.parse({
        ...report,
        contentSchemaVersion: 2,
      }),
    ).toThrow();
    expect(() =>
      createGrowthReportSchema.parse({
        ...report,
        builderVersion: "x".repeat(101),
      }),
    ).toThrow();
    expect(() =>
      createGrowthReportSchema.parse({ ...report, createdByType: "worker" }),
    ).toThrow();
    expect(() =>
      createGrowthReportSchema.parse({
        ...report,
        createdById: "x".repeat(201),
      }),
    ).toThrow();
    expect(
      publishGrowthReportSchema.parse({
        projectId: "project_1",
        reportId: "report_1",
        actorType: "user",
        actorId: "user_1",
      }),
    ).toMatchObject({ actorType: "user" });
    expect(() =>
      publishGrowthReportSchema.parse({
        projectId: "project_1",
        reportId: "report_1",
        actorType: "integration",
        actorId: "integration_1",
      }),
    ).toThrow();
  });

  it("is strict at every structured-content level", () => {
    expect(() =>
      createGrowthReportSchema.parse({ ...report, creationKey: "not-allowed" }),
    ).toThrow();
    expect(() =>
      growthReportSectionSchema.parse({
        ...section("work_completed"),
        arbitrary: true,
      }),
    ).toThrow();
    expect(() =>
      growthReportSectionContentSchema.parse({
        summary: "Strict content.",
        items: [{ ...item(), payload: { hidden: true } }],
      }),
    ).toThrow();
    expect(() =>
      growthReportSectionContentSchema.parse({
        summary: "Strict facts.",
        items: [
          {
            ...item(),
            facts: [
              {
                key: "clicks",
                position: 0,
                label: "Clicks",
                value: 12,
                unit: "clicks",
              },
            ],
          },
        ],
      }),
    ).toThrow();
  });

  it("canonicalizes explicit item/fact positions and evidence sets", () => {
    const content = growthReportSectionContentSchema.parse({
      summary: "Measured performance.",
      items: [
        item({
          key: "second",
          position: 1,
          facts: [
            { key: "ctr", position: 1, label: "CTR", value: -0 },
            { key: "clicks", position: 0, label: "Clicks", value: 42 },
          ],
          evidence: [
            { kind: "manual_observation", ref: "manual:2" },
            { kind: "gsc_period", ref: "gsc:august" },
            { kind: "manual_observation", ref: "manual:2" },
          ],
        }),
        item({ key: "first", position: 0 }),
      ],
    });
    expect(content.items.map(({ key }) => key)).toEqual(["first", "second"]);
    expect(content.items[1]?.facts.map(({ key }) => key)).toEqual([
      "clicks",
      "ctr",
    ]);
    expect(content.items[1]?.facts[1]?.value).toBe(0);
    expect(content.items[1]?.evidence).toEqual([
      { kind: "gsc_period", ref: "gsc:august" },
      { kind: "manual_observation", ref: "manual:2" },
    ]);
  });

  it("rejects duplicate or non-contiguous item and fact coordinates", () => {
    expect(() =>
      growthReportSectionContentSchema.parse({
        summary: "Duplicate item key.",
        items: [item(), item({ position: 1 })],
      }),
    ).toThrow("Keys must be unique");
    expect(() =>
      growthReportSectionContentSchema.parse({
        summary: "Duplicate item position.",
        items: [item(), item({ key: "item-2" })],
      }),
    ).toThrow("Positions must be unique");
    expect(() =>
      growthReportSectionContentSchema.parse({
        summary: "Position gap.",
        items: [item({ position: 1 })],
      }),
    ).toThrow("Positions must be contiguous from zero");
    expect(() =>
      growthReportSectionContentSchema.parse({
        summary: "Duplicate facts.",
        items: [
          item({
            facts: [
              { key: "first", position: 0, label: "Clicks", value: 42 },
              { key: "second", position: 1, label: "Clicks", value: 42 },
            ],
          }),
        ],
      }),
    ).toThrow("Facts must be unique");
  });

  it("accepts only finite scalar facts and registered typed evidence", () => {
    for (const value of ["Improved", 42, true, false, null]) {
      expect(
        growthReportSectionContentSchema.parse({
          summary: "Scalar fact.",
          items: [
            item({
              facts: [{ key: "fact", position: 0, label: "Fact", value }],
            }),
          ],
        }).items[0]?.facts[0]?.value,
      ).toBe(value);
    }
    expect(() =>
      growthReportSectionContentSchema.parse({
        summary: "Infinite fact.",
        items: [
          item({
            facts: [
              { key: "fact", position: 0, label: "Fact", value: Infinity },
            ],
          }),
        ],
      }),
    ).toThrow();
    expect(() =>
      growthReportSectionContentSchema.parse({
        summary: "Bad evidence.",
        items: [
          {
            ...item(),
            evidence: [{ kind: "provider_payload", ref: "opaque" }],
          },
        ],
      }),
    ).toThrow();
  });

  it("enforces section/source compatibility", () => {
    const allowed: Record<
      GrowthReportSectionType,
      readonly ("action" | "measurement_result")[]
    > = {
      executive_summary: ["action", "measurement_result"],
      performance: ["measurement_result"],
      meaningful_changes: ["action", "measurement_result"],
      work_completed: ["action"],
      results_from_earlier_work: ["measurement_result"],
      risks: ["action"],
      opportunities: ["action"],
      next_month: ["action"],
    };
    for (const sectionType of GROWTH_REPORT_SECTION_TYPES) {
      for (const source of [actionSource, resultSource]) {
        const candidate = section(sectionType, {
          content: {
            summary: "Compatibility test.",
            items: [item({ source })],
          },
        });
        expect(
          growthReportSectionSchema.safeParse(candidate).success,
          `${source.type} in ${sectionType}`,
        ).toBe(allowed[sectionType].includes(source.type));
      }
    }
  });

  it("allows empty sections but requires one sourced item report-wide", () => {
    const emptySections = GROWTH_REPORT_SECTION_TYPES.map((sectionType) =>
      section(sectionType, {
        content: {
          summary: "There was nothing material in this section.",
          items: [],
        },
      }),
    );
    expect(() =>
      createGrowthReportSchema.parse({ ...report, sections: emptySections }),
    ).toThrow("A Report must contain at least one sourced item");
    expect(
      createGrowthReportSchema.parse({
        ...report,
        sections: emptySections.map((value) =>
          value.sectionType === "next_month"
            ? {
                ...value,
                content: { ...value.content, items: [item()] },
              }
            : value,
        ),
      }).sections,
    ).toHaveLength(8);
  });

  it("caps items, facts and evidence references", () => {
    const manyItems = Array.from(
      { length: MAX_GROWTH_REPORT_ITEMS_PER_SECTION + 1 },
      (_, position) => item({ key: `item-${position}`, position }),
    );
    expect(() =>
      growthReportSectionContentSchema.parse({
        summary: "Too many items.",
        items: manyItems,
      }),
    ).toThrow();
    const tooManyFacts = Array.from(
      { length: MAX_GROWTH_REPORT_FACTS_PER_ITEM + 1 },
      (_, position) => ({
        key: `fact-${position}`,
        position,
        label: `Fact ${position}`,
        value: position,
      }),
    );
    expect(() =>
      growthReportSectionContentSchema.parse({
        summary: "Too many facts.",
        items: [item({ facts: tooManyFacts })],
      }),
    ).toThrow();
    const tooMuchEvidence = Array.from(
      { length: MAX_GROWTH_REPORT_EVIDENCE_PER_ITEM + 1 },
      (_, index) => ({
        kind: "manual_observation" as const,
        ref: `manual:${index}`,
      }),
    );
    expect(() =>
      growthReportSectionContentSchema.parse({
        summary: "Too much evidence.",
        items: [item({ evidence: tooMuchEvidence })],
      }),
    ).toThrow();
  });

  it("deduplicates report-wide links and enforces unique source caps", () => {
    const sourceSections = sections().map((value) =>
      value.sectionType === "executive_summary"
        ? {
            ...value,
            content: {
              ...value.content,
              items: [
                item({ source: { type: "action", id: "action_2" } }),
                item({
                  key: "result",
                  position: 1,
                  source: resultSource,
                }),
              ],
            },
          }
        : value,
    );
    expect(collectGrowthReportSourceIds(sourceSections)).toEqual({
      actionIds: ["action_1", "action_2"],
      measurementResultIds: ["result_1"],
    });

    const tooManyActions = sections().map((value) => {
      if (value.sectionType === "work_completed")
        return {
          ...value,
          content: {
            ...value.content,
            items: Array.from(
              { length: MAX_GROWTH_REPORT_ACTION_SOURCES },
              (_, position) =>
                item({
                  key: `action-${position}`,
                  position,
                  source: { type: "action", id: `action_${position}` },
                }),
            ),
          },
        };
      if (value.sectionType === "next_month")
        return {
          ...value,
          content: {
            ...value.content,
            items: [
              item({ source: { type: "action", id: "one_action_too_many" } }),
            ],
          },
        };
      return value;
    });
    expect(() =>
      createGrowthReportSchema.parse({ ...report, sections: tooManyActions }),
    ).toThrow("A Report cannot reference more than 100 Actions");

    const tooManyResults = sections().map((value) => {
      if (value.sectionType === "performance")
        return {
          ...value,
          content: {
            ...value.content,
            items: Array.from(
              { length: MAX_GROWTH_REPORT_RESULT_SOURCES },
              (_, position) =>
                item({
                  key: `result-${position}`,
                  position,
                  source: {
                    type: "measurement_result",
                    id: `result_${position}`,
                  },
                }),
            ),
          },
        };
      if (value.sectionType === "results_from_earlier_work")
        return {
          ...value,
          content: {
            ...value.content,
            items: [
              item({
                source: {
                  type: "measurement_result",
                  id: "one_result_too_many",
                },
              }),
            ],
          },
        };
      return value;
    });
    expect(() =>
      createGrowthReportSchema.parse({ ...report, sections: tooManyResults }),
    ).toThrow("A Report cannot reference more than 50 Measurement Results");
  });

  it("enforces 64 KiB per section and 256 KiB report-wide", () => {
    const oversizedContent = {
      summary: "Oversized section.",
      items: Array.from({ length: 14 }, (_, position) =>
        item({
          key: `item-${position}`,
          position,
          summary: "x".repeat(5000),
          source: position === 0 ? actionSource : null,
        }),
      ),
    };
    expect(() =>
      growthReportSectionContentSchema.parse(oversizedContent),
    ).toThrow("Report section content exceeds 64 KiB");

    const largeSections = GROWTH_REPORT_SECTION_TYPES.map((sectionType) =>
      section(sectionType, {
        content: {
          summary: "Large but individually valid section.",
          items: Array.from({ length: 9 }, (_, position) =>
            item({
              key: `item-${position}`,
              position,
              summary: "x".repeat(4000),
              source:
                sectionType === "work_completed" && position === 0
                  ? actionSource
                  : null,
            }),
          ),
        },
      }),
    );
    expect(() =>
      createGrowthReportSchema.parse({ ...report, sections: largeSections }),
    ).toThrow("Report section content exceeds 256 KiB in total");
  });

  it("encodes and decodes only bounded canonical JSON", () => {
    const content = growthReportSectionContentSchema.parse({
      summary: "Canonical content.",
      items: [item()],
    });
    const encoded = encodeGrowthReportSectionContent(content);
    expect(decodeGrowthReportSectionContent(encoded)).toEqual(content);
    expect(() => decodeGrowthReportSectionContent("not-json")).toThrow(
      "not valid JSON",
    );
    expect(() =>
      decodeGrowthReportSectionContent(
        JSON.stringify({ ...content, extra: 1 }),
      ),
    ).toThrow();
    expect(() =>
      decodeGrowthReportSectionContent(JSON.stringify(content, null, 2)),
    ).toThrow("not canonical JSON");
  });

  it("exposes the canonical section helper independently", () => {
    expect(
      canonicalizeGrowthReportSections(sections().toReversed()).map(
        ({ sectionType }) => sectionType,
      ),
    ).toEqual(GROWTH_REPORT_SECTION_TYPES);
  });
});
