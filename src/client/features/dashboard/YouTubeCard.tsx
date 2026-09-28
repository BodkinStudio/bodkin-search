import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CardShell,
  moreDetailsClass,
  PercentDelta,
  Stat,
} from "@/client/features/dashboard/cardParts";
import { formatCount } from "@/client/features/search-performance/SearchPerformanceColumns";
import { getYouTubeChannelOverview } from "@/serverFunctions/youtube";
import { YouTubeReportErrorState } from "@/client/features/youtube/YouTubeReportErrorState";

function formatDay(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function value(metric: number | null, format = formatCount): string {
  return metric === null ? "—" : format(metric);
}

function formatDuration(seconds: number): string {
  const wholeSeconds = Math.round(seconds);
  const minutes = Math.floor(wholeSeconds / 60);
  const remainingSeconds = wholeSeconds % 60;
  return minutes > 0
    ? `${minutes}m ${remainingSeconds}s`
    : `${remainingSeconds}s`;
}

function delta(current: number | null, previous: number | null) {
  return current !== null && previous !== null ? (
    <PercentDelta current={current} previous={previous} />
  ) : undefined;
}

function ViewsTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number | null }>;
  label?: string;
}) {
  if (!active || !payload?.length || payload[0].value === null) return null;
  return (
    <div className="rounded-md border border-base-300 bg-base-100 px-3 py-2 shadow-sm">
      <p className="text-xs text-base-content/60">
        {label ? formatDay(label) : ""}
      </p>
      <p className="text-sm font-medium tabular-nums">
        {formatCount(payload[0].value)} views
      </p>
    </div>
  );
}

export function YouTubeCard({ projectId }: { projectId: string }) {
  const overview = useQuery({
    queryKey: ["youtubeAnalytics", projectId],
    queryFn: () => getYouTubeChannelOverview({ data: { projectId } }),
    enabled: true,
  });

  return (
    <CardShell
      title="YouTube channel"
      stamp="YouTube Analytics · last 28 days"
      action={
        <Link
          to="/p/$projectId/settings/integrations"
          params={{ projectId }}
          hash="youtube"
          className={moreDetailsClass}
        >
          Manage
        </Link>
      }
    >
      {overview.isPending ? (
        <div className="space-y-3" aria-busy>
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="skeleton h-16" />
            ))}
          </div>
          <div className="skeleton h-24" />
        </div>
      ) : overview.isError ? (
        <div role="alert" className="space-y-2 text-sm text-base-content/60">
          <p>Couldn&rsquo;t load YouTube Analytics data. Try again shortly.</p>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void overview.refetch()}
          >
            Retry
          </button>
        </div>
      ) : overview.data?.status === "error" ? (
        <YouTubeReportErrorState
          projectId={projectId}
          code={overview.data.error.code}
          message={overview.data.error.message}
          retry={() => void overview.refetch()}
        />
      ) : overview.data ? (
        <div className="space-y-4">
          {overview.data.completeness === "partial" ||
          overview.data.warnings.length > 0 ? (
            <p role="status" className="text-sm text-warning">
              Recent YouTube Analytics data may be incomplete.
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <Stat
              label="Views"
              value={value(overview.data.current.views)}
              sub={delta(
                overview.data.current.views,
                overview.data.previous.views,
              )}
            />
            <Stat
              label="Watch time"
              value={value(
                overview.data.current.estimatedMinutesWatched,
                (minutes) => `${formatCount(minutes)} min`,
              )}
              sub={delta(
                overview.data.current.estimatedMinutesWatched,
                overview.data.previous.estimatedMinutesWatched,
              )}
            />
            <Stat
              label="Net subscribers"
              value={value(overview.data.current.netSubscribers)}
              sub={delta(
                overview.data.current.netSubscribers,
                overview.data.previous.netSubscribers,
              )}
            />
            <Stat
              label="Avg. view duration"
              value={value(
                overview.data.current.averageViewDuration,
                formatDuration,
              )}
              sub={delta(
                overview.data.current.averageViewDuration,
                overview.data.previous.averageViewDuration,
              )}
            />
          </div>
          {overview.data.trend.some((point) => point.views !== null) ? (
            <>
              <div className="sr-only">
                <p>Daily views data. Missing dates are not filled.</p>
                <ul>
                  {overview.data.trend.map((point) => (
                    <li key={point.date}>
                      {point.date}: {point.views ?? "not reported"} views
                    </li>
                  ))}
                </ul>
              </div>
              <div className="h-24" aria-hidden="true">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={overview.data.trend}
                    margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
                  >
                    <XAxis dataKey="date" hide />
                    <YAxis hide domain={[0, "auto"]} />
                    <Tooltip
                      content={<ViewsTooltip />}
                      cursor={{ stroke: "currentColor", strokeOpacity: 0.2 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="views"
                      connectNulls={false}
                      stroke="var(--color-primary)"
                      strokeWidth={2}
                      fill="var(--color-primary)"
                      fillOpacity={0.08}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <p role="status" className="text-sm text-base-content/60">
              No YouTube view data was reported for this period yet.
            </p>
          )}
        </div>
      ) : null}
    </CardShell>
  );
}
