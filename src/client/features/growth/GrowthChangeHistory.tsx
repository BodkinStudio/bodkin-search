import type { getGrowthChangeLog } from "@/serverFunctions/growthChangeLog";
import { formatGrowthPreviewDate } from "./GrowthPreviewPresentation";
import { GROWTH_CHANGE_LABELS } from "./GrowthChangePresentation";

export function GrowthChangeHistory({
  changes,
  limit,
  title = "Saved changes",
  emptyMessage = "No changes recorded yet. Record completed work so you can refer back to it when reviewing a check.",
  headingLevel = 3,
  caption,
}: Pick<Awaited<ReturnType<typeof getGrowthChangeLog>>, "changes" | "limit"> & {
  title?: string;
  emptyMessage?: string;
  headingLevel?: 3 | 4;
  caption?: string;
}) {
  const Heading = headingLevel === 3 ? "h3" : "h4";
  const EntryHeading = headingLevel === 3 ? "h4" : "h5";
  return (
    <div className="mt-5">
      <Heading className="font-semibold">{title}</Heading>
      <p className="mt-1 text-xs text-base-content/70">
        {caption ??
          `Up to ${limit} most recent manual entries, ordered by date changed. This history does not show that a change caused a result.`}
      </p>
      {changes.length === 0 ? (
        <p className="mt-3 text-sm text-base-content/70">{emptyMessage}</p>
      ) : (
        <ol className="mt-3 divide-y divide-base-300">
          {changes.map((change) => (
            <li key={change.id} className="py-4 first:pt-0">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <EntryHeading className="font-medium">
                  {GROWTH_CHANGE_LABELS[change.changeType]}
                </EntryHeading>
                <p className="text-sm tabular-nums text-base-content/70">
                  Changed {formatGrowthPreviewDate(change.happenedAt)} (UTC)
                </p>
              </div>
              <ul className="mt-1 text-sm text-base-content/70">
                {change.displayUrls.map((url, index) => (
                  <li key={`${index}:${url}`} className="break-all">
                    {url ?? "Page URL withheld"}
                  </li>
                ))}
              </ul>
              {change.description.length > 300 ? (
                <details className="mt-2 max-w-prose text-sm">
                  <summary className="cursor-pointer break-words [overflow-wrap:anywhere]">
                    {change.description.slice(0, 180)}… Read full note
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                    {change.description}
                  </p>
                </details>
              ) : (
                <p className="mt-2 max-w-prose whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">
                  {change.description}
                </p>
              )}
              <p className="mt-2 text-xs text-base-content/70">
                Manually recorded {formatGrowthPreviewDate(change.recordedAt)}{" "}
                (UTC). This note was not collected by a check.
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
