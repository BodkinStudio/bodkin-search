import { describe, expect, it } from "vitest";
import {
  createGrowthSearchPerformanceFixture,
  GROWTH_SEARCH_PERFORMANCE_FIXTURE_WINDOWS,
} from "./GrowthSearchPerformanceFixture";
import { detectPriorityPageClickDeclines } from "./PriorityPageClickDeclineDetector";

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
});
