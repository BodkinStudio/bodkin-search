import type { GrowthWorkHistory } from "@/types/schemas/growth-work";
import {
  GROWTH_WORK_STATUS_LABELS,
  formatGrowthWorkTimestamp,
} from "./GrowthWorkPresentation";

export function GrowthWorkHistoryList({ data }: { data: GrowthWorkHistory }) {
  return (
    <div>
      <p className="text-xs text-base-content/70">
        Up to {data.limit} most recent entries, newest first. Times are UTC.
      </p>
      {data.events.length === 0 ? (
        <p className="mt-3 text-sm text-base-content/70">
          No status history is available for this work.
        </p>
      ) : (
        <ol className="mt-3 divide-y divide-base-300">
          {data.events.map((event) => (
            <li key={event.version} className="py-3 first:pt-0">
              <p className="font-medium">
                {event.fromStatus
                  ? `${GROWTH_WORK_STATUS_LABELS[event.fromStatus]} to `
                  : ""}
                {GROWTH_WORK_STATUS_LABELS[event.toStatus]}
              </p>
              <time
                dateTime={event.recordedAt}
                className="mt-1 block text-xs tabular-nums text-base-content/70"
              >
                {formatGrowthWorkTimestamp(event.recordedAt)} (UTC)
              </time>
              {event.note ? (
                <p className="mt-2 max-w-prose whitespace-pre-wrap [overflow-wrap:anywhere]">
                  {event.note}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
