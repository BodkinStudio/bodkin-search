import { sha256Hex } from "@/server/lib/audit/ids";
import {
  calendarDateInTimezone,
  type MeasurementGraph,
  nextCalendarDate,
  observationsHash,
  primaryEvidenceCoverage,
} from "./GrowthMeasurementFacts";
import { discoverGrowthMeasurementConfounders } from "./GrowthMeasurementConfounders";

const GROWTH_MEASUREMENT_REVIEW_REVISION_VERSION =
  "growth-measurement-review-v1";

type ActiveDiscovery = Awaited<
  ReturnType<typeof discoverGrowthMeasurementConfounders>
>;

export type GrowthMeasurementReviewInput = {
  implementationChangeEventId: string | null;
  plan: Pick<
    MeasurementGraph["plan"],
    | "id"
    | "projectId"
    | "actionVersion"
    | "status"
    | "reportTimezone"
    | "baselineStart"
    | "measurementEnd"
    | "longMeasurementEnd"
  >;
  metrics: Array<
    Pick<
      MeasurementGraph["metrics"][number],
      "id" | "isPrimary" | "entityType" | "entityKey"
    >
  >;
  observations: Array<
    Pick<
      MeasurementGraph["observations"][number],
      "id" | "factHash" | "metricId" | "periodType" | "completeness"
    >
  >;
};

export type GrowthMeasurementReviewDiscovery =
  | ActiveDiscovery
  | { state: "closed"; candidates: readonly [] };

function completeCandidateIds(discovery: ActiveDiscovery) {
  return discovery.state === "complete"
    ? [...new Set(discovery.candidates.map(({ event }) => event.id))].toSorted(
        (left, right) => left.localeCompare(right),
      )
    : [];
}

async function reviewRevision(
  graph: GrowthMeasurementReviewInput,
  exactObservationsHash: string,
  discovery: ActiveDiscovery,
) {
  return sha256Hex(
    JSON.stringify({
      version: GROWTH_MEASUREMENT_REVIEW_REVISION_VERSION,
      projectId: graph.plan.projectId,
      planId: graph.plan.id,
      actionVersion: graph.plan.actionVersion,
      observationsHash: exactObservationsHash,
      discoveryState: discovery.state,
      candidateIds: completeCandidateIds(discovery),
    }),
  );
}

export async function prepareGrowthMeasurementReview(
  graph: GrowthMeasurementReviewInput,
  now = new Date(),
) {
  const availableOn = nextCalendarDate(
    graph.plan.longMeasurementEnd ?? graph.plan.measurementEnd,
  );
  const coverage = primaryEvidenceCoverage(graph);
  const expectedObservationsHash = await observationsHash(graph);
  const baseReview = {
    availableOn,
    primaryEvidenceComplete: coverage.complete,
    missingPrimaryEvidenceCount: coverage.missingCoordinates.length,
  };

  if (graph.plan.status === "completed") {
    return {
      discovery: { state: "closed", candidates: [] } as const,
      review: { ...baseReview, state: "closed", revision: null } as const,
      expectedObservationsHash,
    };
  }

  const discovery = await discoverGrowthMeasurementConfounders(graph);
  if (
    calendarDateInTimezone(now.toISOString(), graph.plan.reportTimezone) <
    availableOn
  ) {
    return {
      discovery,
      review: { ...baseReview, state: "waiting", revision: null } as const,
      expectedObservationsHash,
    };
  }

  return {
    discovery,
    review: {
      ...baseReview,
      state: coverage.complete
        ? ("ready" as const)
        : ("not_measurable_only" as const),
      revision: await reviewRevision(
        graph,
        expectedObservationsHash,
        discovery,
      ),
    },
    expectedObservationsHash,
  };
}
