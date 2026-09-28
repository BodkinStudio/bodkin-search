import type {
  GrowthActionEvidenceDto,
  GrowthEvidenceSeriesDto,
  GrowthWorkstreamDto,
} from "@/types/schemas/growth-plan";

export type GrowthPlanSeriesEntry = {
  workstreamId: string;
  evidence: GrowthActionEvidenceDto;
  series: GrowthEvidenceSeriesDto;
};

// Each workstream draws every data series among its evidence, in plan order
// (actions, then evidence). `series` is nullable in the contract and absent
// from older responses, so evidence without one is skipped.
export function allocateGrowthPlanCharts(workstreams: GrowthWorkstreamDto[]) {
  return new Map(
    workstreams.map((workstream) => [
      workstream.id,
      workstream.actions
        .flatMap((action) => action.evidence)
        .flatMap((evidence) =>
          evidence.series
            ? [
                {
                  workstreamId: workstream.id,
                  evidence,
                  series: evidence.series,
                },
              ]
            : [],
        ),
    ]),
  );
}

/** The last recorded value of a monthly series, for "latest reading" labels. */
export function latestMonthlyPoint(entries: GrowthPlanSeriesEntry[] = []) {
  const entry = entries.find((item) => item.series.kind === "monthly");
  if (!entry) return null;
  const points = entry.series.points.filter((point) => point.value !== null);
  return points.at(-1) ?? null;
}
