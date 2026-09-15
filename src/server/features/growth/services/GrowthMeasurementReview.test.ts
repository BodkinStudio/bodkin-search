import { beforeEach, describe, expect, it, vi } from "vitest";
import { sha256Hex } from "@/server/lib/audit/ids";
import type { GrowthMeasurementPeriodType } from "@/types/schemas/growth-measurements";
import { observationsHash } from "./GrowthMeasurementFacts";

const confounders = vi.hoisted(() => ({ discover: vi.fn() }));

vi.mock("./GrowthMeasurementConfounders", () => ({
  discoverGrowthMeasurementConfounders: confounders.discover,
}));

import {
  type GrowthMeasurementReviewInput,
  prepareGrowthMeasurementReview,
} from "./GrowthMeasurementReview";

function makeGraph(
  overrides: {
    projectId?: string;
    planId?: string;
    actionVersion?: number;
    status?: "active" | "completed";
    primaryComplete?: boolean;
    secondaryComplete?: boolean;
    observationFactHash?: string;
  } = {},
): GrowthMeasurementReviewInput {
  const periods: GrowthMeasurementPeriodType[] = [
    "baseline",
    "measurement",
    "long_term",
  ];
  const primaryObservations = periods.map((periodType, index) => ({
    id: `primary_${periodType}`,
    metricId: "metric_primary",
    periodType,
    completeness:
      periodType === "measurement" && overrides.primaryComplete === false
        ? 0.5
        : 1,
    factHash:
      index === 0 && overrides.observationFactHash
        ? overrides.observationFactHash
        : String(index + 1).repeat(64),
  }));
  const secondaryObservations = overrides.secondaryComplete
    ? periods.map((periodType, index) => ({
        id: `secondary_${periodType}`,
        metricId: "metric_secondary",
        periodType,
        completeness: 1,
        factHash: String(index + 4).repeat(64),
      }))
    : [];
  return {
    plan: {
      id: overrides.planId ?? "plan_1",
      projectId: overrides.projectId ?? "project_1",
      actionVersion: overrides.actionVersion ?? 5,
      status: overrides.status ?? "active",
      reportTimezone: "America/Los_Angeles",
      baselineStart: "2026-08-01",
      measurementEnd: "2026-09-30",
      longMeasurementEnd: "2026-10-31",
    },
    metrics: [
      {
        id: "metric_primary",
        isPrimary: true,
        entityType: "url",
        entityKey: "https://example.com/page",
      },
      {
        id: "metric_secondary",
        isPrimary: false,
        entityType: "url",
        entityKey: "https://example.com/page",
      },
    ],
    observations: [...primaryObservations, ...secondaryObservations],
    implementationChangeEventId: "anchor_1",
  };
}

describe("prepareGrowthMeasurementReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    confounders.discover.mockResolvedValue({ state: "none", candidates: [] });
  });

  it("opens on the exact first local calendar day after the inclusive final window", async () => {
    const graph = makeGraph();

    const waiting = await prepareGrowthMeasurementReview(
      graph,
      new Date("2026-11-01T06:59:59.999Z"),
    );
    expect(waiting).toMatchObject({
      review: {
        state: "waiting",
        availableOn: "2026-11-01",
        primaryEvidenceComplete: true,
        missingPrimaryEvidenceCount: 0,
        revision: null,
      },
    });
    const ready = await prepareGrowthMeasurementReview(
      graph,
      new Date("2026-11-01T07:00:00.000Z"),
    );
    expect(ready).toMatchObject({
      review: {
        state: "ready",
        availableOn: "2026-11-01",
        primaryEvidenceComplete: true,
        missingPrimaryEvidenceCount: 0,
      },
    });
    expect(ready.review.revision).toMatch(/^[a-f0-9]{64}$/);
  });

  it("blocks ordinary outcomes only for missing complete primary coordinates", async () => {
    const ready = await prepareGrowthMeasurementReview(
      makeGraph({ secondaryComplete: false }),
      new Date("2026-11-01T07:00:00.000Z"),
    );
    const restricted = await prepareGrowthMeasurementReview(
      makeGraph({ primaryComplete: false, secondaryComplete: true }),
      new Date("2026-11-01T07:00:00.000Z"),
    );

    expect(ready.review).toMatchObject({
      state: "ready",
      primaryEvidenceComplete: true,
      missingPrimaryEvidenceCount: 0,
    });
    expect(restricted.review).toMatchObject({
      state: "not_measurable_only",
      primaryEvidenceComplete: false,
      missingPrimaryEvidenceCount: 1,
    });
  });

  it.each(["overflow", "unavailable"] as const)(
    "keeps %s discovery advisory when primary evidence is complete",
    async (state) => {
      confounders.discover.mockResolvedValue({ state, candidates: [] });

      const result = await prepareGrowthMeasurementReview(
        makeGraph(),
        new Date("2026-11-01T07:00:00.000Z"),
      );
      expect(result).toMatchObject({
        discovery: { state },
        review: { state: "ready" },
      });
      expect(result.review.revision).toMatch(/^[a-f0-9]{64}$/);
    },
  );

  it("closes completed review without running current discovery", async () => {
    const result = await prepareGrowthMeasurementReview(
      makeGraph({ status: "completed" }),
      new Date("2026-11-01T07:00:00.000Z"),
    );

    expect(result).toMatchObject({
      discovery: { state: "closed", candidates: [] },
      review: { state: "closed", revision: null },
    });
    expect(result.expectedObservationsHash).toMatch(/^[a-f0-9]{64}$/);
    expect(confounders.discover).not.toHaveBeenCalled();
  });

  it("binds a deterministic revision to every review coordinate", async () => {
    const graph = makeGraph();
    const completeCandidates = {
      state: "complete" as const,
      candidates: [
        { event: { id: "candidate_z" }, matchedUrls: [] },
        { event: { id: "candidate_a" }, matchedUrls: [] },
      ],
    };
    confounders.discover.mockResolvedValue(completeCandidates);
    const now = new Date("2026-11-01T07:00:00.000Z");
    const first = await prepareGrowthMeasurementReview(graph, now);
    confounders.discover.mockResolvedValue({
      ...completeCandidates,
      candidates: completeCandidates.candidates.toReversed(),
    });
    const reordered = await prepareGrowthMeasurementReview(graph, now);
    const exactObservationHash = await observationsHash(graph);
    const expected = await sha256Hex(
      JSON.stringify({
        version: "growth-measurement-review-v1",
        projectId: "project_1",
        planId: "plan_1",
        actionVersion: 5,
        observationsHash: exactObservationHash,
        discoveryState: "complete",
        candidateIds: ["candidate_a", "candidate_z"],
      }),
    );

    expect(first.review.revision).toBe(expected);
    expect(reordered.review.revision).toBe(expected);
    for (const changed of [
      makeGraph({ projectId: "project_2" }),
      makeGraph({ planId: "plan_2" }),
      makeGraph({ actionVersion: 6 }),
      makeGraph({ observationFactHash: "f".repeat(64) }),
    ]) {
      await expect(
        prepareGrowthMeasurementReview(changed, now),
      ).resolves.not.toMatchObject({ review: { revision: expected } });
    }
  });
});
