import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  CardShell,
  moreDetailsClass,
} from "@/client/features/dashboard/cardParts";
import {
  TrafficSourcesList,
  VideoPerformanceList,
} from "@/client/features/dashboard/YouTubeContentSections";
import { YouTubeReportErrorState } from "@/client/features/youtube/YouTubeReportErrorState";
import {
  getYouTubeTrafficSources,
  getYouTubeVideoPerformance,
} from "@/serverFunctions/youtube";

function LoadingRows() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading report">
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="skeleton h-12" />
      ))}
    </div>
  );
}

function UnexpectedError({ retry }: { retry: () => void }) {
  return (
    <div role="alert" className="space-y-2 text-sm text-base-content/60">
      <p>Couldn&rsquo;t load this YouTube report. Try again shortly.</p>
      <button type="button" className="btn btn-ghost btn-sm" onClick={retry}>
        Retry
      </button>
    </div>
  );
}

function PartialData() {
  return (
    <p role="status" className="mb-3 text-xs text-warning">
      YouTube omitted some analytics or metadata for this report.
    </p>
  );
}

export function YouTubeContentCard({ projectId }: { projectId: string }) {
  const videoReport = useQuery({
    queryKey: ["youtubeVideoPerformance", projectId],
    queryFn: () => getYouTubeVideoPerformance({ data: { projectId } }),
  });
  const trafficReport = useQuery({
    queryKey: ["youtubeTrafficSources", projectId],
    queryFn: () => getYouTubeTrafficSources({ data: { projectId } }),
  });

  return (
    <CardShell
      title="YouTube content"
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
      <div className="space-y-5">
        <section aria-labelledby="youtube-top-videos">
          <h3 id="youtube-top-videos" className="mb-3 text-sm font-semibold">
            Top videos by watch time
          </h3>
          {videoReport.isPending ? (
            <LoadingRows />
          ) : videoReport.isError ? (
            <UnexpectedError retry={() => void videoReport.refetch()} />
          ) : videoReport.data.status === "error" ? (
            <YouTubeReportErrorState
              projectId={projectId}
              {...videoReport.data.error}
              retry={() => void videoReport.refetch()}
            />
          ) : (
            <>
              {videoReport.data.completeness !== "complete" ? (
                <PartialData />
              ) : null}
              <VideoPerformanceList report={videoReport.data} />
            </>
          )}
        </section>

        <section
          aria-labelledby="youtube-traffic-sources"
          className="border-t border-base-300 pt-5"
        >
          <h3
            id="youtube-traffic-sources"
            className="mb-1 text-sm font-semibold"
          >
            Traffic sources
          </h3>
          <p className="mb-3 text-xs text-base-content/55">
            Share among source views YouTube reported numerically.
          </p>
          {trafficReport.isPending ? (
            <LoadingRows />
          ) : trafficReport.isError ? (
            <UnexpectedError retry={() => void trafficReport.refetch()} />
          ) : trafficReport.data.status === "error" ? (
            <YouTubeReportErrorState
              projectId={projectId}
              {...trafficReport.data.error}
              retry={() => void trafficReport.refetch()}
            />
          ) : (
            <>
              {trafficReport.data.completeness !== "complete" ? (
                <PartialData />
              ) : null}
              <TrafficSourcesList report={trafficReport.data} />
            </>
          )}
        </section>
      </div>
    </CardShell>
  );
}
