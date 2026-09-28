/* eslint-disable max-lines -- one boundary suite keeps every public page-context branch auditable */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GscNotConnectedError } from "@/server/lib/gscErrors";

const mocks = vi.hoisted(() => ({
  keyPage:
    vi.fn<
      (
        projectId: string,
        url: string,
      ) => Promise<Record<string, unknown> | null>
    >(),
  recommendations:
    vi.fn<
      (
        projectId: string,
        url: string,
        asOf: string,
        limit: number,
      ) => Promise<Record<string, unknown>[]>
    >(),
  actions:
    vi.fn<
      (
        projectId: string,
        url: string,
        asOf: string,
        limit: number,
      ) => Promise<Record<string, unknown>[]>
    >(),
  changes:
    vi.fn<
      (
        projectId: string,
        url: string,
        asOf: string,
        limit: number,
      ) => Promise<Record<string, unknown>[]>
    >(),
  measurements:
    vi.fn<
      (
        projectId: string,
        url: string,
        asOf: string,
        limit: number,
      ) => Promise<Record<string, unknown>[]>
    >(),
  ranks:
    vi.fn<
      (
        projectId: string,
        asOf: string,
        candidateUrls: string[],
        limit: number,
      ) => Promise<Record<string, unknown>[]>
    >(),
  getPerformance:
    vi.fn<(input: { dimensions?: string[] }) => Promise<unknown>>(),
  isExpectedGrantFailure: vi.fn<(error: unknown) => boolean>(),
}));

vi.mock("../repositories/GrowthPageContextRepository", () => ({
  GrowthPageContextRepository: {
    keyPage: mocks.keyPage,
    recommendations: mocks.recommendations,
    actions: mocks.actions,
    changes: mocks.changes,
    measurements: mocks.measurements,
    ranks: mocks.ranks,
  },
}));

vi.mock("@/server/features/gsc/services/GscService", () => ({
  GscService: { getPerformance: mocks.getPerformance },
  isExpectedGrantFailure: mocks.isExpectedGrantFailure,
}));

import {
  GrowthPageContextService,
  resolvePageContextGscWindow,
} from "./GrowthPageContextService";

const project = { id: "project_1", domain: "example.com" };
const now = new Date("2026-09-01T12:00:00.000Z");
const asOf = now.toISOString();
const privateProperty = "sc-domain:private-property.example";
const privateAccount = "owner@example.test";
const gscContext = {
  source: "live_gsc_final",
  matchScope: "gsc_parsed_requested_url",
  calendar: "America/Los_Angeles",
  searchType: "web",
  dataState: "final",
  startDate: "2026-08-02",
  endDate: "2026-08-29",
} as const;

function performanceResult(
  rows: unknown,
  siteUrl = privateProperty,
  requestMarker = "private-request-marker",
) {
  return {
    siteUrl,
    connectedBy: privateAccount,
    request: { private: requestMarker },
    rows,
  };
}

function metrics(
  keys: unknown,
  overrides: Partial<{
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }> = {},
) {
  return {
    keys,
    clicks: 0,
    impressions: 0,
    ctr: 0,
    position: 0,
    ...overrides,
  };
}

function mockGscRows(aggregateRows: unknown, queryRows: unknown) {
  mocks.getPerformance.mockImplementation((input: { dimensions?: string[] }) =>
    Promise.resolve(
      performanceResult(
        input.dimensions?.length === 0 ? aggregateRows : queryRows,
      ),
    ),
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.keyPage.mockResolvedValue(null);
  mocks.recommendations.mockResolvedValue([]);
  mocks.actions.mockResolvedValue([]);
  mocks.changes.mockResolvedValue([]);
  mocks.measurements.mockResolvedValue([]);
  mocks.ranks.mockResolvedValue([]);
  mocks.isExpectedGrantFailure.mockReturnValue(false);
  mockGscRows([], []);
});

