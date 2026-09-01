import { describe, expect, it } from "vitest";
import { growthPageContextDtoSchema } from "./growth-page-context";

const base = {
  asOf: "2026-09-01T00:00:00.000Z",
  consistency: "current_not_snapshot",
  page: {
    displayUrl: {
      value: "https://example.com/page",
      queryOrFragmentOmitted: false,
      withheld: false,
    },
    identityScopes: [
      "key_page_exact",
      "growth_workflow_host_path",
      "gsc_parsed_requested_url",
      "rank_common_host_path_variants",
    ],
  },
  curation: { state: "not_curated", matchScope: "key_page_exact" },
  searchPerformance: {
    state: "unavailable",
    source: "live_gsc_final",
    matchScope: "gsc_parsed_requested_url",
    calendar: "America/Los_Angeles",
    searchType: "web",
    dataState: "final",
    startDate: "2026-08-02",
    endDate: "2026-08-29",
  },
  recommendations: {
    matchScope: "growth_workflow_host_path",
    stateScope: "current_not_historical",
    items: [],
    hasMore: false,
  },
  actions: {
    matchScope: "growth_workflow_host_path",
    stateScope: "current_not_historical",
    items: [],
    hasMore: false,
  },
  changes: {
    matchScope: "growth_workflow_host_path",
    stateScope: "current_not_historical",
    items: [],
    hasMore: false,
  },
  measurements: {
    matchScope: "growth_workflow_host_path",
    stateScope: "current_not_historical",
    items: [],
    hasMore: false,
  },
  ranks: {
    source: "saved_rank_snapshots",
    matchScope: "rank_common_host_path_variants",
    items: [],
    hasMore: false,
  },
} as const;

describe("growthPageContextDtoSchema", () => {
  it("accepts bounded unavailable context", () =>
    expect(growthPageContextDtoSchema.parse(base)).toMatchObject(base));
  it("rejects invalid GSC metric ranges", () =>
    expect(() =>
      growthPageContextDtoSchema.parse({
        ...base,
        searchPerformance: {
          state: "available",
          source: "live_gsc_final",
          matchScope: "gsc_parsed_requested_url",
          calendar: "America/Los_Angeles",
          searchType: "web",
          dataState: "final",
          startDate: "2026-08-01",
          endDate: "2026-08-28",
          aggregate: {
            state: "reported",
            clicks: -1,
            impressions: 0,
            ctr: 0,
            position: 0,
          },
          queries: { items: [], hasMore: false },
        },
      }),
    ).toThrow());

  it("rejects unknown provider, account and request fields", () => {
    expect(
      growthPageContextDtoSchema.safeParse({
        ...base,
        searchPerformance: {
          ...base.searchPerformance,
          siteUrl: "sc-domain:private.example",
          connectedBy: "owner@example.test",
          request: { filters: ["private"] },
        },
      }).success,
    ).toBe(false);
    expect(
      growthPageContextDtoSchema.safeParse({
        ...base,
        organizationId: "private_org",
      }).success,
    ).toBe(false);
  });

  it("rejects altered or duplicate identity scope declarations", () => {
    expect(
      growthPageContextDtoSchema.safeParse({
        ...base,
        page: {
          ...base.page,
          identityScopes: [
            "key_page_exact",
            "growth_workflow_host_path",
            "gsc_parsed_requested_url",
            "gsc_parsed_requested_url",
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("enforces five-row saved and ten-row provider collection caps", () => {
    const recommendation = {
      id: "recommendation_1",
      status: "proposed",
      title: { value: "Safe title", redacted: false, truncated: false },
      priorityScore: 10,
      createdAt: "2026-08-31T09:00:00.000Z",
    } as const;
    const rank = {
      keyword: { value: "safe query", redacted: false, truncated: false },
      device: "desktop",
      position: 1,
      checkedAt: "2026-08-31T09:00:00.000Z",
    } as const;

    expect(
      growthPageContextDtoSchema.safeParse({
        ...base,
        recommendations: {
          ...base.recommendations,
          items: Array.from({ length: 6 }, (_, index) => ({
            ...recommendation,
            id: `recommendation_${index}`,
          })),
          hasMore: false,
        },
      }).success,
    ).toBe(false);
    expect(
      growthPageContextDtoSchema.safeParse({
        ...base,
        ranks: {
          ...base.ranks,
          items: Array.from({ length: 11 }, () => rank),
          hasMore: false,
        },
      }).success,
    ).toBe(false);
  });
});
