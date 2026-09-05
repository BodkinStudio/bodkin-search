import { useQuery } from "@tanstack/react-query";
import {
  CardShell,
  PercentDelta,
  Stat,
} from "@/client/features/dashboard/cardParts";
import { LinkedInPageContentImportForm } from "@/client/features/dashboard/LinkedInPageContentImportForm";
import { getLinkedInPostPerformance } from "@/serverFunctions/linkedin";
import type {
  LinkedInMetric,
  LinkedInPostPerformance,
  LinkedInPostPerformanceItem,
} from "@/shared/linkedin";

function formatMetric(value: LinkedInMetric): string {
  return value === null ? "—" : value.toLocaleString();
}

function formatRate(value: LinkedInMetric): string {
  return value === null ? "—" : `${value.toFixed(2)}%`;
}

function formatDate(value: string): string {
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

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : date.toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

function postLabel(post: LinkedInPostPerformanceItem): string {
  const text = post.postText?.trim();
  if (text) return text.length > 110 ? `${text.slice(0, 107)}…` : text;
  if (post.publishedAt) return `Post published ${formatDate(post.publishedAt)}`;
  return "LinkedIn post";
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

function Overview({ report }: { report: LinkedInPostPerformance }) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium">{report.source.pageName}</p>
        <p className="mt-1 text-xs text-base-content/60">
          {formatDate(report.source.startDate)}–
          {formatDate(report.source.endDate)} ·{" "}
          {report.source.rowCount.toLocaleString()} posts · Imported{" "}
          {formatTimestamp(report.source.importedAt)}
        </p>
      </div>

      {report.completeness === "partial" ? (
        <p role="status" className="text-xs text-warning">
          Some metrics were blank in the LinkedIn export, so totals and
          comparisons may be partial.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat
          label="Impressions"
          value={formatMetric(report.current.impressions)}
          sub={
            report.comparison?.impressions != null &&
            report.current.impressions !== null &&
            report.previous?.impressions != null ? (
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
        <Stat label="Clicks" value={formatMetric(report.current.clicks)} />
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

      <section
        aria-labelledby="linkedin-top-posts"
        className="border-t border-base-300 pt-5"
      >
        <h3 id="linkedin-top-posts" className="text-sm font-semibold">
          Top posts by impressions
        </h3>
        {report.posts.length === 0 ? (
          <p className="mt-3 text-sm text-base-content/60">
            No post rows were available in this import.
          </p>
        ) : (
          <ol className="mt-3 divide-y divide-base-300">
            {report.posts.map((post, index) => (
              <li
                key={`${post.postUrl ?? post.postText ?? post.publishedAt}-${index}`}
                className="flex gap-3 py-3 first:pt-0"
              >
                <span
                  aria-hidden="true"
                  className="w-5 shrink-0 text-xs tabular-nums text-base-content/45"
                >
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  {post.postUrl ? (
                    <a
                      href={post.postUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="line-clamp-2 text-sm font-medium hover:underline"
                    >
                      {postLabel(post)}
                    </a>
                  ) : (
                    <p className="line-clamp-2 text-sm font-medium">
                      {postLabel(post)}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-base-content/55">
                    {formatMetric(post.impressions)} impressions ·{" "}
                    {formatRate(post.providerEngagementRate)} provider
                    engagement rate
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

export function LinkedInPageContentCard({ projectId }: { projectId: string }) {
  const report = useQuery({
    queryKey: ["linkedinPagePosts", projectId],
    queryFn: () => getLinkedInPostPerformance({ data: { projectId } }),
  });
  const existingPeriod =
    report.data?.status === "ok"
      ? {
          startDate: report.data.source.startDate,
          endDate: report.data.source.endDate,
        }
      : null;

  return (
    <CardShell
      title="LinkedIn Page analytics"
      stamp="Manually imported LinkedIn Page Content export"
    >
      <div className="space-y-6">
        {report.isPending ? (
          <LoadingState />
        ) : report.isError ? (
          <ReportError retry={() => void report.refetch()} />
        ) : report.data.status === "ok" ? (
          <Overview report={report.data} />
        ) : (
          <div>
            <p className="text-sm font-medium">
              No LinkedIn analytics imported yet
            </p>
            <p className="mt-1 text-sm text-base-content/65">
              Export Content analytics from your LinkedIn Page, then upload the
              file below.
            </p>
          </div>
        )}

        <section
          aria-labelledby="linkedin-import-heading"
          className="border-t border-base-300 pt-5"
        >
          <h3
            id="linkedin-import-heading"
            className="mb-3 text-sm font-semibold"
          >
            {existingPeriod
              ? "Import another period"
              : "Import Page Content analytics"}
          </h3>
          <LinkedInPageContentImportForm projectId={projectId} />
        </section>
      </div>
    </CardShell>
  );
}
