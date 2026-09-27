import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { updateGrowthPlanNarrative } from "@/serverFunctions/growthPlan";
import type { GrowthWorkstreamDto } from "@/types/schemas/growth-plan";
import { formatGrowthPreviewDate } from "../GrowthPreviewPresentation";
import { formatMonthLabel } from "./GrowthEvidenceChart";
import {
  GrowthPlanNarrativeForm,
  type GrowthPlanNarrativeDraft,
} from "./GrowthPlanNarrativeForm";
import { CARD, EYEBROW } from "./GrowthPlanPresentation";
import {
  latestMonthlyPoint,
  type GrowthPlanSeriesEntry,
} from "./growthPlanSeries";

export function GrowthPlanHero({
  projectId,
  thesis,
  lede,
  target,
  targetSeries,
  editing,
}: {
  projectId: string;
  thesis?: string | null;
  lede?: string | null;
  // The first active workstream carrying a target, or null when none does.
  target: GrowthWorkstreamDto | null;
  // That workstream's own charts; the first monthly one gives the latest reading.
  targetSeries?: GrowthPlanSeriesEntry[];
  editing: boolean;
}) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const save = useMutation({
    mutationKey: ["growthPlanNarrative", projectId],
    mutationFn: (draft: GrowthPlanNarrativeDraft) =>
      updateGrowthPlanNarrative({ data: { ...draft, projectId } }),
    retry: false,
    onSuccess: async () => {
      setOpen(false);
      await client.invalidateQueries({ queryKey: ["growthPlan", projectId] });
    },
  });

  return (
    <section className="grid items-start gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <div className="min-w-0">
        <p className={EYEBROW}>The plan in one line</p>
        <h2 className="mt-2 max-w-[28ch] text-3xl leading-tight font-semibold text-balance">
          {thesis || "Growth plan"}
        </h2>
        {lede ? (
          <p className="mt-3 max-w-[60ch] whitespace-pre-wrap text-base-content/70">
            {lede}
          </p>
        ) : null}
        {editing ? (
          <div className="mt-3">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setOpen((current) => !current)}
            >
              Edit thesis and lede
            </button>
            {open ? (
              <GrowthPlanNarrativeForm
                thesis={thesis ?? null}
                lede={lede ?? null}
                pending={save.isPending}
                error={
                  save.error
                    ? getStandardErrorMessage(
                        save.error,
                        "The narrative was not saved.",
                      )
                    : null
                }
                onSubmit={(draft) => save.mutate(draft)}
                onCancel={() => setOpen(false)}
              />
            ) : null}
          </div>
        ) : null}
      </div>
      {target?.targetLabel ? (
        <GrowthPlanTarget target={target} series={targetSeries} />
      ) : null}
    </section>
  );
}

// The headline target as a range from where we started to where we said we
// would get. Progress is only drawn from a real reading in the workstream's
// own series, never inferred from the baseline.
function GrowthPlanTarget({
  target,
  series,
}: {
  target: GrowthWorkstreamDto;
  series?: GrowthPlanSeriesEntry[];
}) {
  const baseline = target.targetBaseline;
  const goal = target.targetValue;
  const hasRange = typeof baseline === "number" && typeof goal === "number";
  const latest = hasRange ? latestMonthlyPoint(series) : null;
  const progress =
    hasRange && latest?.value != null && goal !== baseline
      ? Math.min(Math.max((latest.value - baseline) / (goal - baseline), 0), 1)
      : null;

  return (
    <div className={`${CARD} p-5`}>
      <p className={EYEBROW}>Target</p>
      <p className="mt-2 font-medium [overflow-wrap:anywhere]">
        {target.targetLabel}
      </p>
      {hasRange ? (
        <p className="mt-3 flex flex-wrap items-baseline gap-x-2 text-2xl font-semibold tabular-nums">
          {baseline.toLocaleString("en-GB")}
          <span aria-hidden="true" className="text-base-content/40">
            →
          </span>
          <span className="sr-only">to</span>
          {goal.toLocaleString("en-GB")}
        </p>
      ) : null}
      {latest?.value != null ? (
        <>
          <p className="mt-2 text-sm text-base-content/70">
            Latest reading{" "}
            <span className="font-medium tabular-nums text-base-content">
              {latest.value.toLocaleString("en-GB")}
            </span>{" "}
            in {formatMonthLabel(latest.label)}
          </p>
          {progress !== null ? (
            <progress
              className="progress progress-primary mt-3 w-full"
              aria-label={`Progress from baseline to target: ${Math.round(progress * 100)}%`}
              value={progress}
              max={1}
            />
          ) : null}
        </>
      ) : null}
      <p className="mt-3 text-xs text-base-content/60">
        {target.targetDueOn
          ? `Judged on ${formatGrowthPreviewDate(target.targetDueOn)}`
          : `Workstream ${target.position}: ${target.title}`}
        {" · "}a proposal we are prepared to be judged on, not a forecast
      </p>
    </div>
  );
}
