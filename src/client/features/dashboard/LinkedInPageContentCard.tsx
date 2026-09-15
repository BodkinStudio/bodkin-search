import { useQuery } from "@tanstack/react-query";
import {
  CardShell,
  PercentDelta,
  Stat,
} from "@/client/features/dashboard/cardParts";
import { LinkedInPageContentImportForm } from "@/client/features/dashboard/LinkedInPageContentImportForm";
import {
  getLinkedInPageOverview,
  getLinkedInPostPerformance,
} from "@/serverFunctions/linkedin";
import type {
  LinkedInMetric,
  LinkedInPageOverview,
  LinkedInPostPerformance,
  LinkedInPostPerformanceItem,
} from "@/shared/linkedin";

const formatMetric = (value: LinkedInMetric | undefined) =>
  value == null ? "—" : value.toLocaleString();
const formatRate = (value: LinkedInMetric) =>
  value === null ? "—" : `${value.toFixed(2)}%`;
function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.valueOf())
    ? value
    : date.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      });
}
function postLabel(post: LinkedInPostPerformanceItem) {
  return (
    post.postText?.trim() ||
    (post.publishedAt
      ? `Post published ${formatDate(post.publishedAt)}`
      : "LinkedIn post")
  );
}
function LoadingState() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading LinkedIn analytics"
      className="space-y-3"
    >
      <div className="skeleton h-16" />
      <div className="skeleton h-16" />
    </div>
  );
}
function ReportError({ retry }: { retry: () => void }) {
  return (
    <div role="alert" className="space-y-2 text-sm text-base-content/70">
      <p>Couldn&rsquo;t load LinkedIn analytics. Try again shortly.</p>
      <button type="button" className="btn btn-ghost btn-sm" onClick={retry}>
        Retry
      </button>
    </div>
  );
}
function provenance(report: LinkedInPageOverview) {
  return report.source.provider === "linkedin_api"
    ? `${report.source.page.name} · ${formatDate(report.source.dateRange.start)}–${formatDate(report.source.dateRange.end)} · Retrieved ${new Date(report.source.retrievedAt).toLocaleString()}`
    : `${report.source.pageName} · ${formatDate(report.source.startDate)}–${formatDate(report.source.endDate)} · ${report.source.rowCount.toLocaleString()} posts · Imported ${new Date(report.source.importedAt).toLocaleString()} · Manual export`;
}
function Overview({ report }: { report: LinkedInPageOverview }) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium">{provenance(report)}</p>
      </div>
      {report.completeness === "partial" ? (
        <p role="status" className="text-xs text-warning">
          Some metrics were blank or unavailable, so totals and comparisons may
          be partial.
        </p>
      ) : null}
      {"apiFallback" in report &&
      report.apiFallback &&
      typeof report.apiFallback === "object" &&
      "message" in report.apiFallback ? (
        <p role="status" className="text-xs text-warning">
          Manual LinkedIn export because {String(report.apiFallback.message)}
        </p>
      ) : null}
      {report.source.provider === "linkedin_api" &&
      report.source.freshness === "stale" ? (
        <p role="status" className="text-xs text-warning">
          LinkedIn refresh failed; showing retention-compliant cached API data.
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat
          label="Impressions"
          value={formatMetric(report.current.impressions)}
          sub={
            report.comparison?.impressions != null &&
            report.previous?.impressions != null &&
            report.current.impressions !== null ? (
              <PercentDelta
                current={report.current.impressions}
                previous={report.previous.impressions}
              />
            ) : null
          }
        />
        <Stat
          label="Reached"
          value={formatMetric(report.current.membersReached)}
        />
        <Stat
          label="Page views"
          value={formatMetric(report.current.pageViews)}
        />
        <Stat
          label="Reactions"
          value={formatMetric(report.current.reactions)}
        />
      </div>
      <p className="text-xs text-base-content/60">
        {report.comparison
          ? "Compared with the exact preceding period."
          : "Import the exact preceding period to unlock comparisons."}
      </p>
    </div>
  );
}
function ManualPosts({ report }: { report: LinkedInPostPerformance | null }) {
  if (!report || report.status !== "ok") return null;
  return (
    <section
      aria-labelledby="linkedin-top-posts"
      className="border-t border-base-300 pt-5"
    >
      <h3 id="linkedin-top-posts" className="text-sm font-semibold">
        Manual export: top posts by impressions
      </h3>
      {report.posts.length === 0 ? (
        <p className="mt-3 text-sm text-base-content/60">
          No post rows were available in this manual import.
        </p>
      ) : (
        <ol className="mt-3 divide-y divide-base-300">
          {report.posts.map((post, index) => (
            <li
              key={`${post.postUrl ?? post.postText ?? post.publishedAt}-${index}`}
              className="flex gap-3 py-3 first:pt-0"
            >
              <span aria-hidden="true" className="w-5 shrink-0 text-xs">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-medium">
                  {postLabel(post)}
                </p>
                <p className="mt-1 text-xs text-base-content/55">
                  {formatMetric(post.impressions)} impressions ·{" "}
                  {formatRate(post.providerEngagementRate)} provider engagement
                  rate
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
export function LinkedInPageContentCard({ projectId }: { projectId: string }) {
  const overview = useQuery({
    queryKey: ["linkedinPageOverview", projectId],
    queryFn: () => getLinkedInPageOverview({ data: { projectId } }),
  });
  const posts = useQuery({
    queryKey: ["linkedinPagePosts", projectId],
    queryFn: () => getLinkedInPostPerformance({ data: { projectId } }),
  });
  const result = overview.data;
  const stamp =
    result?.status === "ok" && result.source.provider === "linkedin_api"
      ? result.source.freshness === "stale"
        ? "Stale LinkedIn API"
        : "LinkedIn API"
      : "Manual LinkedIn export";
  return (
    <CardShell title="LinkedIn Page analytics" stamp={stamp}>
      <div className="space-y-6">
        {overview.isPending ? (
          <LoadingState />
        ) : overview.isError ? (
          <ReportError retry={() => void overview.refetch()} />
        ) : result?.status === "ok" ? (
          <Overview report={result} />
        ) : (
          <div>
            <p className="text-sm font-medium">
              No LinkedIn analytics imported yet
            </p>
            <p className="mt-1 text-sm text-base-content/65">
              Connect a Page or upload a manual Page Content export below.
            </p>
          </div>
        )}
        <ManualPosts report={posts.data?.status === "ok" ? posts.data : null} />
        <section
          aria-labelledby="linkedin-import-heading"
          className="border-t border-base-300 pt-5"
        >
          <h3
            id="linkedin-import-heading"
            className="mb-3 text-sm font-semibold"
          >
            Manual fallback: upload Page Content analytics
          </h3>
          <LinkedInPageContentImportForm projectId={projectId} />
        </section>
      </div>
    </CardShell>
  );
}
