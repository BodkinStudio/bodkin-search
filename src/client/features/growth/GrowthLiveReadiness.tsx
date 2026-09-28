import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { getGrowthChecksOverview } from "@/serverFunctions/growthChecks";
import {
  getGrowthSettings,
  updateGrowthSettings,
} from "@/serverFunctions/growth";
import { getProjectAccess } from "@/serverFunctions/projects";
import type { GrowthCheckOverview } from "@/types/schemas/growth-checks";

type GrowthSettings = Awaited<ReturnType<typeof getGrowthSettings>>;

type GrowthLiveReadinessSnapshot = {
  domain: string | null;
  growthEnabled: boolean;
  keyPageCount: number;
  gscConnected: boolean;
};

type GrowthLiveReadinessStep =
  | "domain"
  | "growth"
  | "key_pages"
  | "gsc"
  | "ready";

export function nextGrowthLiveReadinessStep(
  snapshot: GrowthLiveReadinessSnapshot,
): GrowthLiveReadinessStep {
  if (!snapshot.domain) return "domain";
  if (!snapshot.growthEnabled) return "growth";
  if (snapshot.keyPageCount === 0) return "key_pages";
  if (!snapshot.gscConnected) return "gsc";
  return "ready";
}

export function growthCheckHasGscConnection(
  setup: GrowthCheckOverview["setup"],
) {
  switch (setup) {
    case "missing_connection":
      return false;
    case "missing_key_pages":
    case "ready":
      return true;
  }
}

export function enabledGrowthSettingsInput(
  projectId: string,
  settings: GrowthSettings,
) {
  return {
    projectId,
    growthEnabled: true,
    reportTimezone: settings.reportTimezone,
    reportCadence: settings.reportCadence,
    reportDay: settings.reportDay,
    defaultBaselineDays: settings.defaultBaselineDays,
    defaultCooldownDays: settings.defaultCooldownDays,
    defaultPrimaryWindowDays: settings.defaultPrimaryWindowDays,
    defaultLongWindowDays: settings.defaultLongWindowDays,
  };
}

export function GrowthLiveReadiness({ projectId }: { projectId: string }) {
  const client = useQueryClient();
  const project = useQuery({
    queryKey: ["projectAccess", projectId],
    queryFn: () => getProjectAccess({ data: { projectId } }),
    // The route guard keeps this query indefinitely, but readiness must
    // re-check it after the user returns from adding a missing domain.
    staleTime: 0,
    retry: false,
  });
  const settings = useQuery({
    queryKey: ["growthSettings", projectId],
    queryFn: () => getGrowthSettings({ data: { projectId } }),
    retry: false,
  });
  const checks = useQuery({
    queryKey: ["growthChecks", projectId],
    queryFn: () => getGrowthChecksOverview({ data: { projectId } }),
    retry: false,
  });
  const enable = useMutation({
    mutationFn: () =>
      updateGrowthSettings({
        data: enabledGrowthSettingsInput(projectId, settings.data!),
      }),
    onSuccess: (saved) => {
      client.setQueryData(["growthSettings", projectId], saved);
    },
  });

  const retry = () => {
    if (project.isError) void project.refetch();
    if (settings.isError) void settings.refetch();
    if (checks.isError) void checks.refetch();
  };

  if (project.isPending || settings.isPending || checks.isPending) {
    return (
      <section
        id="growth-live-readiness"
        aria-labelledby="growth-live-readiness-title"
        className="rounded-lg border border-base-300 bg-base-100 p-4 sm:p-6"
      >
        <h2
          id="growth-live-readiness-title"
          className="text-balance text-lg font-semibold"
        >
          Ready for real data
        </h2>
        <div
          role="status"
          aria-busy="true"
          className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
        >
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={index}
              className="min-h-20 rounded-lg border border-base-300 bg-base-200 p-3"
            />
          ))}
          <span className="sr-only">Loading live Growth readiness…</span>
        </div>
      </section>
    );
  }

  if (project.isError || settings.isError || checks.isError) {
    return (
      <section
        id="growth-live-readiness"
        aria-labelledby="growth-live-readiness-title"
        className="rounded-lg border border-base-300 bg-base-100 p-4 sm:p-6"
      >
        <h2
          id="growth-live-readiness-title"
          className="text-balance text-lg font-semibold"
        >
          Ready for real data
        </h2>
        <div role="alert" className="alert alert-error mt-4 flex-wrap">
          <p className="flex-1">Live Growth readiness could not be loaded.</p>
          <button type="button" className="btn btn-sm" onClick={retry}>
            Retry setup
          </button>
        </div>
      </section>
    );
  }

  const snapshot: GrowthLiveReadinessSnapshot = {
    domain: project.data.domain,
    growthEnabled: settings.data.growthEnabled,
    keyPageCount: checks.data.keyPageCount,
    gscConnected: growthCheckHasGscConnection(checks.data.setup),
  };

  return (
    <GrowthLiveReadinessPanel
      projectId={projectId}
      snapshot={snapshot}
      enablePending={enable.isPending}
      enableError={
        enable.isError
          ? getStandardErrorMessage(
              enable.error,
              "Growth could not be enabled for this project.",
            )
          : null
      }
      onEnable={() => enable.mutate()}
    />
  );
}

