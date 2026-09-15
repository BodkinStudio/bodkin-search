import type { GrowthPlanActionDto } from "@/types/schemas/growth-plan";
import { formatGrowthPreviewDate } from "../GrowthPreviewPresentation";
import { GROWTH_PLAN_STATUS_BADGES } from "./GrowthPlanPresentation";

// The read view of a workstream's work: what it is, where it has got to, and
// the number it is judged on. Evidence lives in the case grid and the chart,
// not here, so the column stays scannable.
export function GrowthPlanWorkList({
  actions,
}: {
  actions: GrowthPlanActionDto[];
}) {
  if (actions.length === 0)
    return (
      <p className="text-[13.5px] text-base-content/60">
        No actions in this workstream yet.
      </p>
    );

  return (
    <ul>
      {actions.map((action) => {
        const badge = GROWTH_PLAN_STATUS_BADGES[action.status];
        return (
          <li
            key={action.id}
            className="grid grid-cols-[auto_minmax(0,1fr)] gap-[14px] border-t border-base-300 py-3 last:border-b [overflow-wrap:anywhere]"
          >
            <span
              className={`badge badge-sm mt-0.5 w-24 justify-center ${badge.className}`}
            >
              {badge.label}
            </span>
            <div className="min-w-0">
              <p className="text-[15px] leading-snug font-medium">
                {action.title}
              </p>
              {action.rationale ? (
                <p className="mt-1 text-[14px] leading-[1.5] text-base-content/70">
                  {action.rationale}
                </p>
              ) : null}
              <p className="mt-1 text-[12.5px] text-base-content/60">
                Due {formatGrowthPreviewDate(action.dueOn)}
                {action.successMeasure
                  ? ` · Measure: ${action.successMeasure}`
                  : ""}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