describe("resolvePageContextGscWindow", () => {
  it.each([
    ["normal date", "2026-09-01T12:00:00.000Z", "2026-08-02", "2026-08-29"],
    [
      "Pacific DST transition",
      "2026-03-08T10:30:00.000Z",
      "2026-02-06",
      "2026-03-05",
    ],
    [
      "UTC/Pacific date split",
      "2026-09-01T02:00:00.000Z",
      "2026-08-01",
      "2026-08-28",
    ],
  ])(
    "uses a 28-day inclusive Pacific window on a %s",
    (_, instant, start, end) => {
      const window = resolvePageContextGscWindow(new Date(instant));

      expect(window).toEqual({ startDate: start, endDate: end });
      expect(
        (Date.parse(`${end}T00:00:00.000Z`) -
          Date.parse(`${start}T00:00:00.000Z`)) /
          86_400_000 +
          1,
      ).toBe(28);
    },
  );
});

describe("GrowthPageContextService URL and identity boundary", () => {
  it("derives the four exact identities and two explicit final GSC requests", async () => {
    const raw =
      "http://www.Example.com/pricing/?utm_source=private#private-fragment";
    const context = await GrowthPageContextService.getPageContext(
      project,
      raw,
      {
        now,
      },
    );

    expect(mocks.keyPage).toHaveBeenCalledWith(
      project.id,
      "https://example.com/pricing/?utm_source=private",
    );
    for (const read of [
      mocks.recommendations,
      mocks.actions,
      mocks.changes,
      mocks.measurements,
    ]) {
      expect(read).toHaveBeenCalledWith(
        project.id,
        "https://example.com/pricing",
        asOf,
        6,
      );
    }

    expect(mocks.ranks).toHaveBeenCalledTimes(1);
    const rankCall = mocks.ranks.mock.calls[0];
    if (!rankCall) throw new Error("Expected a saved-rank read");
    const rankCandidates = rankCall[2];
    expect(new Set(rankCandidates)).toEqual(
      new Set([
        "http://example.com/pricing",
        "https://example.com/pricing",
        "http://example.com/pricing/",
        "https://example.com/pricing/",
        "http://www.example.com/pricing",
        "https://www.example.com/pricing",
        "http://www.example.com/pricing/",
        "https://www.example.com/pricing/",
      ]),
    );
    expect(rankCandidates).toHaveLength(8);
    expect(rankCandidates.every((candidate) => !/[?#@]/.test(candidate))).toBe(
      true,
    );
    expect(mocks.ranks).toHaveBeenCalledWith(
      project.id,
      asOf,
      rankCandidates,
      11,
    );

    expect(mocks.getPerformance).toHaveBeenCalledTimes(2);
    expect(mocks.getPerformance).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        projectId: project.id,
        startDate: "2026-08-02",
        endDate: "2026-08-29",
        dimensions: [],
        rowLimit: 1,
        type: "web",
        dataState: "final",
        filters: [
          {
            dimension: "page",
            operator: "equals",
            expression: "http://www.example.com/pricing/?utm_source=private",
          },
        ],
      }),
    );
    expect(mocks.getPerformance).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ dimensions: ["query"], rowLimit: 11 }),
    );
    expect(context.page).toEqual({
      displayUrl: {
        value: "http://www.example.com/pricing/",
        queryOrFragmentOmitted: true,
        withheld: false,
      },
      identityScopes: [
        "key_page_exact",
        "growth_workflow_host_path",
        "gsc_parsed_requested_url",
        "rank_common_host_path_variants",
      ],
    });
    expect(JSON.stringify(context)).not.toContain("utm_source=private");
    expect(JSON.stringify(context)).not.toContain("private-fragment");
  });

  it("keeps key-page query variants distinct while Growth work shares host/path", async () => {
    await GrowthPageContextService.getPageContext(
      project,
      "https://example.com/pricing?plan=starter",
      { now },
    );
    await GrowthPageContextService.getPageContext(
      project,
      "https://example.com/pricing?plan=agency",
      { now },
    );

    expect(mocks.keyPage.mock.calls.map((call) => call[1])).toEqual([
      "https://example.com/pricing?plan=starter",
      "https://example.com/pricing?plan=agency",
    ]);
    expect(mocks.recommendations.mock.calls.map((call) => call[1])).toEqual([
      "https://example.com/pricing",
      "https://example.com/pricing",
    ]);
  });

  it("allows a true subdomain while keeping the subdomain in provider identity", async () => {
    await GrowthPageContextService.getPageContext(
      project,
      "https://docs.example.com/guide#contents",
      { now },
    );

    expect(mocks.recommendations).toHaveBeenCalledWith(
      project.id,
      "https://docs.example.com/guide",
      asOf,
      6,
    );
    expect(mocks.getPerformance).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: [
          {
            dimension: "page",
            operator: "equals",
            expression: "https://docs.example.com/guide",
          },
        ],
      }),
    );
  });

  it("uses only four deduplicated common variants for a root page", async () => {
    await GrowthPageContextService.getPageContext(
      project,
      "http://www.example.com/?query=distinct#fragment",
      { now },
    );

    const rankCall = mocks.ranks.mock.calls[0];
    if (!rankCall) throw new Error("Expected a saved-rank read");
    expect(new Set(rankCall[2])).toEqual(
      new Set([
        "http://example.com/",
        "https://example.com/",
        "http://www.example.com/",
        "https://www.example.com/",
      ]),
    );
    expect(rankCall[2]).toHaveLength(4);
  });

  it.each([
    ["a null domain", null, "https://example.com/page"],
    ["an invalid domain", "not a domain", "https://example.com/page"],
    ["an invalid URL", "example.com", "not a URL"],
    ["a non-HTTP URL", "example.com", "ftp://example.com/page"],
    [
      "embedded credentials",
      "example.com",
      "https://user:password@example.com/page",
    ],
    [
      "a credential-bearing project domain",
      "https://user:password@example.com",
      "https://example.com/page",
    ],
    ["an off-domain URL", "example.com", "https://example.net/page"],
    ["a sibling suffix domain", "example.com", "https://notexample.com/page"],
    [
      "credential material in a query",
      "example.com",
      "https://example.com/page?api_key=secretvalue123",
    ],
    [
      "percent-encoded credential material",
      "example.com",
      "https://example.com/page?auth=Bearer%20eyJabcdefghijk.abc.def",
    ],
    [
      "credential material in a fragment",
      "example.com",
      "https://example.com/page#api_key=secretvalue123",
    ],
  ])("rejects %s before every saved or GSC read", async (_, domain, url) => {
    await expect(
      GrowthPageContextService.getPageContext({ id: project.id, domain }, url, {
        now,
      }),
    ).rejects.toBeDefined();

    for (const read of [
      mocks.keyPage,
      mocks.recommendations,
      mocks.actions,
      mocks.changes,
      mocks.measurements,
      mocks.ranks,
      mocks.getPerformance,
    ]) {
      expect(read).not.toHaveBeenCalled();
    }
  });
});

