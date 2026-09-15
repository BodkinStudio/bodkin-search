import type { GrowthProjectSummaryDto } from "@/types/schemas/growth-project-summary";

export function makeGrowthProjectSummaryFixture(): GrowthProjectSummaryDto {
  return {
    asOf: "2026-09-01T12:00:00.000Z",
    consistency: "current_not_snapshot",
    project: {
      id: "project_123",
      name: { value: "Example growth", redacted: false, truncated: false },
      url: {
        value: "https://example.com/",
        queryOrFragmentOmitted: false,
        withheld: false,
      },
      market: { locationCode: 2826, languageCode: "en" },
      createdAt: "2026-08-01T09:00:00.000Z",
    },
    settings: {
      growthEnabled: true,
      reportTimezone: "Europe/London",
      reportCadence: "monthly",
      reportDay: 1,
      defaultBaselineDays: 28,
      defaultCooldownDays: 7,
      defaultPrimaryWindowDays: 28,
      defaultLongWindowDays: 55,
      persisted: true,
      updatedAt: "2026-08-02T09:00:00.000Z",
    },
    context: {
      scope: "typed_sections_with_other_context_counts_only",
      sections: [
        {
          key: "business_overview",
          content: {
            value: "A specialist agency.",
            redacted: false,
            truncated: false,
          },
          updatedAt: "2026-08-02T09:00:00.000Z",
        },
        { key: "current_goal", content: null, updatedAt: null },
        { key: "positioning", content: null, updatedAt: null },
        { key: "writing_preferences", content: null, updatedAt: null },
      ],
      missingSections: ["current_goal", "positioning", "writing_preferences"],
      typedSectionPresence: "some",
      customSectionCount: 1,
      competitorCount: 2,
      keyPageCount: 3,
      researchLog: { retainedCount: 4, retentionLimited: false },
    },
    freshness: {
      scope: "saved_growth_signals",
      latestSignalAt: "2026-08-31T09:00:00.000Z",
      byKind: [
        {
          evidenceKind: "gsc_period",
          capturedAt: "2026-08-31T09:00:00.000Z",
        },
      ],
    },
    latestRun: {
      id: "run_1",
      runType: "weekly_review",
      trigger: "scheduled",
      status: "completed",
      periodStart: "2026-08-24",
      periodEnd: "2026-08-30",
      startedAt: "2026-08-31T08:00:00.000Z",
      completedAt: "2026-08-31T09:00:00.000Z",
    },
    unresolvedRecommendations: {
      items: [],
      hasMore: false,
    },
    currentActions: {
      items: [],
      hasMore: false,
    },
    recentSignals: {
      items: [],
      hasMore: false,
    },
    dueMeasurements: {
      scanState: "complete",
      items: [],
      hasMore: false,
    },
  };
}
