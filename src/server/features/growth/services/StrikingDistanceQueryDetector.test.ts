import { describe, expect, it } from "vitest";
import { sha256Hex } from "@/server/lib/audit/ids";
import type { GrowthStrikingDistanceInventory } from "@/types/schemas/growth-striking-distance";
import {
  detectStrikingDistanceQueries,
  matchesStrikingDistanceEvidenceRef,
  strikingDistanceEvidenceRef,
} from "./StrikingDistanceQueryDetector";

const inventory = (rows: {
  baseline: Array<{
    query: string;
    page: string;
    clicks: number;
    impressions: number;
    position: number;
  }>;
  current: Array<{
    query: string;
    page: string;
    clicks: number;
    impressions: number;
    position: number;
  }>;
}) => ({
  projectId: "project_1",
  property: "sc-domain:example.com",
  capturedAt: "2026-08-06T12:00:00.000Z",
  baselineWindow: { startDate: "2026-06-09", endDate: "2026-07-06" },
  currentWindow: { startDate: "2026-07-07", endDate: "2026-08-03" },
  baseline: {
    retrievalStatus: "exhausted" as const,
    requestsUsed: 1,
    rows: rows.baseline,
  },
  current: {
    retrievalStatus: "exhausted" as const,
    requestsUsed: 1,
    rows: rows.current,
  },
});

const candidate = (query: string, position: number, impressions: number) => ({
  query,
  page: "https://example.com/pricing",
  clicks: 4,
  impressions,
  position,
});

const input = (
  data: GrowthStrikingDistanceInventory = inventory({
    baseline: [candidate("buy widget", 12, 80)],
    current: [candidate("buy widget", 8, 100)],
  }),
) => ({
  projectId: "project_1",
  runId: "run_1",
  site: "example.com",
  inventory: data,
  keyPages: [
    {
      id: "key_1",
      projectId: "project_1",
      url: "http://www.example.com/pricing",
      commercialWeight: 4,
    },
  ],
});

