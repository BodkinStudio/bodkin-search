import { PercentDelta } from "@/client/features/dashboard/cardParts";
import { SafeExternalLink } from "@/client/components/SafeExternalLink";
import { getSafeExternalUrl } from "@/client/components/table/url";
import { formatCount } from "@/client/features/search-performance/SearchPerformanceColumns";
import type {
  YouTubeTrafficSources,
  YouTubeVideoPerformance,
} from "@/shared/youtube";

const SOURCE_LABELS: Record<string, string> = {
  ADVERTISING: "YouTube advertising",
  ANNOTATION: "Video annotations",
  END_SCREEN: "End screens",
  EXT_URL: "External sites and apps",
  HASHTAGS: "Hashtag pages",
  LIVE_REDIRECT: "Live redirects",
  NOTIFICATION: "Notifications",
  PLAYLIST: "Playlists",
  RELATED_VIDEO: "Suggested videos",
  SHORTS: "Shorts feed",
  SOUND_PAGE: "Sound pages",
  SUBSCRIBER: "Subscriptions",
  YT_CHANNEL: "Channel pages",
  YT_OTHER_PAGE: "Other YouTube features",
  YT_SEARCH: "YouTube search",
};

function sourceLabel(sourceType: string) {
  return SOURCE_LABELS[sourceType] ?? sourceType;
}

function metric(value: number | null, suffix = "") {
  return value === null ? "not reported" : `${formatCount(value)}${suffix}`;
}

export function VideoPerformanceList({
  report,
}: {
  report: YouTubeVideoPerformance;
}) {
  if (report.videos.length === 0) {
    return (
      <p role="status" className="text-sm text-base-content/60">
        No video performance was reported for this period.
      </p>
    );
  }

  return (
    <ol className="divide-y divide-base-300">
      {report.videos.slice(0, 5).map((video, index) => {
        const thumbnailUrl = video.thumbnailUrl
          ? getSafeExternalUrl(video.thumbnailUrl)
          : null;
        return (
          <li key={video.videoId} className="flex gap-3 py-3 first:pt-0">
            <span className="w-4 shrink-0 pt-1 text-xs tabular-nums text-base-content/45">
              {index + 1}
            </span>
            {thumbnailUrl ? (
              <img
                src={thumbnailUrl}
                alt=""
                className="aspect-video w-20 shrink-0 rounded object-cover"
                loading="lazy"
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <SafeExternalLink
                url={video.url}
                label={video.title ?? `Video ${video.videoId}`}
                className="inline-flex max-w-full items-center gap-1 text-sm font-medium"
              />
              <p className="mt-1 text-xs text-base-content/60">
                {metric(video.current.views)} views ·{" "}
                {metric(video.current.estimatedMinutesWatched, " min")} watched
              </p>
              <div className="mt-1 text-xs text-base-content/60">
                {video.current.views !== null &&
                video.previous.views !== null ? (
                  <PercentDelta
                    current={video.current.views}
                    previous={video.previous.views}
                  />
                ) : (
                  <span>Previous period not reported</span>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function TrafficSourcesList({
  report,
}: {
  report: YouTubeTrafficSources;
}) {
  if (report.sources.length === 0) {
    return (
      <p role="status" className="text-sm text-base-content/60">
        No traffic-source data was reported for this period.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {report.sources.slice(0, 5).map((source) => {
        const share = source.currentReportedRowsShare;
        const percentage = share === null ? null : Math.round(share * 100);
        return (
          <li key={source.sourceType}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span
                className="min-w-0 break-all font-medium"
                title={source.sourceType}
              >
                {sourceLabel(source.sourceType)}
              </span>
              <span className="shrink-0 tabular-nums text-base-content/60">
                {percentage === null ? "—" : `${percentage}%`}
              </span>
            </div>
            <progress
              className="progress progress-primary mt-1 h-1.5 w-full"
              value={share === null ? 0 : Math.min(1, Math.max(0, share))}
              max={1}
              aria-label={`${sourceLabel(source.sourceType)}: ${percentage ?? "unknown"}% of reported source views`}
            />
            <p className="mt-1 text-xs text-base-content/60">
              {metric(source.current.views)} views ·{" "}
              {metric(source.current.estimatedMinutesWatched, " min")} watched
            </p>
          </li>
        );
      })}
    </ul>
  );
}