export function GrowthLiveReadinessPanel({
  projectId,
  snapshot,
  enablePending,
  enableError,
  onEnable,
}: {
  projectId: string;
  snapshot: GrowthLiveReadinessSnapshot;
  enablePending: boolean;
  enableError: string | null;
  onEnable: () => void;
}) {
  const next = nextGrowthLiveReadinessStep(snapshot);
  const steps = [
    {
      id: "domain" as const,
      label: "Site domain",
      complete: snapshot.domain != null,
      detail: snapshot.domain ?? "Add the site's primary domain.",
    },
    {
      id: "growth" as const,
      label: "Growth project",
      complete: snapshot.growthEnabled,
      detail: snapshot.growthEnabled
        ? "Marked as Growth-enabled."
        : "Opt this project into the Growth operating layer.",
    },
    {
      id: "key_pages" as const,
      label: "Priority pages",
      complete: snapshot.keyPageCount > 0,
      detail:
        snapshot.keyPageCount > 0
          ? `${snapshot.keyPageCount} ${snapshot.keyPageCount === 1 ? "page" : "pages"} configured.`
          : "Choose the pages that matter commercially.",
    },
    {
      id: "gsc" as const,
      label: "Search Console",
      complete: snapshot.gscConnected,
      detail: snapshot.gscConnected
        ? "A Google property is connected."
        : "Connect the property used for first-party clicks.",
    },
  ];

  return (
    <section
      id="growth-live-readiness"
      aria-labelledby="growth-live-readiness-title"
      className="rounded-lg border border-base-300 bg-base-100 p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2
            id="growth-live-readiness-title"
            className="text-balance text-lg font-semibold"
          >
            Ready for real data
          </h2>
          <p className="mt-1 max-w-prose text-pretty text-sm text-base-content/70">
            Complete these once, then compare this project's priority pages with
            real Search Console data.
          </p>
        </div>
        <ReadinessAction
          projectId={projectId}
          next={next}
          enablePending={enablePending}
          onEnable={onEnable}
        />
      </div>

      <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step) => {
          const isNext = step.id === next;
          return (
            <li
              key={step.id}
              className={`rounded-lg border p-3 ${
                isNext
                  ? "border-primary bg-primary/5"
                  : "border-base-300 bg-base-100"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium">{step.label}</h3>
                <span
                  className={`badge badge-sm ${
                    step.complete
                      ? "badge-ghost"
                      : isNext
                        ? "badge-primary"
                        : "badge-ghost"
                  }`}
                >
                  {step.complete ? "Ready" : isNext ? "Next" : "Waiting"}
                </span>
              </div>
              <p className="mt-2 text-pretty text-xs text-base-content/70">
                {step.detail}
              </p>
            </li>
          );
        })}
      </ol>

      {next === "growth" ? (
        <p className="mt-3 text-pretty text-xs text-base-content/60">
          Enabling Growth only saves this project setting. It does not run a
          check, schedule work or edit the website.
        </p>
      ) : null}
      {next === "ready" ? (
        <p className="mt-3 text-pretty text-sm text-base-content/70">
          Run the live check below, then judge whether the saved recommendation
          is genuinely useful—not just whether the check completed.
        </p>
      ) : null}
      {enableError ? (
        <p role="alert" className="mt-3 text-sm text-error">
          {enableError}
        </p>
      ) : null}
    </section>
  );
}

function ReadinessAction({
  projectId,
  next,
  enablePending,
  onEnable,
}: {
  projectId: string;
  next: GrowthLiveReadinessStep;
  enablePending: boolean;
  onEnable: () => void;
}) {
  if (next === "domain") {
    return (
      <Link
        className="btn btn-primary btn-sm"
        to="/p/$projectId/settings"
        params={{ projectId }}
      >
        Set project domain
      </Link>
    );
  }
  if (next === "growth") {
    return (
      <button
        type="button"
        className="btn btn-primary btn-sm"
        disabled={enablePending}
        onClick={onEnable}
      >
        {enablePending ? "Enabling…" : "Enable Growth"}
      </button>
    );
  }
  if (next === "key_pages") {
    return (
      <Link
        className="btn btn-primary btn-sm"
        to="/p/$projectId/settings/context"
        params={{ projectId }}
      >
        Add priority page
      </Link>
    );
  }
  if (next === "gsc") {
    return (
      <Link
        className="btn btn-primary btn-sm"
        to="/p/$projectId/settings/integrations"
        params={{ projectId }}
      >
        Connect Search Console
      </Link>
    );
  }
  return (
    <a className="btn btn-primary btn-sm" href="#growth-live-check-title">
      Run live check
    </a>
  );
}
