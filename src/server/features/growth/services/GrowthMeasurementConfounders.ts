import { GrowthChangeEventsRepository } from "../repositories/GrowthChangeEventsRepository";
import { conflict, type MeasurementGraph } from "./GrowthMeasurementFacts";

export const GROWTH_MEASUREMENT_CONFOUNDER_LIMIT = 50;

type ChangeEventCandidate = Awaited<
  ReturnType<
    typeof GrowthChangeEventsRepository.listMeasurementConfounderCandidates
  >
>[number];

type GrowthMeasurementConfounderCandidate = {
  event: ChangeEventCandidate["event"];
  matchedUrls: string[];
};

type GrowthMeasurementConfounderDiscovery =
  | { state: "unavailable" | "none"; candidates: [] }
  | { state: "overflow"; candidates: [] }
  | { state: "complete"; candidates: GrowthMeasurementConfounderCandidate[] };

function dayAfter(date: string) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString();
}

export type GrowthMeasurementConfounderInput = {
  implementationChangeEventId: string | null;
  plan: Pick<
    MeasurementGraph["plan"],
    "projectId" | "baselineStart" | "measurementEnd" | "longMeasurementEnd"
  >;
  metrics: Array<
    Pick<MeasurementGraph["metrics"][number], "entityType" | "entityKey">
  >;
};

export async function discoverGrowthMeasurementConfounders(
  graph: GrowthMeasurementConfounderInput,
): Promise<GrowthMeasurementConfounderDiscovery> {
  const anchorId = graph.implementationChangeEventId;
  if (!anchorId) return { state: "unavailable", candidates: [] };
  const urls = [
    ...new Set(
      graph.metrics
        .filter(({ entityType }) => entityType === "url")
        .map(({ entityKey }) => entityKey),
    ),
  ].toSorted((left, right) => left.localeCompare(right));
  if (urls.length === 0) return { state: "none", candidates: [] };
  const end = graph.plan.longMeasurementEnd ?? graph.plan.measurementEnd;
  const repositoryCandidates =
    await GrowthChangeEventsRepository.listMeasurementConfounderCandidates({
      projectId: graph.plan.projectId,
      urls,
      startAt: `${graph.plan.baselineStart}T00:00:00.000Z`,
      endAt: dayAfter(end),
      excludedChangeEventId: anchorId,
      limit: GROWTH_MEASUREMENT_CONFOUNDER_LIMIT + 1,
    });
  if (repositoryCandidates.length > GROWTH_MEASUREMENT_CONFOUNDER_LIMIT)
    return { state: "overflow", candidates: [] };
  const targets = new Set(urls);
  const candidates = repositoryCandidates.map((candidate) => {
    const matchedUrls = candidate.matchedUrls
      .filter((url) => targets.has(url))
      .toSorted((left, right) => left.localeCompare(right));
    if (matchedUrls.length === 0)
      conflict(
        "Confounder discovery returned an Event without an exact URL match",
      );
    return { event: candidate.event, matchedUrls };
  });
  return candidates.length === 0
    ? { state: "none", candidates: [] }
    : { state: "complete", candidates };
}
