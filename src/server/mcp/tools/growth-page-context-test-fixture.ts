import type { GrowthPageContextDto } from "@/types/schemas/growth-page-context";

/** A minimal strict DTO shared by MCP registration, handler and SAM tests. */
export function makeGrowthPageContextFixture(): GrowthPageContextDto {
  return {
    asOf: "2026-09-01T12:00:00.000Z",
    consistency: "current_not_snapshot",
    page: {
      displayUrl: {
        value: "https://example.com/pricing",
        queryOrFragmentOmitted: true,
        withheld: false,
      },
      identityScopes: [
        "key_page_exact",
        "growth_workflow_host_path",
        "gsc_parsed_requested_url",
        "rank_common_host_path_variants",
      ],
    },
    curation: {
      state: "curated",
      matchScope: "key_page_exact",
      role: "money",
      commercialWeight: 5,
      protected: true,
      activelyOptimized: true,
      topic: {
        value: "Pricing",
        redacted: false,
        truncated: false,
      },
      notes: null,
      updatedAt: "2026-08-31T09:00:00.000Z",
    },
    searchPerformance: {
      state: "available",
      source: "live_gsc_final",
      matchScope: "gsc_parsed_requested_url",
      calendar: "America/Los_Angeles",
      searchType: "web",
      dataState: "final",
      startDate: "2026-08-02",
      endDate: "2026-08-29",
      aggregate: {
        state: "reported",
        clicks: 12,
        impressions: 120,
        ctr: 0.1,
        position: 4.5,
      },
      queries: {
        items: [
          {
            query: {
              value: "agency pricing",
              redacted: false,
              truncated: false,
            },
            clicks: 4,
            impressions: 40,
            ctr: 0.1,
            position: 3,
          },
        ],
        hasMore: false,
      },
    },
    recommendations: {
      matchScope: "growth_workflow_host_path",
      stateScope: "current_not_historical",
      items: [
        {
          id: "recommendation_1",
          status: "proposed",
          title: {
            value: "Clarify the pricing offer",
            redacted: false,
            truncated: false,
          },
          priorityScore: 42,
          createdAt: "2026-08-30T09:00:00.000Z",
        },
      ],
      hasMore: false,
    },
    actions: {
      matchScope: "growth_workflow_host_path",
      stateScope: "current_not_historical",
      items: [
        {
          id: "action_1",
          status: "measuring",
          title: {
            value: "Publish pricing improvements",
            redacted: false,
            truncated: false,
          },
          priorityScore: 40,
          dueAt: "2026-09-10T09:00:00.000Z",
          updatedAt: "2026-09-01T10:00:00.000Z",
        },
      ],
      hasMore: false,
    },
    changes: {
      matchScope: "growth_workflow_host_path",
      stateScope: "current_not_historical",
      items: [
        {
          id: "change_1",
          source: "manual",
          changeType: "content_updated",
          description: {
            value: "Reworked the pricing hierarchy",
            redacted: false,
            truncated: false,
          },
          happenedAt: "2026-08-28T09:00:00.000Z",
        },
      ],
      hasMore: false,
    },
    measurements: {
      matchScope: "growth_workflow_host_path",
      stateScope: "current_not_historical",
      items: [
        {
          id: "plan_1",
          actionId: "action_1",
          reportTimezone: "Europe/London",
          measurementEnd: "2026-09-28",
          longMeasurementEnd: "2026-10-25",
          actionIntegrity: "consistent",
        },
      ],
      hasMore: false,
    },
    ranks: {
      source: "saved_rank_snapshots",
      matchScope: "rank_common_host_path_variants",
      items: [
        {
          keyword: {
            value: "agency pricing",
            redacted: false,
            truncated: false,
          },
          device: "desktop",
          position: 3,
          checkedAt: "2026-08-31T08:00:00.000Z",
        },
      ],
      hasMore: false,
    },
  };
}
