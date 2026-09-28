import { beforeEach, describe, expect, it, vi } from "vitest";
import { GscNotConnectedError } from "@/server/lib/gscErrors";

const mocks = vi.hoisted(() => ({
  getPerformance: vi.fn(),
  listWorkstreams: vi.fn(),
  listPlanActions: vi.fn(),
  listActionTargets: vi.fn(),
  listSavedKeywordVolumes: vi.fn(),
  projectDomain: vi.fn(),
  getConfigsForProject: vi.fn(),
  getLatestResults: vi.fn(),
  captureServerError: vi.fn(),
}));

// Imported transitively by GrowthPageContextService, whose pure Search Console
// window helper this service reuses.
vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
vi.mock("@/server/features/gsc/services/GscService", () => ({
  GscService: { getPerformance: mocks.getPerformance },
}));
vi.mock("../repositories/GrowthPlanRepository", () => ({
  GrowthPlanRepository: {
    listWorkstreams: mocks.listWorkstreams,
    listPlanActions: mocks.listPlanActions,
    listActionTargets: mocks.listActionTargets,
    listSavedKeywordVolumes: mocks.listSavedKeywordVolumes,
    projectDomain: mocks.projectDomain,
  },
}));
vi.mock(
  "@/server/features/rank-tracking/repositories/RankTrackingRepository",
  () => ({
    RankTrackingRepository: {
      getConfigsForProject: mocks.getConfigsForProject,
    },
  }),
);
vi.mock("@/server/features/rank-tracking/services/rankTrackingResults", () => ({
  getLatestResults: mocks.getLatestResults,
}));
vi.mock("@/server/lib/posthog", () => ({
  captureServerError: mocks.captureServerError,
}));

import { GrowthPlanEvidenceService } from "./GrowthPlanEvidenceService";

// Pacific date 2026-03-19, so Search Console's final-data date is 2026-03-16 and
// the newest complete month is 2026-02.
const now = new Date("2026-03-20T00:00:00.000Z");
const TEAMS = "https://example.com/teams";
const PRICING = "https://example.com/pricing";
const DOCS = "https://example.com/docs";

const gscRow = (date: string, clicks: number, impressions: number) => ({
  keys: [date],
  clicks,
  impressions,
});
const device = (position: number | null) => ({
  position,
  previousPosition: null,
  rankingUrl: null,
  serpFeatures: [],
});
const trackedRow = (keyword: string, position: number | null) => ({
  trackingKeywordId: `${keyword}-id`,
  keyword,
  searchVolume: null,
  keywordDifficulty: null,
  cpc: null,
  desktop: device(position),
  mobile: device(position === null ? null : position + 3),
});
const config = (id: string, domain: string, devices = "both") => ({
  id,
  domain,
  devices,
  locationCode: 2840,
  locationName: "United States",
});
const target = (actionId: string, targetType: string, targetValue: string) => ({
  actionId,
  targetType,
  targetValue,
});
const evidence = () =>
  GrowthPlanEvidenceService.getPlanEvidence(
    { projectId: "project_1" },
    { now },
  );

beforeEach(() => {
  mocks.projectDomain.mockResolvedValue("example.com");
  mocks.listWorkstreams.mockResolvedValue([{ id: "ws_1" }, { id: "ws_2" }]);
  mocks.listPlanActions.mockResolvedValue([
    { id: "action_1", workstreamId: "ws_1" },
    { id: "action_2", workstreamId: "ws_2" },
  ]);
  mocks.listActionTargets.mockResolvedValue([
    target("action_1", "url", TEAMS),
    target("action_1", "keyword", "Teams Comparison"),
    target("action_1", "site", "example.com"),
    target("action_2", "url", PRICING),
  ]);
  mocks.listSavedKeywordVolumes.mockResolvedValue([]);
  mocks.getConfigsForProject.mockResolvedValue([]);
  mocks.captureServerError.mockResolvedValue(undefined);
  mocks.getPerformance.mockResolvedValue({
    siteUrl: "sc-domain:example.com",
    rows: [],
  });
});

