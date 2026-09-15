import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { updateGrowthPlanNarrative } from "@/serverFunctions/growthPlan";
import {
  GROWTH_EVIDENCE_KIND_DESCRIPTIONS,
  GROWTH_EVIDENCE_KIND_LABELS,
  type GrowthActionEvidenceDto,
  type GrowthWorkstreamDto,
} from "@/types/schemas/growth-plan";
import { formatGrowthPreviewDate } from "../GrowthPreviewPresentation";
import { GrowthEvidenceSeriesChart } from "./GrowthEvidenceSeriesChart";
import {
  GrowthPlanNarrativeForm,
  type GrowthPlanNarrativeDraft,
} from "./GrowthPlanNarrativeForm";
import {
  CARD,
  EYEBROW,
  GROWTH_EVIDENCE_KIND_BADGES,
} from "./GrowthPlanPresentation";
import type { GrowthPlanSeriesEntry } from "./growthPlanSeries";

const DEFAULT_LEDE =
  "What we are working on, why, and how we will know it worked.";

export function GrowthPlanHero({
  projectId,
  thesis,
  lede,
  target,
  series,
  fallbackEvidence,
  editing,
}: {
  projectId: string;
  thesis?: string | null;
  lede?: string | null;
  // The first active workstream carrying a target, or null when none does.
  target: GrowthWorkstreamDto | null;
  // Up to two monthly series, drawn beside the thesis.
  series: GrowthPlanSeriesEntry[];
  // Shown instead when the plan has no series yet, so the column is never empty.
  fallbackEvidence: GrowthActionEvidenceDto[];
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

  const baseline = target?.targetBaseline;
  const value = target?.targetValue;
  const showMeter =
    typeof baseline === "number" && typeof value === "number" && value > 0;

  return (
    <section className="grid items-start gap-10 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <div className="min-w-0">
        <p className={EYEBROW}>Why this plan exists</p>
        <h1 className="mt-3 max-w-[20ch] text-[clamp(28px,3.4vw,40px)] leading-[1.1] font-semibold tracking-[-0.01em] text-balance">
          {thesis || "Growth plan"}
        </h1>
        <p className="mt-4 max-w-[56ch] text-[15px] whitespace-pre-wrap text-base-content/70">
          {lede || DEFAULT_LEDE}
        </p>
        {editing ? (
          <div className="mt-3">
            <button
              type="button"
              className="btn btn-ghost btn-xs"
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
        {target?.targetLabel ? (
          <div className={`mt-6 ${CARD} px-[18px] py-4`}>
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              {showMeter ? (
                <p className="text-[38px] leading-none font-semibold tabular-nums">
                  {baseline.toLocaleString("en-GB")}
                  <span className="ml-2 text-base font-medium text-base-content/60">
                    of {value.toLocaleString("en-GB")}
                  </span>
                </p>
              ) : null}
              <p className="max-w-[24ch] text-[13px] text-base-content/70 md:text-right">
                {target.targetLabel}
              </p>
            </div>
            {showMeter ? (
              <progress
                className="progress progress-primary mt-4 w-full"
                aria-label={target.targetLabel}
                value={Math.max(baseline, 0)}
                max={value}
              />
            ) : null}
            <div className="mt-2 flex flex-wrap justify-between gap-x-6 gap-y-1 text-xs text-base-content/60">
              <span>
                {target.targetDueOn
                  ? `Judged on ${formatGrowthPreviewDate(target.targetDueOn)}`
                  : `Workstream ${target.position}: ${target.title}`}
              </span>
              <span>Target is proposed, not forecast</span>
            </div>
          </div>
        ) : null}
      </div>
      <div className="grid min-w-0 gap-3">
        {series.length > 0
          ? series.map((entry) => (
              <div key={entry.series.id} className={`${CARD} px-[18px] py-4`}>
                <GrowthEvidenceSeriesChart evidence={entry.evidence} />
              </div>
            ))
          : null}
        {series.length === 0 && fallbackEvidence.length > 0 ? (
          <div className={`${CARD} px-[18px] py-4`}>
            <h2 className={EYEBROW}>What we saw</h2>
            <ul className="mt-3 space-y-3 text-[13.5px]">
              {fallbackEvidence.map((item) => (
                <li key={item.id} className="[overflow-wrap:anywhere]">
                  <span
                    className={`badge badge-sm mr-2 align-middle ${GROWTH_EVIDENCE_KIND_BADGES[item.kind]}`}
                    title={GROWTH_EVIDENCE_KIND_DESCRIPTIONS[item.kind]}
                  >
                    {GROWTH_EVIDENCE_KIND_LABELS[item.kind]}
                  </span>
                  {item.statement}{" "}
                  <span className="text-base-content/60">
                    — {item.sourceLabel}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
