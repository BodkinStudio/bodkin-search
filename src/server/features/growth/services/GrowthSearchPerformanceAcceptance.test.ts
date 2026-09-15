import { describe, expect, it, vi } from "vitest";
import { recordGrowthSignalSchema } from "@/types/schemas/growth";
import {
  createGrowthSearchPerformanceFixture,
  GROWTH_SEARCH_PERFORMANCE_FIXTURE_WINDOWS,
} from "./GrowthSearchPerformanceFixture";
import { detectPriorityPageClickDeclines } from "./PriorityPageClickDeclineDetector";

function observation(rawUrl: string, date: string, clicks: number) {
  return { rawUrl, date, clicks, impressions: clicks + 1 };
}

function detectorInput(snapshot = createGrowthSearchPerformanceFixture()) {
  return {
    projectId: snapshot.projectId,
    runId: "run_acceptance",
    snapshot,
    ...GROWTH_SEARCH_PERFORMANCE_FIXTURE_WINDOWS,
  };
}

function evidence(
  outcomes: Awaited<ReturnType<typeof detectPriorityPageClickDeclines>>,
) {
  return outcomes.find((outcome) => outcome.keyPageId === "key_pricing")?.signal
    ?.evidenceRef;
}

describe("BG-0201 through BG-0203 acceptance boundaries", () => {
  it("keeps query and non-root-slash identities distinct while aggregating valid aliases", async () => {
    const fixture = createGrowthSearchPerformanceFixture();
    fixture.keyPages.push(
      {
        id: "key_query",
        projectId: fixture.projectId,
        url: "https://example.test/pricing?plan=pro",
        commercialWeight: null,
      },
      {
        id: "key_slash",
        projectId: fixture.projectId,
        url: "https://example.test/docs/",
        commercialWeight: null,
      },
      {
        id: "key_long",
        projectId: fixture.projectId,
        url: `https://example.test/${"a".repeat(3_900)}`,
        commercialWeight: null,
      },
    );
    for (const date of fixture.siteContext.status === "complete"
      ? fixture.siteContext.observations.map((row) => row.date)
      : []) {
      fixture.observations.push(
        observation("https://example.test/pricing?plan=pro", date, 99),
        observation("https://example.test/docs/", date, 99),
        observation(
          `https://example.test/${"a".repeat(3_900)}`,
          date,
          date >= "2026-07-02" ? 1 : 10,
        ),
      );
    }
    const outcomes = await detectPriorityPageClickDeclines(
      detectorInput(fixture),
    );
    expect(
      outcomes.find((outcome) => outcome.keyPageId === "key_pricing"),
    ).toMatchObject({
      baselineClicks: 308,
      currentClicks: 140,
    });
    expect(
      outcomes.find((outcome) => outcome.keyPageId === "key_query"),
    ).toMatchObject({
      suppressionReason: "not_material",
    });
    expect(
      outcomes.find((outcome) => outcome.keyPageId === "key_slash"),
    ).toMatchObject({
      suppressionReason: "not_material",
    });
    expect(
      outcomes.find((outcome) => outcome.keyPageId === "key_long"),
    ).toMatchObject({ status: "signal", signal: { entityRef: "key_long" } });
  });

  it("does not fabricate absent site totals and suppresses requested incomplete context", async () => {
    const absent = createGrowthSearchPerformanceFixture();
    absent.siteContext = { status: "absent" };
    const absentOutcomes = await detectPriorityPageClickDeclines(
      detectorInput(absent),
    );
    expect(
      absentOutcomes.find((outcome) => outcome.keyPageId === "key_pricing"),
    ).toMatchObject({ status: "signal" });

    const incomplete = createGrowthSearchPerformanceFixture();
    incomplete.siteContext = { status: "requested_incomplete" };
    const incompleteOutcomes = await detectPriorityPageClickDeclines(
      detectorInput(incomplete),
    );
    expect(
      incompleteOutcomes.every(
        (outcome) => outcome.suppressionReason === "site_context_incomplete",
      ),
    ).toBe(true);
  });

  it("keeps observed zero distinct from missing data and honors material/critical boundaries", async () => {
    const fixture = createGrowthSearchPerformanceFixture();
    const outcomes = await detectPriorityPageClickDeclines({
      ...detectorInput(fixture),
      thresholds: {
        minimumBaselineClicks: 100,
        minimumLostClicks: 20,
        minimumDeclinePercent: 168 / 308,
        criticalLostClicks: 168,
        criticalDeclinePercent: 168 / 308,
        siteSuppressionMarginPercent: 0,
      },
    });
    expect(
      outcomes.find((outcome) => outcome.keyPageId === "key_pricing"),
    ).toMatchObject({
      status: "signal",
      priority: 504,
      signal: { severity: "critical" },
    });
    expect(
      outcomes.find((outcome) => outcome.keyPageId === "key_new"),
    ).toMatchObject({
      suppressionReason: "zero_baseline",
      baselineClicks: 0,
    });
    expect(
      outcomes.find((outcome) => outcome.keyPageId === "key_incomplete"),
    ).toMatchObject({
      suppressionReason: "missing_observation",
    });
  });

  it("uses null weight as one, deterministically breaks priority ties, and validates drafts", async () => {
    const fixture = createGrowthSearchPerformanceFixture();
    fixture.keyPages.find(
      (page) => page.id === "key_pricing",
    )!.commercialWeight = null;
    fixture.keyPages.push({
      id: "key_a_tie",
      projectId: fixture.projectId,
      url: "https://example.test/tie",
      commercialWeight: 1,
    });
    for (const date of fixture.siteContext.status === "complete"
      ? fixture.siteContext.observations.map((row) => row.date)
      : []) {
      fixture.observations.push(
        observation(
          "https://example.test/tie",
          date,
          date >= "2026-07-02" ? 4 : 10,
        ),
      );
    }
    const first = await detectPriorityPageClickDeclines(detectorInput(fixture));
    const second = await detectPriorityPageClickDeclines({
      ...detectorInput(fixture),
      snapshot: { ...fixture, observations: fixture.observations.toReversed() },
    });
    expect(first).toEqual(second);
    const pricing = first.find(
      (outcome) => outcome.keyPageId === "key_pricing",
    )!;
    expect(pricing.priority).toBe(168);
    expect(
      first
        .filter((outcome) => outcome.priority === 168)
        .map((outcome) => outcome.keyPageId),
    ).toEqual(["key_a_tie", "key_pricing"]);
    expect(recordGrowthSignalSchema.parse(pricing.signal)).toEqual(
      pricing.signal,
    );
  });

  it("canonicalizes equivalent provenance but changes it for source/configuration drift", async () => {
    const fixture = createGrowthSearchPerformanceFixture();
    const first = await detectPriorityPageClickDeclines(detectorInput(fixture));
    const reordered = await detectPriorityPageClickDeclines({
      ...detectorInput(fixture),
      snapshot: { ...fixture, observations: fixture.observations.toReversed() },
    });
    const configured = await detectPriorityPageClickDeclines({
      ...detectorInput(fixture),
      thresholds: {
        minimumBaselineClicks: 100,
        minimumLostClicks: 20,
        minimumDeclinePercent: 0.3,
        criticalLostClicks: 101,
        criticalDeclinePercent: 0.5,
        siteSuppressionMarginPercent: 0.1,
      },
    });
    expect(evidence(reordered)).toBe(evidence(first));
    expect(evidence(configured)).not.toBe(evidence(first));
    expect(evidence(first)).toMatch(/^gsc:[a-f0-9]{64}$/);
  });

  it("rejects malformed pure-detector metadata, unsafe totals, and non-adjacent windows", async () => {
    await expect(
      detectPriorityPageClickDeclines({
        ...detectorInput(),
        projectId: "another_project",
      }),
    ).rejects.toThrow("Snapshot belongs to another project");
    await expect(
      detectPriorityPageClickDeclines({
        ...detectorInput(),
        baselineWindow: { startDate: "2026-06-04", endDate: "2026-06-30" },
      }),
    ).rejects.toThrow("equal length");

    const unsafe = createGrowthSearchPerformanceFixture();
    unsafe.observations = unsafe.observations.map((row) =>
      row.rawUrl.includes("/pricing")
        ? { ...row, clicks: Number.MAX_SAFE_INTEGER }
        : row,
    );
    await expect(
      detectPriorityPageClickDeclines(detectorInput(unsafe)),
    ).rejects.toThrow("safe integer");
  });

  it("keeps evidence stable when distinct Unicode URL aliases collate equally", async () => {
    const fixture = createGrowthSearchPerformanceFixture();
    fixture.siteContext = { status: "absent" };
    fixture.keyPages = fixture.keyPages
      .filter((page) => page.id === "key_pricing")
      .map((page) => ({
        ...page,
        url: "https://xn--9ca.example.test/pricing",
      }));
    fixture.observations = fixture.observations
      .filter((row) => row.rawUrl.endsWith("/pricing"))
      .map((row) => ({
        ...row,
        rawUrl: row.rawUrl.startsWith("http:")
          ? "https://e\u0301.example.test/pricing"
          : "https://\u00e9.example.test/pricing",
      }));

    const first = await detectPriorityPageClickDeclines(detectorInput(fixture));
    const reordered = await detectPriorityPageClickDeclines(
      detectorInput({
        ...fixture,
        observations: fixture.observations.toReversed(),
      }),
    );

    expect(first[0]?.status).toBe("signal");
    expect(reordered).toEqual(first);
  });

  it("rejects out-of-snapshot detector windows before expanding their dates", async () => {
    const fixture = createGrowthSearchPerformanceFixture();
    fixture.keyPages = [];
    fixture.observations = [];
    fixture.siteContext = { status: "absent" };
    // Captured intentionally; the mock below supplies its Date receiver with .call(this).
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalToISOString = Date.prototype.toISOString;
    let dateFormattingCalls = 0;
    const spy = vi
      .spyOn(Date.prototype, "toISOString")
      .mockImplementation(function (this: Date) {
        dateFormattingCalls += 1;
        if (dateFormattingCalls > 200) {
          throw new Error("Date expansion budget exceeded before validation");
        }
        return originalToISOString.call(this);
      });

    try {
      await expect(
        detectPriorityPageClickDeclines({
          ...detectorInput(fixture),
          baselineWindow: {
            startDate: "0001-01-01",
            endDate: "9999-12-31",
          },
        }),
      ).rejects.toThrow(/contained|90 days/);
      expect(dateFormattingCalls).toBeLessThan(20);
    } finally {
      spy.mockRestore();
    }
  });
});
