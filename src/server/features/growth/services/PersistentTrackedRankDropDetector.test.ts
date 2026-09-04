import { describe, expect, it } from "vitest";
import {
  detectPersistentTrackedRankDrops,
  parsePersistentRankDropEvidenceRef,
} from "./PersistentTrackedRankDropDetector";

function sequence(
  positions: Array<number | null>,
  overrides: Partial<{
    configId: string;
    trackingKeywordId: string;
    keyword: string;
    device: "desktop" | "mobile";
    baselineUrl: string | null;
  }> = {},
) {
  return {
    configId: overrides.configId ?? "config_1",
    domain: "example.com",
    serpDepth: 20,
    trackingKeywordId: overrides.trackingKeywordId ?? "keyword_1",
    keyword: overrides.keyword ?? "commercial query",
    searchVolume: 100,
    device: overrides.device ?? ("desktop" as const),
    snapshots: positions.map((position, index) => ({
      id: index + 1,
      runId: `rank_run_${index}`,
      checkedAt: `2026-08-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
      position,
      url:
        index === 0
          ? (overrides.baselineUrl ?? "https://example.com/pricing")
          : "https://example.com/pricing",
    })),
  };
}

function input(sequences = [sequence([4, 7, 8, 9])]) {
  return {
    projectId: "project_1",
    runId: "growth_run_1",
    site: "example.com",
    capturedAt: "2026-08-10T00:00:00.000Z",
    keyPages: [
      {
        id: "page_1",
        projectId: "project_1",
        url: "https://example.com/pricing",
        commercialWeight: 5,
      },
    ],
    sequences,
  };
}

describe("persistent tracked rank-drop detector", () => {
  it("requires three consecutive losses of at least three positions", () => {
    const [candidate] = detectPersistentTrackedRankDrops(input());
    expect(candidate).toMatchObject({
      keyword: "commercial query",
      device: "desktop",
      priorityPageUrl: "https://example.com/pricing",
      signal: {
        signalType: "tracked_rank_drop",
        entityType: "tracked_keyword",
        baselineValue: 4,
        currentValue: 9,
        deltaValue: 5,
        evidenceKind: "rank_snapshot",
        evidenceRef: "rank_snapshot:v1:20:1,2,3,4",
      },
    });
    expect(
      parsePersistentRankDropEvidenceRef(candidate.signal.evidenceRef),
    ).toEqual({ serpDepth: 20, snapshotIds: [1, 2, 3, 4] });
    expect(
      detectPersistentTrackedRankDrops(input([sequence([4, 7, 6, 9])])),
    ).toEqual([]);
  });

  it("preserves not-found ranks as source nulls and uses only a numeric floor in the Signal", () => {
    const [candidate] = detectPersistentTrackedRankDrops(
      input([sequence([10, null, null, null])]),
    );
    expect(candidate.snapshots.map(({ position }) => position)).toEqual([
      10,
      null,
      null,
      null,
    ]);
    expect(candidate.signal).toMatchObject({
      currentValue: 21,
      deltaValue: 11,
      severity: "critical",
    });
  });

  it("suppresses missing baselines, non-priority URLs and ambiguous priority pages", () => {
    expect(
      detectPersistentTrackedRankDrops(input([sequence([null, 10, 11, 12])])),
    ).toEqual([]);
    expect(
      detectPersistentTrackedRankDrops(
        input([
          sequence([4, 7, 8, 9], {
            baselineUrl: "https://example.com/blog",
          }),
        ]),
      ),
    ).toEqual([]);
    expect(
      detectPersistentTrackedRankDrops({
        ...input(),
        keyPages: [
          ...input().keyPages,
          {
            id: "page_2",
            projectId: "project_1",
            url: "http://www.example.com/pricing",
            commercialWeight: 4,
          },
        ],
      }),
    ).toEqual([]);
  });

  it("keeps devices/configs separate and caps output with stable tie-breaking", () => {
    const candidates = detectPersistentTrackedRankDrops(
      input([
        sequence([2, 10, 11, 12], {
          trackingKeywordId: "z",
          keyword: "zeta",
          device: "mobile",
        }),
        sequence([2, 10, 11, 12], {
          trackingKeywordId: "a",
          keyword: "alpha",
        }),
        sequence([2, 9, 10, 11], {
          configId: "config_2",
          trackingKeywordId: "b",
          keyword: "beta",
        }),
        sequence([2, 8, 9, 10], {
          configId: "config_3",
          trackingKeywordId: "c",
          keyword: "charlie",
        }),
      ]),
    );
    expect(candidates).toHaveLength(3);
    expect(candidates.map(({ keyword }) => keyword)).toEqual([
      "alpha",
      "zeta",
      "beta",
    ]);
  });

  it("rejects malformed positions and non-chronological history", () => {
    expect(() =>
      detectPersistentTrackedRankDrops(input([sequence([4, 7, 21, 9])])),
    ).toThrow("Rank history is invalid");
    const reversed = sequence([4, 7, 8, 9]);
    reversed.snapshots[2].checkedAt = reversed.snapshots[1].checkedAt;
    expect(() => detectPersistentTrackedRankDrops(input([reversed]))).toThrow(
      "Rank history is invalid",
    );
    const overflowDate = sequence([4, 7, 8, 9]);
    overflowDate.snapshots[1].checkedAt = "2026-02-30T00:00:00.000Z";
    expect(() =>
      detectPersistentTrackedRankDrops(input([overflowDate])),
    ).toThrow("Rank snapshot timestamp is invalid");
    const overflowHour = sequence([4, 7, 8, 9]);
    overflowHour.snapshots[1].checkedAt = "2026-02-28T24:00:00.000Z";
    expect(() =>
      detectPersistentTrackedRankDrops(input([overflowHour])),
    ).toThrow("Rank snapshot timestamp is invalid");
  });
});