describe("detectStrikingDistanceQueries", () => {
  it("excludes oversized queries before selecting candidates while retaining eligible queries", async () => {
    const queries = ["x".repeat(826), "a".repeat(500), "buy widget"];
    const result = await detectStrikingDistanceQueries(
      input(
        inventory({
          baseline: queries.map((query) => candidate(query, 12, 800)),
          current: queries.map((query) => candidate(query, 8, 1000)),
        }),
      ),
    );
    expect(
      result.map((outcome) => outcome.status === "candidate" && outcome.query),
    ).toEqual(["a".repeat(500), "buy widget"]);
  });
  it("emits three measured signal drafts with common, recomputable evidence", async () => {
    const [outcome] = await detectStrikingDistanceQueries(input());
    expect(outcome).toMatchObject({
      status: "candidate",
      query: "buy widget",
      canonicalPageUrl: "https://example.com/pricing",
      commercialWeight: 4,
      baseline: { position: 12, impressions: 80, clicks: 4 },
      current: { position: 8, impressions: 100, clicks: 4 },
    });
    if (outcome.status !== "candidate")
      throw new Error("fixture did not qualify");
    expect(outcome.signalDrafts.map((signal) => signal.metric)).toEqual([
      "gsc_average_position",
      "gsc_impressions",
      "gsc_clicks",
    ]);
    expect(
      outcome.signalDrafts.every(
        (signal) => signal.evidenceRef === outcome.evidenceRef,
      ),
    ).toBe(true);
    expect(outcome.signalDrafts[1]).toMatchObject({
      entityRef: "buy widget",
      baselineValue: 80,
      currentValue: 100,
      deltaValue: 20,
    });
  });

  it("binds new evidence to capture time while recognizing immutable v1 references", async () => {
    const evidenceInput = {
      projectId: "project_1",
      site: "example.com",
      query: "buy widget",
      page: "https://example.com/pricing",
      capturedAt: "2026-08-06T12:00:00.000Z",
      baselineWindow: { startDate: "2026-06-09", endDate: "2026-07-06" },
      currentWindow: { startDate: "2026-07-07", endDate: "2026-08-03" },
      baseline: { position: 12, impressions: 80, clicks: 4 },
      current: { position: 8, impressions: 100, clicks: 4 },
    };
    const currentRef = await strikingDistanceEvidenceRef(evidenceInput);
    expect(currentRef).toMatch(/^gsc_striking_distance_v2:[a-f0-9]{64}$/);
    await expect(
      matchesStrikingDistanceEvidenceRef(evidenceInput, currentRef),
    ).resolves.toBe(true);
    await expect(
      matchesStrikingDistanceEvidenceRef(
        { ...evidenceInput, capturedAt: "2026-08-07T12:00:00.000Z" },
        currentRef,
      ),
    ).resolves.toBe(false);

    const legacyInput = {
      projectId: evidenceInput.projectId,
      site: evidenceInput.site,
      query: evidenceInput.query,
      page: evidenceInput.page,
      baselineWindow: evidenceInput.baselineWindow,
      currentWindow: evidenceInput.currentWindow,
      baseline: evidenceInput.baseline,
      current: evidenceInput.current,
    };
    const legacyRef = `gsc_striking_distance_v1:${await sha256Hex(
      JSON.stringify({
        detectorVersion: "striking-distance-query-v1",
        positionRange: [5, 20],
        minimumImpressions: 50,
        maxCandidates: 3,
        ...legacyInput,
      }),
    )}`;
    await expect(
      matchesStrikingDistanceEvidenceRef(evidenceInput, legacyRef),
    ).resolves.toBe(true);
  });

  it("requires a real matching baseline and a configured key page", async () => {
    await expect(
      detectStrikingDistanceQueries(
        input(
          inventory({
            baseline: [],
            current: [candidate("buy widget", 8, 100)],
          }),
        ),
      ),
    ).resolves.toEqual([
      { status: "suppressed", suppressionReason: "no_eligible_query" },
    ]);
  });

  it("preserves the exact configured key-page URL in evidence and output", async () => {
    const exactPage = "https://example.com/pricing/?plan=pro";
    const data = inventory({
      baseline: [
        {
          ...candidate("buy widget", 12, 80),
          page: exactPage,
        },
      ],
      current: [
        {
          ...candidate("buy widget", 8, 100),
          page: exactPage,
        },
      ],
    });
    const configured = input(data);
    configured.keyPages[0].url = exactPage;
    const [outcome] = await detectStrikingDistanceQueries(configured);
    expect(outcome).toMatchObject({
      status: "candidate",
      canonicalPageUrl: exactPage,
    });
  });

  it("does not merge GSC facts from distinct query-string coordinates", async () => {
    const baselinePage = "https://example.com/pricing?plan=pro";
    const currentPage = "https://example.com/pricing?plan=other";
    const data = inventory({
      baseline: [{ ...candidate("buy widget", 12, 80), page: baselinePage }],
      current: [{ ...candidate("buy widget", 8, 100), page: currentPage }],
    });
    const configured = input(data);
    configured.keyPages[0].url = currentPage;
    await expect(detectStrikingDistanceQueries(configured)).resolves.toEqual([
      { status: "suppressed", suppressionReason: "no_eligible_query" },
    ]);
  });

  it("does not merge non-root trailing-slash coordinates", async () => {
    const baselinePage = "https://example.com/pricing";
    const currentPage = "https://example.com/pricing/";
    const data = inventory({
      baseline: [{ ...candidate("buy widget", 12, 80), page: baselinePage }],
      current: [{ ...candidate("buy widget", 8, 100), page: currentPage }],
    });
    const configured = input(data);
    configured.keyPages[0].url = currentPage;
    await expect(detectStrikingDistanceQueries(configured)).resolves.toEqual([
      { status: "suppressed", suppressionReason: "no_eligible_query" },
    ]);
  });

  it("skips an exact page whose persisted target would exceed storage bounds", async () => {
    const longPath = `https://example.com/${"a".repeat(2_000)}`;
    const data = inventory({
      baseline: [{ ...candidate("buy widget", 12, 80), page: longPath }],
      current: [{ ...candidate("buy widget", 8, 100), page: longPath }],
    });
    const configured = input(data);
    configured.keyPages[0].url = longPath;
    await expect(detectStrikingDistanceQueries(configured)).resolves.toEqual([
      { status: "suppressed", suppressionReason: "no_eligible_query" },
    ]);
  });

  it("keeps position and impression boundaries and caps deterministic candidates at three", async () => {
    const current = [
      candidate("edge five", 5, 50),
      candidate("edge twenty", 20, 51),
      candidate("four", 4.9, 99),
      candidate("twenty one", 20.1, 99),
      candidate("low impressions", 8, 49),
      candidate("alpha", 8, 100),
      candidate("beta", 8, 100),
      candidate("gamma", 8, 100),
    ];
    const outcomes = await detectStrikingDistanceQueries(
      input(inventory({ baseline: current, current })),
    );
    expect(
      outcomes.filter((outcome) => outcome.status === "candidate"),
    ).toHaveLength(3);
    expect(
      outcomes
        .filter((outcome) => outcome.status === "candidate")
        .map((outcome) =>
          outcome.status === "candidate" ? outcome.query : "",
        ),
    ).toEqual(["alpha", "beta", "gamma"]);
  });

  it("never uses capped source data", async () => {
    const source = inventory({
      baseline: [candidate("buy widget", 12, 80)],
      current: [candidate("buy widget", 8, 100)],
    });
    const data = {
      ...source,
      current: { ...source.current, retrievalStatus: "capped" as const },
    };
    await expect(detectStrikingDistanceQueries(input(data))).resolves.toEqual([
      { status: "suppressed", suppressionReason: "retrieval_capped" },
    ]);
  });
});
