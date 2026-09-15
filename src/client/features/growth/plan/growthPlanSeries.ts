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

// Evidence in plan order: workstreams, then actions, then evidence. `series` is
// nullable in the contract and absent from older responses, so both are skipped.
function collectGrowthPlanSeries(
  workstreams: GrowthWorkstreamDto[],
): GrowthPlanSeriesEntry[] {
  return workstreams.flatMap((workstream) =>
    workstream.actions.flatMap((action) =>
      action.evidence.flatMap((evidence) =>
        evidence.series
          ? [{ workstreamId: workstream.id, evidence, series: evidence.series }]
          : [],
      ),
    ),
  );
}

// Each series is drawn once: the hero takes the first two monthly ones, each
// workstream takes its first unused series of any kind, and the tile sparkline
// takes the next unused monthly one.
export function allocateGrowthPlanCharts(workstreams: GrowthWorkstreamDto[]) {
  const all = collectGrowthPlanSeries(workstreams);
  const used = new Set<string>();
  const hero = all
    .filter((entry) => entry.series.kind === "monthly")
    .slice(0, 2);
  for (const entry of hero) used.add(entry.series.id);

  const byWorkstream = new Map<string, GrowthPlanSeriesEntry>();
  for (const entry of all) {
    if (used.has(entry.series.id) || byWorkstream.has(entry.workstreamId))
      continue;
    byWorkstream.set(entry.workstreamId, entry);
    used.add(entry.series.id);
  }

  const tile =
    all.find(
      (entry) => entry.series.kind === "monthly" && !used.has(entry.series.id),
    ) ?? null;
  return { hero, byWorkstream, tile };
}