describe("GrowthPageContextService bounded saved projection", () => {
  it("projects curation and every limit-plus-one collection safely", async () => {
    mocks.keyPage.mockResolvedValue({
      role: "money",
      commercialWeight: 5,
      protected: true,
      activelyOptimized: true,
      topic: "api_key=secretvalue123",
      notes: `Contact owner@example.test ${"n".repeat(600)}`,
      updatedAt: "2026-08-31T09:00:00.000Z",
    });
    mocks.recommendations.mockResolvedValue(
      Array.from({ length: 6 }, (_, index) => ({
        id: `recommendation_${index}`,
        status: "proposed",
        title:
          index === 0
            ? "Ask owner@example.test about https://example.com/private?x=1"
            : `Recommendation ${index}`,
        priorityScore: 100 - index,
        createdAt: `2026-08-${String(20 + index).padStart(2, "0")}T09:00:00.000Z`,
      })),
    );
    mocks.actions.mockResolvedValue(
      Array.from({ length: 6 }, (_, index) => ({
        id: `action_${index}`,
        status: index === 0 ? "blocked" : "ready",
        title: `Action ${index}`,
        priorityScore: 100 - index,
        dueAt: "2026-09-20T09:00:00.000Z",
        updatedAt:
          index === 0 ? "2026-09-02T09:00:00.000Z" : "2026-08-31T09:00:00.000Z",
      })),
    );
    mocks.changes.mockResolvedValue(
      Array.from({ length: 6 }, (_, index) => ({
        id: `change_${index}`,
        source: "manual",
        changeType: "content_updated",
        description:
          index === 0
            ? "Contact owner@example.test; edited https://example.com/page?private=1"
            : `Change ${index}`,
        happenedAt: `2026-08-${String(20 + index).padStart(2, "0")}T10:00:00.000Z`,
      })),
    );
    mocks.measurements.mockResolvedValue(
      Array.from({ length: 6 }, (_, index) => ({
        id: `plan_${index}`,
        actionId: `action_${index}`,
        actionVersion: 3,
        reportTimezone: "Europe/London",
        measurementEnd: "2026-09-28",
        longMeasurementEnd: null,
        actionStatus: index === 1 ? null : index === 2 ? "ready" : "measuring",
        actionStateVersion: index === 3 ? 2 : 3,
      })),
    );
    mocks.ranks.mockResolvedValue(
      Array.from({ length: 11 }, (_, index) => ({
        trackingKeywordId: `keyword_${index}`,
        snapshotId: index + 1,
        keyword:
          index === 0
            ? "owner@example.test pricing"
            : `Tracked keyword ${index}`,
        device: index % 2 === 0 ? "desktop" : "mobile",
        position: index === 1 ? null : index + 1,
        checkedAt: "2026-08-31T08:00:00.000Z",
      })),
    );

    const context = await GrowthPageContextService.getPageContext(
      project,
      "https://example.com/pricing?private=1#private",
      { now },
    );

    expect(context.curation).toMatchObject({
      state: "curated",
      protected: true,
      topic: { redacted: true, truncated: false },
      notes: { redacted: true, truncated: true },
    });
    if (context.curation.state !== "curated")
      throw new Error("Expected curated context");
    expect(context.curation.topic?.value).not.toContain("secretvalue123");
    expect(context.curation.notes?.value).not.toContain("owner@example.test");

    for (const section of [
      context.recommendations,
      context.actions,
      context.changes,
      context.measurements,
    ]) {
      expect(section.items).toHaveLength(5);
      expect(section.hasMore).toBe(true);
    }
    expect(context.ranks.items).toHaveLength(10);
    expect(context.ranks.hasMore).toBe(true);
    expect(context.recommendations.items[0]?.title.value).not.toContain(
      "owner@example.test",
    );
    expect(context.recommendations.items[0]?.title.value).not.toContain("?x=1");
    expect(context.changes.items[0]?.description.value).not.toContain(
      "owner@example.test",
    );
    expect(context.changes.items[0]?.description.value).not.toContain(
      "?private=1",
    );
    expect(context.ranks.items[0]?.keyword.value).not.toContain(
      "owner@example.test",
    );

    // Mutable lifecycle remains a truthful current row even when updated after asOf.
    expect(context.actions.items[0]).toMatchObject({
      status: "blocked",
      updatedAt: "2026-09-02T09:00:00.000Z",
    });
    expect(
      context.measurements.items.map((item) => item.actionIntegrity),
    ).toEqual([
      "consistent",
      "action_missing",
      "action_state_mismatch",
      "action_version_mismatch",
      "consistent",
    ]);
    expect(JSON.stringify(context)).not.toContain("trackingKeywordId");
    expect(JSON.stringify(context)).not.toContain("snapshotId");
  });
});

