import { describe, expect, it } from "vitest";
import {
  detectHighImpressionLowCtrQueries,
  lowCtrEvidenceRef,
  matchesLowCtrEvidenceRef,
} from "./HighImpressionLowCtrDetector";

const window = { startDate: "2026-07-01", endDate: "2026-07-28" };
const currentWindow = { startDate: "2026-07-29", endDate: "2026-08-25" };
function input(overrides: Record<string, unknown> = {}) {
  return {
    projectId: "project",
    runId: "run",
    site: "example.com",
    keyPages: [
      {
        id: "page",
        projectId: "project",
        url: "https://example.com/page",
        commercialWeight: 3,
      },
    ],
    inventory: {
      projectId: "project",
      property: "sc-domain:example.com",
      capturedAt: "2026-08-29T10:00:00.000Z",
      baselineWindow: window,
      currentWindow,
      baseline: {
        retrievalStatus: "exhausted" as "exhausted" | "capped",
        requestsUsed: 1,
        rows: [
          {
            query: "query",
            page: "https://example.com/page",
            clicks: 4,
            impressions: 100,
            position: 2,
          },
        ],
      },
      current: {
        retrievalStatus: "exhausted" as "exhausted" | "capped",
        requestsUsed: 1,
        rows: [
          {
            query: "query",
            page: "https://example.com/page",
            clicks: 3,
            impressions: 100,
            position: 2,
          },
        ],
      },
    },
    ...overrides,
  };
}
describe("detectHighImpressionLowCtrQueries", () => {
  it("does not let oversized queries block eligible CTR opportunities", async () => {
    const value = input();
    for (const period of [value.inventory.baseline, value.inventory.current]) {
      period.rows.push({ ...period.rows[0], query: "x".repeat(826) });
    }
    const outcomes = await detectHighImpressionLowCtrQueries(value);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({ status: "candidate", query: "query" });
  });
  it("emits a four-fact CTR controller at exact thresholds", async () => {
    const [outcome] = await detectHighImpressionLowCtrQueries(input());
    expect(outcome.status).toBe("candidate");
    if (outcome.status !== "candidate") return;
    expect(
      outcome.signalDrafts.map((signal) => [signal.signalType, signal.metric]),
    ).toEqual([
      ["ctr_below_expected", "gsc_ctr"],
      ["ctr_below_expected", "gsc_clicks"],
      ["ctr_below_expected", "gsc_impressions"],
      ["ctr_below_expected", "gsc_average_position"],
    ]);
    expect(
      new Set(outcome.signalDrafts.map((signal) => signal.evidenceRef)).size,
    ).toBe(1);
  });
  it("fails closed when rank worsens or a window has fewer than 100 impressions", async () => {
    const worsened = input();
    (worsened.inventory.current.rows[0] as { position: number }).position = 2.1;
    expect(
      (await detectHighImpressionLowCtrQueries(worsened))[0],
    ).toMatchObject({
      status: "suppressed",
      suppressionReason: "no_eligible_query",
    });
    const lowVolume = input();
    (
      lowVolume.inventory.current.rows[0] as { impressions: number }
    ).impressions = 99;
    expect(
      (await detectHighImpressionLowCtrQueries(lowVolume))[0],
    ).toMatchObject({
      status: "suppressed",
      suppressionReason: "no_eligible_query",
    });
  });
  it("requires both the absolute and relative CTR losses at their exact boundaries", async () => {
    const absoluteShort = input();
    (
      absoluteShort.inventory.baseline.rows[0] as {
        clicks: number;
        impressions: number;
      }
    ).clicks = 40;
    (
      absoluteShort.inventory.baseline.rows[0] as { impressions: number }
    ).impressions = 1_000;
    (
      absoluteShort.inventory.current.rows[0] as {
        clicks: number;
        impressions: number;
      }
    ).clicks = 31;
    (
      absoluteShort.inventory.current.rows[0] as { impressions: number }
    ).impressions = 1_000;
    await expect(
      detectHighImpressionLowCtrQueries(absoluteShort),
    ).resolves.toEqual([
      { status: "suppressed", suppressionReason: "no_eligible_query" },
    ]);

    const relativeShort = input();
    (
      relativeShort.inventory.baseline.rows[0] as {
        clicks: number;
        impressions: number;
      }
    ).clicks = 100;
    (
      relativeShort.inventory.baseline.rows[0] as { impressions: number }
    ).impressions = 1_000;
    (
      relativeShort.inventory.current.rows[0] as {
        clicks: number;
        impressions: number;
      }
    ).clicks = 76;
    (
      relativeShort.inventory.current.rows[0] as { impressions: number }
    ).impressions = 1_000;
    await expect(
      detectHighImpressionLowCtrQueries(relativeShort),
    ).resolves.toEqual([
      { status: "suppressed", suppressionReason: "no_eligible_query" },
    ]);
  });
  it("keeps rank, baseline, volume and URL identity boundaries", async () => {
    for (const position of [1, 4]) {
      const value = input();
      (value.inventory.current.rows[0] as { position: number }).position =
        position;
      (value.inventory.baseline.rows[0] as { position: number }).position =
        position;
      expect((await detectHighImpressionLowCtrQueries(value))[0]).toMatchObject(
        { status: "candidate" },
      );
    }
    const belowOne = input();
    (belowOne.inventory.current.rows[0] as { position: number }).position = 0.9;
    const outside = input();
    (outside.inventory.current.rows[0] as { position: number }).position = 4.1;
    const baseline99 = input();
    (
      baseline99.inventory.baseline.rows[0] as { impressions: number }
    ).impressions = 99;
    const zeroBaseline = input();
    (zeroBaseline.inventory.baseline.rows[0] as { clicks: number }).clicks = 0;
    const zeroCurrent = input();
    (zeroCurrent.inventory.current.rows[0] as { clicks: number }).clicks = 0;
    const missing = input();
    missing.inventory.baseline.rows = [];
    const improved = input();
    (improved.inventory.baseline.rows[0] as { position: number }).position = 3;
    (improved.inventory.current.rows[0] as { position: number }).position = 2;
    const alias = input();
    alias.keyPages[0].url = "http://www.example.com/page";
    const differentPath = input();
    differentPath.keyPages[0].url = "https://example.com/other";
    for (const value of [
      belowOne,
      outside,
      baseline99,
      zeroBaseline,
      missing,
      differentPath,
    ])
      expect((await detectHighImpressionLowCtrQueries(value))[0]).toMatchObject(
        { status: "suppressed" },
      );
    expect(
      (await detectHighImpressionLowCtrQueries(improved))[0],
    ).toMatchObject({ status: "candidate" });
    expect(
      (await detectHighImpressionLowCtrQueries(zeroCurrent))[0],
    ).toMatchObject({ status: "candidate" });
    expect((await detectHighImpressionLowCtrQueries(alias))[0]).toMatchObject({
      status: "candidate",
    });
  });
  it("caps deterministic ordering and recomputes tamper-proof evidence", async () => {
    const value = input();
    const rows = ["gamma", "alpha", "beta", "delta"].map((query, i) => ({
      query,
      page: "https://example.com/page",
      clicks: 25 - i,
      impressions: 100,
      position: 2,
    }));
    value.inventory.baseline.rows = rows;
    value.inventory.current.rows = rows.map((row) => ({ ...row, clicks: 15 }));
    const candidates = (await detectHighImpressionLowCtrQueries(value)).filter(
      (outcome) => outcome.status === "candidate",
    );
    expect(candidates).toHaveLength(3);
    expect(
      candidates.map(
        (outcome) => outcome.status === "candidate" && outcome.query,
      ),
    ).toEqual(["gamma", "alpha", "beta"]);
    const candidate = candidates[0];
    if (candidate.status !== "candidate") throw new Error("fixture");
    const evidence = {
      projectId: "project",
      site: "example.com",
      query: candidate.query,
      page: candidate.canonicalPageUrl,
      capturedAt: value.inventory.capturedAt,
      baselineWindow: window,
      currentWindow,
      baseline: candidate.baseline,
      current: candidate.current,
    };
    expect(await lowCtrEvidenceRef(evidence)).toBe(candidate.evidenceRef);
    await expect(
      matchesLowCtrEvidenceRef(
        { ...evidence, current: { ...evidence.current, clicks: 2 } },
        candidate.evidenceRef,
      ),
    ).resolves.toBe(false);
    const capped = input();
    capped.inventory.current.retrievalStatus = "capped";
    await expect(detectHighImpressionLowCtrQueries(capped)).resolves.toEqual([
      { status: "suppressed", suppressionReason: "retrieval_capped" },
    ]);
  });
  it("breaks equal missed-click scores by current impressions, then query and page", async () => {
    const value = input();
    value.keyPages = [
      ...value.keyPages,
      {
        id: "other-page",
        projectId: "project",
        url: "https://example.com/other",
        commercialWeight: 3,
      },
    ];
    value.inventory.baseline.rows = [
      {
        query: "zeta",
        page: "https://example.com/page",
        clicks: 8,
        impressions: 200,
        position: 2,
      },
      {
        query: "alpha",
        page: "https://example.com/page",
        clicks: 4,
        impressions: 100,
        position: 2,
      },
      {
        query: "alpha",
        page: "https://example.com/other",
        clicks: 4,
        impressions: 100,
        position: 2,
      },
    ];
    value.inventory.current.rows = [
      {
        query: "zeta",
        page: "https://example.com/page",
        clicks: 4,
        impressions: 200,
        position: 2,
      },
      {
        query: "alpha",
        page: "https://example.com/other",
        clicks: 2,
        impressions: 100,
        position: 2,
      },
      {
        query: "alpha",
        page: "https://example.com/page",
        clicks: 2,
        impressions: 100,
        position: 2,
      },
    ];
    const candidates = await detectHighImpressionLowCtrQueries(value);
    expect(
      candidates.map(
        (outcome) =>
          outcome.status === "candidate" &&
          `${outcome.query}:${outcome.canonicalPageUrl}`,
      ),
    ).toEqual([
      "zeta:https://example.com/page",
      "alpha:https://example.com/other",
      "alpha:https://example.com/page",
    ]);
  });
});
