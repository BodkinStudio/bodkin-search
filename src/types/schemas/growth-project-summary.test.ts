import { describe, expect, it } from "vitest";
import { growthProjectSummaryDtoSchema } from "./growth-project-summary";

const dto = {
  asOf: "2026-09-01T12:00:00.000Z",
  consistency: "current_not_snapshot",
  project: {
    id: "project_1",
    name: { value: "Example", redacted: false, truncated: false },
    url: null,
    market: { locationCode: null, languageCode: null },
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  settings: {
    growthEnabled: false,
    reportTimezone: "UTC",
    reportCadence: "monthly",
    reportDay: 1,
    defaultBaselineDays: 28,
    defaultCooldownDays: 7,
    defaultPrimaryWindowDays: 28,
    defaultLongWindowDays: 55,
    persisted: false,
    updatedAt: null,
  },
  context: {
    scope: "typed_sections_with_other_context_counts_only",
    sections: [
      "business_overview",
      "current_goal",
      "positioning",
      "writing_preferences",
    ].map((key) => ({ key, content: null, updatedAt: null })),
    missingSections: [
      "business_overview",
      "current_goal",
      "positioning",
      "writing_preferences",
    ],
    typedSectionPresence: "none",
    customSectionCount: 0,
    competitorCount: 0,
    keyPageCount: 0,
    researchLog: { retainedCount: 0, retentionLimited: false },
  },
  freshness: {
    scope: "saved_growth_signals",
    latestSignalAt: null,
    byKind: [],
  },
  latestRun: null,
  unresolvedRecommendations: { items: [], hasMore: false },
  currentActions: { items: [], hasMore: false },
  recentSignals: { items: [], hasMore: false },
  dueMeasurements: { scanState: "complete", items: [], hasMore: false },
};

describe("growthProjectSummaryDtoSchema", () => {
  it("is strict at every public root and keeps compact collection bounds", () => {
    expect(growthProjectSummaryDtoSchema.parse(dto)).toMatchObject({
      asOf: dto.asOf,
    });
    expect(
      growthProjectSummaryDtoSchema.safeParse({ ...dto, secret: "no" }).success,
    ).toBe(false);
    expect(
      growthProjectSummaryDtoSchema.safeParse({
        ...dto,
        currentActions: {
          items: Array.from({ length: 6 }, () => ({})),
          hasMore: false,
        },
      }).success,
    ).toBe(false);

    const safeText = { value: "safe", redacted: false, truncated: false };
    expect(
      growthProjectSummaryDtoSchema.safeParse({
        ...dto,
        currentActions: {
          items: [
            {
              id: "action_1",
              title: safeText,
              category: safeText,
              priorityScore: 1,
              status: "evaluated",
              version: 1,
              dueAt: dto.asOf,
              updatedAt: dto.asOf,
            },
          ],
          hasMore: false,
        },
      }).success,
    ).toBe(false);
    expect(
      growthProjectSummaryDtoSchema.safeParse({
        ...dto,
        recentSignals: {
          items: [
            {
              id: "signal_1",
              signalType: safeText,
              entityType: safeText,
              metric: safeText,
              severity: "info",
              confidence: 1,
              periodStart: "2026-08-01",
              periodEnd: "2026-08-02",
              baselineValue: 1,
              currentValue: 1,
              deltaValue: 0,
              deltaPercent: 0,
              evidenceKind: "gsc_period",
              runStatus: "running",
              capturedAt: dto.asOf,
            },
          ],
          hasMore: false,
        },
      }).success,
    ).toBe(false);
  });
});
