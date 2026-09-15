/* eslint-disable max-lines, max-lines-per-function -- the v1/v2 detector acceptance matrix stays auditable in one fixture */
import { describe, expect, it } from "vitest";
import {
  createGrowthSearchPerformanceFixture,
  GROWTH_SEARCH_PERFORMANCE_FIXTURE_WINDOWS,
} from "./GrowthSearchPerformanceFixture";
import { detectPriorityPageClickDeclines } from "./PriorityPageClickDeclineDetector";

function aliases(url: string) {
  const normalized = new URL(url);
  const hostname = normalized.hostname.replace(/^www\./, "");
  return ["http:", "https:"].flatMap((protocol) =>
    [hostname, `www.${hostname}`].map((host) => {
      const alias = new URL(normalized);
      alias.protocol = protocol;
      alias.hostname = host;
      return alias.toString();
    }),
  );
}

function withComparisonEvidence(
  pageValues: Record<
    string,
    {
      baseline: { reported: boolean; clicks: number; impressions?: number };
      current: { reported: boolean; clicks: number; impressions?: number };
    }
  >,
) {
  const fixture = createGrowthSearchPerformanceFixture();
  fixture.comparisonEvidence = {
    status: "complete",
    collectionMethod: "exact_page_alias_date_inventory_v2",
    baselineWindow: GROWTH_SEARCH_PERFORMANCE_FIXTURE_WINDOWS.baselineWindow,
    currentWindow: GROWTH_SEARCH_PERFORMANCE_FIXTURE_WINDOWS.currentWindow,
    pages: fixture.keyPages.map((page) => {
      const values = pageValues[page.id] ?? {
        baseline: { reported: false, clicks: 0 },
        current: { reported: false, clicks: 0 },
      };
      return {
        keyPageId: page.id,
        aliases: aliases(page.url),
        baseline: {
          ...values.baseline,
          impressions: values.baseline.impressions ?? 0,
        },
        current: {
          ...values.current,
          impressions: values.current.impressions ?? 0,
        },
      };
    }),
  };
  if (fixture.siteContext.status === "complete") {
    fixture.siteContext = {
      ...fixture.siteContext,
      coverage: "sparse_date_inventory_v2",
      observations: fixture.siteContext.observations.map((row) => ({
        ...row,
        clicks: 200,
      })),
    };
  }
  return fixture;
}

const input = () => ({
  projectId: "project_fixture",
  runId: "run_fixture",
  snapshot: createGrowthSearchPerformanceFixture(),
  ...GROWTH_SEARCH_PERFORMANCE_FIXTURE_WINDOWS,
});