describe("GrowthPageContextService live GSC boundary", () => {
  it("reports observed zero aggregate facts separately from no reported row", async () => {
    mockGscRows(
      [metrics([], { clicks: 0, impressions: 0, ctr: 0, position: 0 })],
      [],
    );
    const reported = await GrowthPageContextService.getPageContext(
      project,
      "https://example.com/page",
      { now },
    );
    expect(reported.searchPerformance).toMatchObject({
      state: "available",
      source: "live_gsc_final",
      aggregate: {
        state: "reported",
        clicks: 0,
        impressions: 0,
        ctr: 0,
        position: 0,
      },
    });

    mockGscRows([], []);
    const absent = await GrowthPageContextService.getPageContext(
      project,
      "https://example.com/page",
      { now },
    );
    expect(absent.searchPerformance).toMatchObject({
      state: "available",
      aggregate: { state: "not_reported" },
      queries: { items: [], hasMore: false },
    });
  });

  it("uses aggregate totals only and safely caps eleven query rows", async () => {
    mockGscRows(
      [metrics([], { clicks: 90, impressions: 900, ctr: 0.1, position: 4 })],
      Array.from({ length: 11 }, (_, index) =>
        metrics(
          [
            index === 0
              ? "owner@example.test https://example.com/secret?q=1"
              : `query ${index}`,
          ],
          {
            clicks: 100 + index,
            impressions: 200 + index,
            ctr: 0.5,
            position: index + 1,
          },
        ),
      ),
    );

    const context = await GrowthPageContextService.getPageContext(
      project,
      "https://example.com/page",
      { now },
    );
    expect(context.searchPerformance).toMatchObject({
      state: "available",
      aggregate: { state: "reported", clicks: 90, impressions: 900 },
      queries: { hasMore: true },
    });
    if (context.searchPerformance.state !== "available")
      throw new Error("Expected available GSC context");
    expect(context.searchPerformance.queries.items).toHaveLength(10);
    expect(context.searchPerformance.queries.items[0]?.query).toMatchObject({
      redacted: true,
      truncated: false,
    });
    expect(
      context.searchPerformance.queries.items[0]?.query.value,
    ).not.toContain("owner@example.test");
    expect(JSON.stringify(context)).not.toContain(privateProperty);
    expect(JSON.stringify(context)).not.toContain(privateAccount);
    expect(JSON.stringify(context)).not.toContain("private-request-marker");
  });

  it.each([
    [
      "missing aggregate with queries",
      [],
      [metrics(["query"])],
      privateProperty,
      privateProperty,
    ],
    [
      "more than one aggregate row",
      [metrics([]), metrics([])],
      [],
      privateProperty,
      privateProperty,
    ],
    [
      "negative aggregate scalar",
      [metrics([], { clicks: -1 })],
      [],
      privateProperty,
      privateProperty,
    ],
    [
      "malformed query key shape",
      [metrics([])],
      [metrics(["a", "b"])],
      privateProperty,
      privateProperty,
    ],
    [
      "more query rows than requested",
      [metrics([])],
      Array.from({ length: 12 }, (_, index) => metrics([`query ${index}`])),
      privateProperty,
      privateProperty,
    ],
    [
      "empty query key",
      [metrics([])],
      [metrics([""])],
      privateProperty,
      privateProperty,
    ],
    [
      "property drift",
      [metrics([])],
      [],
      "sc-domain:first.example",
      "sc-domain:second.example",
    ],
  ])(
    "suppresses all live output for %s",
    async (_, aggregateRows, queryRows, aggregateSite, querySite) => {
      mocks.getPerformance.mockImplementation(
        (input: { dimensions?: string[] }) =>
          Promise.resolve(
            performanceResult(
              input.dimensions?.length === 0 ? aggregateRows : queryRows,
              input.dimensions?.length === 0 ? aggregateSite : querySite,
            ),
          ),
      );

      const context = await GrowthPageContextService.getPageContext(
        project,
        "https://example.com/page",
        { now },
      );
      expect(context.searchPerformance).toEqual({
        state: "unavailable",
        ...gscContext,
      });
      expect(JSON.stringify(context)).not.toContain(aggregateSite);
      expect(JSON.stringify(context)).not.toContain(querySite);
    },
  );

  it.each(["", null, { private: "shape" }])(
    "suppresses malformed aggregate keys %#",
    async (keys) => {
      mockGscRows([metrics(keys)], []);

      const context = await GrowthPageContextService.getPageContext(
        project,
        "https://example.com/page",
        { now },
      );
      expect(context.searchPerformance).toEqual({
        state: "unavailable",
        ...gscContext,
      });
    },
  );

  it.each(["", { private: "rows-shape" }])(
    "suppresses malformed aggregate row collections %#",
    async (aggregateRows) => {
      mockGscRows(aggregateRows, []);

      const context = await GrowthPageContextService.getPageContext(
        project,
        "https://example.com/page",
        { now },
      );
      expect(context.searchPerformance).toEqual({
        state: "unavailable",
        ...gscContext,
      });
    },
  );

  it.each([null, false, ""])(
    "suppresses a falsy malformed aggregate row %#",
    async (aggregateRow) => {
      mockGscRows([aggregateRow], []);

      const context = await GrowthPageContextService.getPageContext(
        project,
        "https://example.com/page",
        { now },
      );
      expect(context.searchPerformance).toEqual({
        state: "unavailable",
        ...gscContext,
      });
    },
  );

  it("maps not-connected, expected grant and generic/partial failures without hiding saved context", async () => {
    mocks.recommendations.mockResolvedValue([
      {
        id: "recommendation_saved",
        status: "proposed",
        title: "Saved recommendation",
        priorityScore: 10,
        createdAt: "2026-08-30T09:00:00.000Z",
      },
    ]);

    const cases = [
      {
        error: new GscNotConnectedError(project.id),
        expected: "not_connected",
      },
      {
        error: new Error("private-grant-error"),
        expected: "reconnect_required",
      },
      { error: new Error("private-provider-error"), expected: "unavailable" },
    ] as const;

    for (const branch of cases) {
      mocks.isExpectedGrantFailure.mockImplementation(
        (error: unknown) =>
          branch.expected === "reconnect_required" && error === branch.error,
      );
      mocks.getPerformance.mockImplementation(
        (input: { dimensions?: string[] }) =>
          input.dimensions?.length === 0
            ? Promise.resolve(performanceResult([metrics([])]))
            : Promise.reject(branch.error),
      );

      const context = await GrowthPageContextService.getPageContext(
        project,
        "https://example.com/page",
        { now },
      );
      expect(context.searchPerformance).toEqual({
        state: branch.expected,
        ...gscContext,
      });
      expect(context.recommendations.items).toHaveLength(1);
      expect(JSON.stringify(context)).not.toContain(branch.error.message);
      expect(JSON.stringify(context)).not.toContain(privateProperty);
      expect(JSON.stringify(context)).not.toContain(privateAccount);
    }
  });

  it.each(["aggregate", "queries"])(
    "suppresses the full live section when the %s subrequest fails",
    async (failedRequest) => {
      const error = new Error(`private-${failedRequest}-failure`);
      mocks.getPerformance.mockImplementation(
        (input: { dimensions?: string[] }) => {
          const isAggregate = input.dimensions?.length === 0;
          if (
            (failedRequest === "aggregate" && isAggregate) ||
            (failedRequest === "queries" && !isAggregate)
          )
            return Promise.reject(error);
          return Promise.resolve(
            performanceResult(isAggregate ? [metrics([])] : []),
          );
        },
      );

      const context = await GrowthPageContextService.getPageContext(
        project,
        "https://example.com/page",
        { now },
      );
      expect(context.searchPerformance).toEqual({
        state: "unavailable",
        ...gscContext,
      });
      expect(JSON.stringify(context)).not.toContain(error.message);
    },
  );
});
