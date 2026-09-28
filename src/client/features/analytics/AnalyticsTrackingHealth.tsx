import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, CircleAlert, CircleX, MinusCircle } from "lucide-react";
import { getAnalyticsTrackingHealth } from "@/serverFunctions/analyticsConfiguration";
import type { AnalyticsEnvironment } from "./analytics-search";

function useTrackingHealth(
  projectId: string,
  environment: AnalyticsEnvironment,
) {
  return useQuery({
    queryKey: ["analyticsTrackingHealth", projectId, environment],
    queryFn: () =>
      getAnalyticsTrackingHealth({ data: { projectId, environment } }),
    refetchInterval: 60_000,
  });
}

const relative = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });
function formatAgo(iso: string, now = Date.now()) {
  const minutes = Math.round((Date.parse(iso) - now) / 60_000);
  if (Math.abs(minutes) < 60) return relative.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relative.format(hours, "hour");
  return relative.format(Math.round(hours / 24), "day");
}

const STATUS = {
  live: { dot: "bg-success", label: "Tracking live" },
  quiet: { dot: "bg-warning", label: "Tracking quiet" },
  silent: { dot: "bg-error", label: "Tracking stopped" },
  not_installed: { dot: "bg-base-content/30", label: "No events yet" },
} as const;

// One line under the Analytics tabs: is data arriving, and when did it last.
export function AnalyticsTrackingStatus({
  projectId,
  environment,
  canConfigure,
}: {
  projectId: string;
  environment: AnalyticsEnvironment;
  canConfigure: boolean;
}) {
  const health = useTrackingHealth(projectId, environment);
  if (!health.data) return null;
  const status = STATUS[health.data.status];
  const warnings = health.data.checks.filter(
    (check) => check.state === "warn" || check.state === "fail",
  ).length;
  const text = (
    <>
      <span
        aria-hidden="true"
        className={`size-2 shrink-0 rounded-full ${status.dot}`}
      />
      <span>
        {status.label}
        {health.data.lastEventAt
          ? ` · last event ${formatAgo(health.data.lastEventAt)}`
          : ""}
        {warnings > 0
          ? ` · ${warnings} ${warnings === 1 ? "check needs" : "checks need"} attention`
          : ""}
      </span>
    </>
  );
  const className =
    "inline-flex items-center gap-2 text-xs text-base-content/70";
  return canConfigure ? (
    <Link
      to="/p/$projectId/settings/analytics"
      params={{ projectId }}
      search={{ section: "measurement" }}
      className={`${className} hover:text-base-content hover:underline`}
    >
      {text}
    </Link>
  ) : (
    <span role="status" className={className}>
      {text}
    </span>
  );
}

const CHECK_ICON = {
  pass: <CheckCircle2 className="size-4 text-success" aria-hidden="true" />,
  warn: <CircleAlert className="size-4 text-warning" aria-hidden="true" />,
  fail: <CircleX className="size-4 text-error" aria-hidden="true" />,
  not_applicable: (
    <MinusCircle className="size-4 text-base-content/40" aria-hidden="true" />
  ),
} as const;
const CHECK_LABEL = {
  pass: "OK",
  warn: "Needs attention",
  fail: "Not working",
  not_applicable: "Not applicable",
} as const;

// The full checklist behind the status line: each thing matching depends on,
// with what to do when it is missing.
export function AnalyticsTrackingChecklist({
  projectId,
  environment,
}: {
  projectId: string;
  environment: AnalyticsEnvironment;
}) {
  const health = useTrackingHealth(projectId, environment);
  return (
    <section className="space-y-3 border-t border-base-300 pt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-medium">Tracking health</h3>
        <span className="text-xs text-base-content/60">
          {environment === "test" ? "Test data" : "Live data"} · refreshes every
          minute
        </span>
      </div>
      {health.isPending ? (
        <p role="status" className="text-sm">
          Checking tracking…
        </p>
      ) : health.isError ? (
        <p role="alert" className="text-sm">
          Tracking health could not load.
        </p>
      ) : (
        <>
          {health.data.sources.length > 0 ? (
            <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              {health.data.sources.map((source) => (
                <li key={source.id}>
                  <span className="font-medium">{source.hostname}</span>{" "}
                  <span className="text-base-content/60">
                    {source.lastEventAt
                      ? `last event ${formatAgo(source.lastEventAt)}`
                      : "no events yet"}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <ul className="divide-y divide-base-300 rounded-lg border border-base-300">
            {health.data.checks.map((check) => (
              <li key={check.key} className="flex gap-3 px-4 py-3">
                <span className="mt-0.5">{CHECK_ICON[check.state]}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {check.label}
                    <span className="sr-only">
                      : {CHECK_LABEL[check.state]}
                    </span>
                  </p>
                  <p className="text-sm text-base-content/70">{check.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