describe("detectPriorityPageClickDeclines", () => {
  it("is deterministic and preserves missing observations as suppression", async () => {
    const first = await detectPriorityPageClickDeclines(input());
    const second = await detectPriorityPageClickDeclines({
      ...input(),
      snapshot: {
        ...input().snapshot,
        observations: input().snapshot.observations.toReversed(),
      },
    });
    expect(second).toEqual(first);
    expect(first).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          keyPageId: "key_pricing",
          status: "signal",
          priority: 504,
        }),
        expect.objectContaining({
          keyPageId: "key_incomplete",
          suppressionReason: "missing_observation",
        }),
        expect.objectContaining({
          keyPageId: "key_low",
          suppressionReason: "low_baseline",
        }),
        expect.objectContaining({
          keyPageId: "key_new",
          suppressionReason: "zero_baseline",
        }),
        expect.objectContaining({
          keyPageId: "key_stable",
          suppressionReason: "not_material",
        }),
      ]),
    );
    const signal = first.find(
      (outcome) => outcome.keyPageId === "key_pricing",
    )?.signal;
    expect(signal).toMatchObject({
      signalType: "priority_page_click_decline",
      entityType: "key_page",
      entityRef: "key_pricing",
      metric: "gsc_clicks",
      baselineValue: 308,
      currentValue: 140,
      deltaValue: -168,
    });
    expect(signal?.deltaPercent).toBeCloseTo(-(168 / 308) * 100);
  });

  it("suppresses pages when collection reached the configured cap", async () => {
    const result = await detectPriorityPageClickDeclines({
      ...input(),
      snapshot: { ...input().snapshot, retrievalStatus: "capped" },
    });
    expect(
      result.every(
        (outcome) => outcome.suppressionReason === "retrieval_capped",
      ),
    ).toBe(true);
  });

  it("breaks equal-priority ties by code units for distinct Unicode page IDs", async () => {
    const fixture = createGrowthSearchPerformanceFixture();
    const pricing = fixture.keyPages.find((page) => page.id === "key_pricing")!;
    fixture.keyPages = [
      { ...pricing, id: "key_\u00e9" },
      { ...pricing, id: "key_e\u0301", url: "https://example.test/tie" },
    ];
    fixture.observations = fixture.observations.filter((row) =>
      row.rawUrl.endsWith("/pricing"),
    );
    fixture.observations.push(
      ...fixture.observations.map((row) => ({
        ...row,
        rawUrl: row.rawUrl.replace("/pricing", "/tie"),
      })),
    );

    const first = await detectPriorityPageClickDeclines({
      ...input(),
      snapshot: fixture,
    });
    const reordered = await detectPriorityPageClickDeclines({
      ...input(),
      snapshot: { ...fixture, keyPages: fixture.keyPages.toReversed() },
    });

    expect(first.map((outcome) => outcome.keyPageId)).toEqual([
      "key_e\u0301",
      "key_\u00e9",
    ]);
    expect(first.every((outcome) => outcome.status === "signal")).toBe(true);
    expect(reordered).toEqual(first);
  });

  it("suppresses equivalent declines only when complete site context supports it", async () => {
    const fixture = createGrowthSearchPerformanceFixture();
    fixture.siteContext = {
      status: "complete",
      observations:
        fixture.siteContext.status === "complete"
          ? fixture.siteContext.observations.map((row) => ({
              ...row,
              clicks: row.date >= "2026-07-02" ? 100 : 200,
            }))
          : [],
    };
    const result = await detectPriorityPageClickDeclines({
      ...input(),
      snapshot: fixture,
    });
    expect(
      result.find((outcome) => outcome.keyPageId === "key_pricing"),
    ).toMatchObject({ suppressionReason: "site_wide_decline" });
  });

  it("treats incomplete claimed site context as suppression, never as zero", async () => {
    const fixture = createGrowthSearchPerformanceFixture();
    if (fixture.siteContext.status !== "complete")
      throw new Error("fixture bug");
    fixture.siteContext.observations = fixture.siteContext.observations.filter(
      (row) => row.date !== "2026-07-12",
    );
    const result = await detectPriorityPageClickDeclines({
      ...input(),
      snapshot: fixture,
    });
    expect(
      result.every(
        (outcome) => outcome.suppressionReason === "site_context_incomplete",
      ),
    ).toBe(true);
  });

  it("uses the corrected exact-count low-volume boundary with complete period evidence", async () => {
    const fixture = createGrowthSearchPerformanceFixture();
    fixture.keyPages = fixture.keyPages.slice(0, 5);
    if (fixture.siteContext.status === "complete")
      fixture.siteContext.observations = fixture.siteContext.observations.map(
        (row) => ({ ...row, clicks: 200 }),
      );
    fixture.comparisonEvidence = {
      status: "complete",
      collectionMethod: "exact_page_alias_date_inventory_v2",
      baselineWindow: GROWTH_SEARCH_PERFORMANCE_FIXTURE_WINDOWS.baselineWindow,
      currentWindow: GROWTH_SEARCH_PERFORMANCE_FIXTURE_WINDOWS.currentWindow,
      pages: fixture.keyPages.map((page) => ({
        keyPageId: page.id,
        aliases: ["http:", "https:"].flatMap((protocol) =>
          ["example.test", "www.example.test"].map((host) => {
            const alias = new URL(page.url);
            alias.protocol = protocol;
            alias.hostname = host;
            return alias.toString();
          }),
        ),
        baseline: {
          reported: page.id === "key_low",
          clicks: page.id === "key_low" ? 20 : 0,
          impressions: 0,
        },
        current: {
          reported: page.id === "key_low",
          clicks: page.id === "key_low" ? 7 : 0,
          impressions: 0,
        },
      })),
    };
    const qualifying = await detectPriorityPageClickDeclines({
      ...input(),
      snapshot: fixture,
      thresholds: {
        minimumBaselineClicks: 100,
        minimumLostClicks: 20,
        minimumDeclinePercent: 0.3,
        criticalLostClicks: 1,
        criticalDeclinePercent: 0.01,
        siteSuppressionMarginPercent: 0.1,
      },
    });
    expect(
      qualifying.find((outcome) => outcome.keyPageId === "key_low"),
    ).toMatchObject({ status: "signal", signal: { severity: "warning" } });

    fixture.comparisonEvidence.pages.find(
      (page) => page.keyPageId === "key_low",
    )!.current.clicks = 8;
    const insufficient = await detectPriorityPageClickDeclines({
      ...input(),
      snapshot: fixture,
    });
    expect(
      insufficient.find((outcome) => outcome.keyPageId === "key_low"),
    ).toMatchObject({ suppressionReason: "low_baseline" });
  });

  it("uses the family-wise exact-count cutoff for one and five configured pages", async () => {
    const single = withComparisonEvidence({
      key_pricing: {
        baseline: { reported: true, clicks: 10 },
        current: { reported: true, clicks: 3 },
      },
    });
    single.keyPages = single.keyPages.filter(
      (page) => page.id === "key_pricing",
    );
    single.comparisonEvidence!.pages = single.comparisonEvidence!.pages.filter(
      (page) => page.keyPageId === "key_pricing",
    );
    await expect(
      detectPriorityPageClickDeclines({ ...input(), snapshot: single }),
    ).resolves.toEqual([
      expect.objectContaining({ keyPageId: "key_pricing", status: "signal" }),
    ]);

    const five = withComparisonEvidence({
      key_pricing: {
        baseline: { reported: true, clicks: 10 },
        current: { reported: true, clicks: 3 },
      },
    });
    five.keyPages = [
      five.keyPages.find((page) => page.id === "key_pricing")!,
      ...five.keyPages.filter((page) => page.id !== "key_pricing").slice(0, 4),
    ];
    five.comparisonEvidence!.pages = five.keyPages.map((page) =>
      page.id === "key_pricing"
        ? {
            ...five.comparisonEvidence!.pages.find(
              (fact) => fact.keyPageId === "key_pricing",
            )!,
          }
        : {
            keyPageId: page.id,
            aliases: aliases(page.url),
            baseline: { reported: false, clicks: 0, impressions: 0 },
            current: { reported: false, clicks: 0, impressions: 0 },
          },
    );
    await expect(
      detectPriorityPageClickDeclines({ ...input(), snapshot: five }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          keyPageId: "key_pricing",
          suppressionReason: "low_baseline",
        }),
      ]),
    );
  });

  it("does not underflow a nearly equal low-volume pair above the binomial seed limit", async () => {
    const fixture = withComparisonEvidence({
      key_pricing: {
        baseline: { reported: true, clicks: 600 },
        current: { reported: true, clicks: 550 },
      },
    });
    fixture.keyPages = fixture.keyPages.filter(
      (page) => page.id === "key_pricing",
    );
    fixture.comparisonEvidence!.pages =
      fixture.comparisonEvidence!.pages.filter(
        (page) => page.keyPageId === "key_pricing",
      );

    await expect(
      detectPriorityPageClickDeclines({
        ...input(),
        snapshot: fixture,
        thresholds: {
          minimumBaselineClicks: 1_000,
          minimumLostClicks: 1,
          minimumDeclinePercent: 0.05,
          criticalLostClicks: 1,
          criticalDeclinePercent: 0.01,
          siteSuppressionMarginPercent: 0.1,
        },
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        keyPageId: "key_pricing",
        suppressionReason: "low_baseline",
      }),
    ]);
  });

  it("only suppresses a page for a material site decline within the margin", async () => {
    const fixture = withComparisonEvidence({
      key_pricing: {
        baseline: { reported: true, clicks: 20 },
        current: { reported: true, clicks: 7 },
      },
    });
    fixture.keyPages = fixture.keyPages.filter(
      (page) => page.id === "key_pricing",
    );
    fixture.comparisonEvidence!.pages =
      fixture.comparisonEvidence!.pages.filter(
        (page) => page.keyPageId === "key_pricing",
      );
    if (fixture.siteContext.status !== "complete")
      throw new Error("fixture bug");
    fixture.siteContext.observations = [
      { date: "2026-06-04", clicks: 46, impressions: 1_000 },
      { date: "2026-07-02", clicks: 32, impressions: 1_000 },
    ];
    const nonMaterial = await detectPriorityPageClickDeclines({
      ...input(),
      snapshot: fixture,
    });
    expect(
      nonMaterial.find((outcome) => outcome.keyPageId === "key_pricing"),
    ).toMatchObject({ status: "signal" });

    fixture.siteContext.observations[1] = {
      ...fixture.siteContext.observations[1],
      clicks: 18,
    };
    const suppressed = await detectPriorityPageClickDeclines({
      ...input(),
      snapshot: fixture,
    });
    expect(
      suppressed.find((outcome) => outcome.keyPageId === "key_pricing"),
    ).toMatchObject({ suppressionReason: "site_wide_decline" });
  });

  it("accepts determinate not-reported zero facts and rejects invalid comparison provenance", async () => {
    const fixture = withComparisonEvidence({
      key_pricing: {
        baseline: { reported: true, clicks: 20 },
        current: { reported: false, clicks: 0 },
      },
    });
    await expect(
      detectPriorityPageClickDeclines({ ...input(), snapshot: fixture }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ keyPageId: "key_pricing", status: "signal" }),
      ]),
    );

    const wrongAliases = structuredClone(fixture);
    wrongAliases.comparisonEvidence!.pages[0].aliases.reverse();
    await expect(
      detectPriorityPageClickDeclines({ ...input(), snapshot: wrongAliases }),
    ).rejects.toThrow("aliases");

    const missingAlias = structuredClone(fixture);
    missingAlias.comparisonEvidence!.pages[0].aliases.pop();
    await expect(
      detectPriorityPageClickDeclines({ ...input(), snapshot: missingAlias }),
    ).rejects.toThrow("aliases");

    const wrongWindows = structuredClone(fixture);
    wrongWindows.comparisonEvidence!.currentWindow.endDate = "2026-07-28";
    await expect(
      detectPriorityPageClickDeclines({ ...input(), snapshot: wrongWindows }),
    ).rejects.toThrow("windows");

    const incomplete = structuredClone(fixture);
    incomplete.comparisonEvidence!.pages.pop();
    await expect(
      detectPriorityPageClickDeclines({ ...input(), snapshot: incomplete }),
    ).rejects.toThrow("cover every key page");

    const contradictory = structuredClone(fixture);
    contradictory.comparisonEvidence!.pages[0].current = {
      reported: false,
      clicks: 1,
      impressions: 0,
    };
    await expect(
      detectPriorityPageClickDeclines({ ...input(), snapshot: contradictory }),
    ).rejects.toThrow("Not-reported");
  });

  it("hashes complete comparison provenance while retaining canonical output ordering", async () => {
    const fixture = withComparisonEvidence({
      key_pricing: {
        baseline: { reported: true, clicks: 20, impressions: 100 },
        current: { reported: true, clicks: 0, impressions: 10 },
      },
    });
    const first = await detectPriorityPageClickDeclines({
      ...input(),
      snapshot: fixture,
    });
    const changed = structuredClone(fixture);
    changed.comparisonEvidence!.pages.find(
      (page) => page.keyPageId === "key_pricing",
    )!.current = {
      reported: false,
      clicks: 0,
      impressions: 0,
    };
    const second = await detectPriorityPageClickDeclines({
      ...input(),
      snapshot: changed,
    });
    expect(second.map((outcome) => outcome.keyPageId)).toEqual(
      first.map((outcome) => outcome.keyPageId),
    );
    expect(
      second.find((outcome) => outcome.keyPageId === "key_pricing")?.signal
        ?.evidenceRef,
    ).not.toBe(
      first.find((outcome) => outcome.keyPageId === "key_pricing")?.signal
        ?.evidenceRef,
    );
  });
});
