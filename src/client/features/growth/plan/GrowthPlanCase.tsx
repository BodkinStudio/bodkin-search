import {
  GROWTH_EVIDENCE_KIND_DESCRIPTIONS,
  GROWTH_EVIDENCE_KIND_LABELS,
  type GrowthWorkstreamDto,
} from "@/types/schemas/growth-plan";
import { formatGrowthPreviewDate } from "../GrowthPreviewPresentation";
import {
  EYEBROW,
  GROWTH_EVIDENCE_KIND_BADGES,
  orderGrowthEvidence,
} from "./GrowthPlanPresentation";

const CASE_EVIDENCE_LIMIT = 3;

// The right-hand column of a workstream: the test it has set itself, and the
// evidence that is not already drawn as its chart.
export function GrowthPlanCase({
  workstream,
  chartedEvidenceId,
}: {
  workstream: GrowthWorkstreamDto;
  // Evidence already shown as this workstream's chart; it is not repeated here.
  chartedEvidenceId?: string;
}) {
  const evidence = orderGrowthEvidence(
    workstream.actions
      .flatMap((action) => action.evidence)
      .filter((item) => item.id !== chartedEvidenceId),
    CASE_EVIDENCE_LIMIT,
  );
  const measures = workstream.actions.filter((action) => action.successMeasure);
  const hasTargetRange =
    typeof workstream.targetBaseline === "number" &&
    typeof workstream.targetValue === "number";

  return (
    <div className="min-w-0 space-y-4">
      <section className="rounded-lg bg-primary/5 px-[18px] py-4">
        <h3 className={EYEBROW}>How we will know</h3>
        {workstream.targetLabel ? (
          <p className="mt-2 text-[13.5px] [overflow-wrap:anywhere]">
            <span className="font-semibold">{workstream.targetLabel}</span>{" "}
            <span className="tabular-nums text-base-content/70">
              {hasTargetRange
                ? `${workstream.targetBaseline?.toLocaleString("en-GB")} → ${workstream.targetValue?.toLocaleString("en-GB")}`
                : ""}
              {workstream.targetDueOn
                ? `${hasTargetRange ? ", " : ""}judged on ${formatGrowthPreviewDate(workstream.targetDueOn)}`
                : ""}
            </span>
          </p>
        ) : null}
        {measures.length > 0 ? (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[13.5px] [overflow-wrap:anywhere]">
            {measures.map((action) => (
              <li key={action.id}>{action.successMeasure}</li>
            ))}
          </ul>
        ) : null}
        {!workstream.targetLabel && measures.length === 0 ? (
          <p className="mt-2 text-[13.5px] text-base-content/70">
            No target or measure recorded yet.
          </p>
        ) : null}
      </section>

      <section>
        <h3 className={EYEBROW}>What we saw</h3>
        {evidence.length === 0 ? (
          <p className="mt-2 text-[13.5px] text-base-content/70">
            No evidence recorded yet.
          </p>
        ) : (
          <ul className="mt-2 space-y-3">
            {evidence.map((item) => (
              <li key={item.id} className="[overflow-wrap:anywhere]">
                <p className="text-[13.5px]">
                  <span
                    className={`badge badge-sm mr-2 align-middle ${GROWTH_EVIDENCE_KIND_BADGES[item.kind]}`}
                    title={GROWTH_EVIDENCE_KIND_DESCRIPTIONS[item.kind]}
                  >
                    {GROWTH_EVIDENCE_KIND_LABELS[item.kind]}
                  </span>
                  {item.statement}
                </p>
                <p className="mt-1 text-[12.5px] text-base-content/60">
                  {item.sourceLabel}
                  {item.observedOn
                    ? `, observed ${formatGrowthPreviewDate(item.observedOn)}`
                    : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