describe("GrowthPlanEvidenceService page series", () => {
  it("aggregates daily rows into complete months and drops the partial one", async () => {
    mocks.listActionTargets.mockResolvedValue([
      target("action_1", "url", TEAMS),
    ]);
    mocks.getPerformance.mockResolvedValue({
      siteUrl: "sc-domain:example.com",
      rows: [
        gscRow("2026-01-04", 3, 30),
        gscRow("2026-01-19", 4, 40),
        gscRow("2026-02-02", 10, 100),
        // Inside the requested window but in the incomplete current month.
        gscRow("2026-03-02", 99, 990),
      ],
    });

    const { plan } = await evidence();

    expect(mocks.getPerformance).toHaveBeenCalledTimes(1);
    expect(plan.pages.state).toBe("available");
    expect(plan.pages.window).toEqual({
      start: "2024-11-01",
      end: "2026-03-16",
    });
    expect(plan.pages.months).toHaveLength(16);
    expect(plan.pages.months.at(0)?.month).toBe("2024-11");
    expect(plan.pages.months.at(-1)).toEqual({
      month: "2026-02",
      clicks: 10,
      impressions: 100,
    });
    expect(plan.pages.months.some((month) => month.month === "2026-03")).toBe(
      false,
    );
  });

  it("reads each distinct URL once, isolates a failure, and slices per workstream", async () => {
    // Eleven distinct URLs, so the last one falls outside the ten-URL cap.
    const fillers = Array.from(
      { length: 8 },
      (_, index) => `https://example.com/f${index}`,
    );
    mocks.listWorkstreams.mockResolvedValue([
      { id: "ws_1" },
      { id: "ws_2" },
      { id: "ws_3" },
    ]);
    mocks.listPlanActions.mockResolvedValue([
      { id: "action_1", workstreamId: "ws_1" },
      { id: "action_2", workstreamId: "ws_2" },
      { id: "action_3", workstreamId: "ws_3" },
    ]);
    mocks.listActionTargets.mockResolvedValue([
      target("action_1", "url", TEAMS),
      target("action_1", "url", PRICING),
      ...fillers.map((url) => target("action_1", "url", url)),
      target("action_2", "url", DOCS),
      // A repeat of a URL another action already targets must not be re-read.
      target("action_2", "url", TEAMS),
      target("action_3", "url", DOCS),
    ]);
    mocks.getPerformance.mockImplementation(
      ({ filters }: { filters: { expression: string }[] }) => {
        const url = filters[0]?.expression;
        if (url === PRICING) return Promise.reject(new Error("gsc exploded"));
        return Promise.resolve({
          siteUrl: "sc-domain:example.com",
          rows: url === TEAMS ? [gscRow("2026-02-02", 10, 100)] : [],
        });
      },
    );

    const { plan, workstreams } = await evidence();

    expect(mocks.getPerformance).toHaveBeenCalledTimes(10);
    expect(plan.pages).toMatchObject({
      state: "available",
      totalUrls: 11,
      failedUrls: 1,
    });
    expect(plan.pages.urls).toHaveLength(10);
    // Only the URL that came back is summed.
    expect(plan.pages.months.at(-1)).toEqual({
      month: "2026-02",
      clicks: 10,
      impressions: 100,
    });
    expect(workstreams.at(0)?.workstreamId).toBe("ws_1");
    expect(workstreams.at(0)?.pages).toMatchObject({
      state: "available",
      totalUrls: 10,
      failedUrls: 1,
    });
    expect(workstreams.at(0)?.pages.months.at(-1)?.clicks).toBe(10);
    // Partially capped: DOCS never made the cap, TEAMS did.
    expect(workstreams.at(1)?.pages).toMatchObject({
      state: "available",
      urls: [TEAMS],
      totalUrls: 2,
      failedUrls: 0,
    });
    // Fully capped: nothing this slice targets was read.
    expect(workstreams.at(2)?.pages).toMatchObject({
      state: "capped",
      urls: [DOCS],
      totalUrls: 1,
      failedUrls: 0,
      months: [],
    });
  });

  it("reports not_connected without losing the keyword series", async () => {
    mocks.getPerformance.mockRejectedValue(
      new GscNotConnectedError("project_1"),
    );
    mocks.listSavedKeywordVolumes.mockResolvedValue([
      {
        keyword: "teams comparison",
        searchVolume: 880,
        fetchedAt: "2026-03-01",
      },
    ]);

    const { plan } = await evidence();

    expect(plan.pages).toMatchObject({ state: "not_connected", months: [] });
    expect(mocks.captureServerError).not.toHaveBeenCalled();
    expect(plan.keywords.items).toEqual([
      { keyword: "teams comparison", searchVolume: 880, positions: [] },
    ]);
    expect(plan.keywords.totalKeywords).toBe(1);
  });
});

describe("GrowthPlanEvidenceService keyword positions", () => {
  it("labels the project's own configs and omits domains that skip the keyword", async () => {
    mocks.getConfigsForProject.mockResolvedValue([
      config("config_project", "example.com"),
      config("config_rival", "www.rival.com", "mobile"),
      config("config_other", "other.com"),
    ]);
    mocks.getLatestResults.mockImplementation((configId: string) =>
      Promise.resolve({
        rows:
          configId === "config_other"
            ? [trackedRow("something else", 5)]
            : [
                trackedRow(
                  "teams comparison",
                  configId === "config_rival" ? 2 : 7,
                ),
              ],
        run: {
          id: "run",
          lastCheckedAt: "2026-03-10",
          status: "completed",
          errorMessage: null,
        },
      }),
    );

    const { plan } = await evidence();

    expect(plan.keywords.rankTracked).toBe(true);
    expect(plan.keywords.items.at(0)?.positions).toEqual(
      expect.arrayContaining([
        {
          configId: "config_project",
          domain: "example.com",
          locationCode: 2840,
          locationName: "United States",
          device: "desktop",
          isProject: true,
          position: 7,
          checkedAt: "2026-03-10",
        },
        {
          configId: "config_rival",
          domain: "www.rival.com",
          locationCode: 2840,
          locationName: "United States",
          device: "mobile",
          isProject: false,
          position: 5,
          checkedAt: "2026-03-10",
        },
      ]),
    );
    expect(plan.keywords.items.at(0)?.positions).toHaveLength(2);
  });
});
