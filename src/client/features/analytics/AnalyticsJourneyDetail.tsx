import { calendarDay } from "@/shared/analytics/calendar";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Globe, MousePointer2, CheckCircle2 } from "lucide-react";
import { getAnalyticsJourney } from "@/serverFunctions/analytics";
export function AnalyticsJourneyDetail({
  projectId,
  contextId,
  environment,
  from,
  to,
  timezone = "UTC",
  onClose,
}: {
  projectId: string;
  contextId: string;
  environment: "test" | "production";
  from?: string;
  to?: string;
  timezone?: string;
  onClose: () => void;
}) {
  const query = useQuery({
    queryKey: ["analyticsJourney", projectId, contextId, environment, from, to],
    queryFn: () =>
      getAnalyticsJourney({
        data: { projectId, contextId, environment, from, to },
      }),
  });
  return (
    <section className="space-y-5" aria-labelledby="journey-title">
      <button className="btn btn-ghost btn-sm" onClick={onClose}>
        <ArrowLeft className="size-4" />
        Back to journeys
      </button>
      <div>
        <h2 id="journey-title" className="text-xl font-semibold">
          Visitor {contextId.slice(0, 6).toUpperCase()}
        </h2>
        <p className="mt-1 text-sm text-base-content/70">
          Observed activity, in order. Inferred acquisition does not merge
          personal histories.
        </p>
      </div>
      {query.isPending ? (
        <p role="status">Loading journey…</p>
      ) : query.isError ? (
        <div role="alert">
          <p>Could not load this journey. Your access may have changed.</p>
          <button
            className="btn btn-sm mt-3"
            onClick={() => {
              void query.refetch();
            }}
          >
            Try again
          </button>
        </div>
      ) : (
        <ol className="max-w-3xl">
          {query.data.map((event, i) => {
            const day = calendarDay(event.receivedAt, timezone);
            const showDay =
              i === 0 ||
              calendarDay(query.data[i - 1].receivedAt, timezone) !== day;
            const Icon =
              event.name === "page_view"
                ? Globe
                : event.name === "acquisition_clicked"
                  ? MousePointer2
                  : CheckCircle2;
            return (
              <li key={event.eventId}>
                {showDay && (
                  <h3 className="pb-3 pt-6 text-sm font-semibold">
                    {day}{" "}
                    <span className="font-normal text-base-content/60">
                      {timezone}
                    </span>
                  </h3>
                )}
                <div className="flex gap-4 border-b border-base-300/60 py-4">
                  <div className="mt-0.5 rounded-full bg-base-200 p-2">
                    <Icon className="size-4 text-base-content/70" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {event.name === "acquisition_clicked" && event.action
                        ? `Clicked ${event.action.replaceAll("_", " ")}`
                        : event.name === "page_view"
                          ? "Viewed page"
                          : event.name.replaceAll("_", " ")}
                    </p>
                    {event.name === "acquisition_clicked" &&
                    (event.destination || event.placement) ? (
                      <p className="mt-1 text-xs text-base-content/70">
                        {[
                          event.destination && `to ${event.destination}`,
                          event.placement && `from the ${event.placement}`,
                        ]
                          .filter(Boolean)
                          .join(", ")}
                      </p>
                    ) : null}
                    {event.pagePath && (
                      <p className="mt-1 break-all text-sm text-base-content/70">
                        {event.pageHost}
                        {event.pagePath}
                      </p>
                    )}
                    {event.channel && (
                      <p className="mt-1 text-xs text-base-content/70">
                        <span className="badge badge-sm badge-ghost mr-2">
                          {event.channel}
                        </span>
                        {[
                          [
                            event.campaignSource,
                            event.campaignMedium,
                            event.campaignName,
                          ]
                            .filter(Boolean)
                            .join(" / "),
                          event.campaignContent &&
                            `content ${event.campaignContent}`,
                          event.campaignTerm && `term ${event.campaignTerm}`,
                          event.clickIdType && `${event.clickIdType} click`,
                          event.referrerHost &&
                            event.referrerHost !== event.pageHost &&
                            `from ${event.referrerHost}${event.referrerPath ?? ""}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                  </div>
                  <time
                    className="text-xs tabular-nums text-base-content/60"
                    dateTime={event.receivedAt}
                  >
                    {new Intl.DateTimeFormat("en-GB", {
                      timeZone: timezone,
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    }).format(new Date(event.receivedAt))}
                  </time>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
