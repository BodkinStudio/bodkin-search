import type {
  GrowthEvidenceKeyword,
  GrowthPlanEvidenceSeriesDto,
} from "@/types/schemas/growth-plan";
import { formatGrowthPreviewDate } from "../GrowthPreviewPresentation";
import {
  GrowthEvidenceChartSkeleton,
  GrowthEvidenceFailures,
  GrowthEvidenceMonthlyChart,
  GrowthEvidenceNotice,
  formatEvidenceCaption,
  formatMonthDelta,
  hasEvidenceProvenance,
} from "./GrowthEvidenceChart";

// Sequential shading: the darker the cell, the higher the position.
function positionCellClass(position: number | null) {
  if (position === null) return "";
  if (position <= 5) return "bg-primary text-primary-content";
  if (position <= 10) return "bg-primary/60";
  if (position <= 20) return "bg-primary/30";
  return "";
}

// One column per rank-tracking config: the same domain can be tracked in
// several locations, and those are different answers to the same question.
function keywordColumns(items: GrowthEvidenceKeyword[]) {
  const columns = new Map<string, GrowthEvidenceKeyword["positions"][number]>();
  for (const item of items)
    for (const entry of item.positions)
      if (!columns.has(entry.configId)) columns.set(entry.configId, entry);
  const ordered = [...columns.values()].toSorted(
    (a, b) => Number(b.isProject) - Number(a.isProject),
  );
  const domainCounts = new Map<string, number>();
  for (const entry of ordered)
    domainCounts.set(entry.domain, (domainCounts.get(entry.domain) ?? 0) + 1);
  return ordered.map((entry) => ({
    ...entry,
    showLocation: (domainCounts.get(entry.domain) ?? 0) > 1,
  }));
}

function latestCheck(items: GrowthEvidenceKeyword[]) {
  const checked = items
    .flatMap((item) => item.positions)
    .map((entry) => entry.checkedAt)
    .filter((value): value is string => value !== null);
  return checked.length === 0
    ? null
    : checked.reduce((latest, value) => (value > latest ? value : latest));
}

// What the workstream's own targets have done: the clicks its pages earned, and
// where its keywords sit against the domains that rank for them.
export function GrowthWorkstreamChart({
  series,
  pending,
  failed,
}: {
  series?: GrowthPlanEvidenceSeriesDto;
  pending: boolean;
  failed: boolean;
}) {
  if (
    series &&
    series.pages.state === "no_targets" &&
    series.keywords.state === "no_targets"
  )
    return null;
  // No series for this workstream and nothing in flight: there is nothing to say.
  if (!series && !pending && !failed) return null;

  const pages = series?.pages;
  const available = pages?.state === "available" ? pages : null;
  const delta = available ? formatMonthDelta(available.months, "clicks") : null;

  return (
    <section className="rounded-lg border border-base-300 bg-base-100 p-4">
      <h3 className="font-semibold">Evidence from your data</h3>
      {pages && hasEvidenceProvenance(pages) ? (
        <p className="mt-1 text-sm text-base-content/70">
          {formatEvidenceCaption(pages)}
        </p>
      ) : null}
      <div className="mt-3 grid items-start gap-6 lg:grid-cols-2">
        <div className="min-w-0">
          <h4 className="text-xs font-medium tracking-wide text-base-content/60 uppercase">
            Clicks to the targeted pages, per month
          </h4>
          {pending ? <GrowthEvidenceChartSkeleton height={120} /> : null}
          {failed ? <GrowthEvidenceNotice state="error" /> : null}
          {pages && pages.state !== "available" ? (
            <GrowthEvidenceNotice
              state={pages.state}
              totalUrls={pages.totalUrls}
            />
          ) : null}
          {available ? (
            <>
              <GrowthEvidenceMonthlyChart
                months={available.months}
                metric="clicks"
                height={120}
                label="Clicks to the targeted pages, per month"
              />
              {delta ? (
                <p className="mt-2 text-xs tabular-nums text-base-content/60">
                  {delta}
                </p>
              ) : null}
              <GrowthEvidenceFailures pages={available} />
            </>
          ) : null}
        </div>
        <div className="min-w-0">
          <h4 className="text-xs font-medium tracking-wide text-base-content/60 uppercase">
            Where the targeted keywords sit
          </h4>
          {pending ? <GrowthEvidenceChartSkeleton height={120} /> : null}
          {failed ? <GrowthEvidenceNotice state="error" /> : null}
          {series ? <KeywordPositions keywords={series.keywords} /> : null}
        </div>
      </div>
    </section>
  );
}

function KeywordPositions({
  keywords,
}: {
  keywords: GrowthPlanEvidenceSeriesDto["keywords"];
}) {
  if (keywords.state === "no_targets")
    return (
      <p className="mt-3 text-sm text-base-content/60">
        Add keyword targets to actions to compare positions.
      </p>
    );
  if (keywords.state === "capped")
    return (
      <p className="mt-3 text-sm text-base-content/60">
        Not compared: the plan has more than 25 keyword targets.
      </p>
    );
  if (!keywords.rankTracked)
    return (
      <p className="mt-3 text-sm text-base-content/60">
        Add these keywords to rank tracking to compare positions.
      </p>
    );

  const columns = keywordColumns(keywords.items);
  const showVolume = keywords.items.some((item) => item.searchVolume !== null);
  const checkedAt = latestCheck(keywords.items);

  return (
    <>
      <div className="mt-3 overflow-x-auto">
        <table className="table table-xs">
          <thead>
            <tr>
              <th>
                Keyword
                {keywords.totalKeywords > keywords.items.length ? (
                  <span className="ml-1 font-normal text-base-content/60">
                    ({keywords.items.length} of {keywords.totalKeywords})
                  </span>
                ) : null}
              </th>
              {showVolume ? <th className="text-right">Volume</th> : null}
              {columns.map((column) => (
                <th key={column.configId} className="text-center">
                  <span className="block">
                    {column.domain}
                    {column.isProject ? (
                      <span className="ml-1 text-base-content/60">(you)</span>
                    ) : null}
                  </span>
                  {column.showLocation && column.locationName ? (
                    <span className="block font-normal text-base-content/60">
                      {column.locationName}
                    </span>
                  ) : null}
                  {column.device === "mobile" ? (
                    <span className="block text-[10px] font-normal text-base-content/60">
                      mobile
                    </span>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {keywords.items.map((item) => (
              <tr key={item.keyword}>
                <td className="[overflow-wrap:anywhere]">{item.keyword}</td>
                {showVolume ? (
                  <td className="text-right tabular-nums">
                    {item.searchVolume === null
                      ? "—"
                      : item.searchVolume.toLocaleString("en-GB")}
                  </td>
                ) : null}
                {columns.map((column) => {
                  const position =
                    item.positions.find(
                      (candidate) => candidate.configId === column.configId,
                    )?.position ?? null;
                  return (
                    <td
                      key={column.configId}
                      className={`text-center tabular-nums ${positionCellClass(position)}`}
                    >
                      {position ?? "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-base-content/60">
        Darker = higher position · — = not found in latest check
        {checkedAt
          ? ` · Latest check ${formatGrowthPreviewDate(checkedAt)}`
          : ""}
      </p>
    </>
  );
}
