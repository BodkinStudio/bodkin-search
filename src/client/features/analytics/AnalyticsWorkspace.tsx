import { AnalyticsNoSources } from "./AnalyticsNoSources";
import { CustomerEvidence } from "./CustomerEvidence";
import {
  getAnalyticsReportingSettings,
  getAnalyticsCapabilities,
} from "@/serverFunctions/analyticsConfiguration";
import { calendarWindow } from "@/shared/analytics/calendar";
import { AnalyticsPeriodControls } from "./AnalyticsPeriodControls";
import {
  AnalyticsInspectionState,
  AnalyticsNoActivity,
} from "./AnalyticsInspectionState";
import { AnalyticsComparison } from "./AnalyticsComparison";
import { AnalyticsRetainedHistory } from "./AnalyticsSearchEvidence";
import { AnalyticsAcquisitionPanel } from "./AnalyticsAcquisitionPanel";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Download, Settings2 } from "lucide-react";
import {
  getAnalyticsOverview,
  listAnalyticsJourneys,
  getAnalyticsJourneyMap,
  getAnalyticsCustomers,
  getAnalyticsFunnels,
  listAnalyticsSources,
} from "@/serverFunctions/analytics";
import { AnalyticsOverview } from "./AnalyticsOverview";
import { AnalyticsJourneyDetail } from "./AnalyticsJourneyDetail";
import { AnalyticsJourneysPanel } from "./AnalyticsJourneysPanel";
import {
  AnalyticsCustomerPanel,
  AnalyticsFunnelPanel,
} from "./AnalyticsDetailPanels";
import type { AnalyticsSearch } from "./analytics-search";

const views = [
  "overview",
  "journeys",
  "acquisition",
  "funnels",
  "customers",
] as const;
export function AnalyticsWorkspace({
  projectId,
  search,
  onSearch,
}: {
  projectId: string;
  search: AnalyticsSearch;
  onSearch: (patch: Partial<AnalyticsSearch>) => void;
}) {
  const reporting = useQuery({
    queryKey: ["analyticsReportingSettings", projectId],
    queryFn: () => getAnalyticsReportingSettings({ data: { projectId } }),
  });
  const capabilities = useQuery({
    queryKey: ["analyticsCapabilities", projectId],
    queryFn: () => getAnalyticsCapabilities({ data: { projectId } }),
  });
  const canAdminister = capabilities.data?.canAdminister === true;
  const timezone = search.timezone ?? reporting.data?.timezone ?? "UTC";
  const today = new Date().toISOString().slice(0, 10);
  const filters = {
    projectId,
    environment: search.environment,
    ...calendarWindow(search.days, timezone),
    timezone,
    compare: search.compare,
  };
  const needsInspection =
    !!search.context ||
    !!search.customer ||
    ["journeys", "customers"].includes(search.view);
  const overview = useQuery({
    queryKey: ["analyticsOverview", filters],
    queryFn: () => getAnalyticsOverview({ data: filters }),
  });
  const sources = useQuery({
    queryKey: ["analyticsSources", projectId],
    queryFn: () => listAnalyticsSources({ data: { projectId } }),
  });
  const journeys = useQuery({
    queryKey: ["analyticsJourneys", filters],
    queryFn: () => listAnalyticsJourneys({ data: filters }),
    enabled:
      !!capabilities.data?.canInspect &&
      (search.view === "journeys" || search.view === "customers"),
  });
  const map = useQuery({
    queryKey: ["analyticsMap", filters],
    queryFn: () => getAnalyticsJourneyMap({ data: filters }),
    enabled:
      !!capabilities.data?.canInspect &&
      search.view === "journeys" &&
      search.display === "map",
  });
  const customers = useQuery({
    queryKey: ["analyticsCustomers", filters],
    queryFn: () => getAnalyticsCustomers({ data: filters }),
    enabled: !!capabilities.data?.canInspect && search.view === "customers",
  });
  const funnels = useQuery({
    queryKey: ["analyticsFunnels", filters, search.template, search.action],
    queryFn: () =>
      getAnalyticsFunnels({
        data: { ...filters, template: search.template, action: search.action },
      }),
    enabled: search.view === "funnels",
  });
  const openJourney = (context: string) =>
    onSearch({ view: "journeys", context, customer: undefined });
  const filteredJourneys = journeys.data?.filter(
    (j) =>
      (!search.page || j.landingPage === search.page) &&
      (!search.source || j.source === search.source) &&
      (search.method === "all" || j.method === search.method),
  );
  const exportData = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            filters,
            definitions: {
              visitors: "Permitted contexts, not unique humans",
              outcomes: "Verified activity-period outcomes",
            },
            overview: overview.data,
            journeys: filteredJourneys,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analytics-${today}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 pb-16 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="mt-1 text-sm text-base-content/70">
            From the first recorded visit to a customer.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="btn btn-ghost btn-sm"
            onClick={exportData}
            disabled={!overview.data}
          >
            <Download className="size-4" />
            Export
          </button>
          {canAdminister && (
            <Link
              to="/p/$projectId/settings/analytics"
              params={{ projectId }}
              className="btn btn-outline btn-sm"
            >
              <Settings2 className="size-4" />
              Tracking setup
            </Link>
          )}
        </div>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-base-300">
        <nav
          aria-label="Analytics views"
          className="flex max-w-full gap-5 overflow-x-auto"
        >
          {views.map((view) => (
            <button
              key={view}
              onClick={() =>
                onSearch({ view, context: undefined, customer: undefined })
              }
              aria-current={search.view === view ? "page" : undefined}
              className={
                search.view === view
                  ? "whitespace-nowrap border-b-2 border-primary py-3 text-sm font-medium capitalize text-primary"
                  : "whitespace-nowrap border-b-2 border-transparent py-3 text-sm capitalize text-base-content/70 hover:text-base-content"
              }
            >
              {view}
            </button>
          ))}
        </nav>
      </div>
      <AnalyticsPeriodControls
        search={search}
        timezone={timezone}
        onSearch={onSearch}
      />
      {search.environment === "test" && (
        <div className="rounded-lg border border-base-300 bg-base-200 px-4 py-3 text-sm">
          Test environment · installation tests and synthetic journeys. Excluded
          from production reporting.
        </div>
      )}
      {needsInspection && capabilities.isPending ? (
        <p role="status">Checking individual inspection access…</p>
      ) : needsInspection && !capabilities.data?.canInspect ? (
        <AnalyticsInspectionState
          projectId={projectId}
          enabled={capabilities.data?.inspectionEnabled ?? false}
          admin={capabilities.data?.canAdminister ?? false}
        />
      ) : overview.isPending ? (
        <div role="status" className="space-y-5 py-8">
          <div className="skeleton h-16 w-full" />
          <div className="skeleton h-56 w-full" />
          <span className="sr-only">Loading analytics</span>
        </div>
      ) : overview.isError ? (
        <div role="alert" className="rounded-lg border border-base-300 p-8">
          <h2 className="font-semibold">Analytics couldn’t load</h2>
          <p className="mt-2 text-sm text-base-content/70">
            Check your project access and try again.
          </p>
          <button
            className="btn btn-sm mt-4"
            onClick={() => {
              void overview.refetch();
            }}
          >
            Try again
          </button>
        </div>
      ) : sources.data?.length === 0 ? (
        <AnalyticsNoSources
          projectId={projectId}
          canAdminister={canAdminister}
        />
      ) : (
        <>
          {search.customer ? (
            <section
              className="max-w-3xl space-y-4"
              aria-labelledby="customer-evidence-title"
            >
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => onSearch({ customer: undefined })}
              >
                Back to customers
              </button>
              <h2
                id="customer-evidence-title"
                className="text-xl font-semibold"
              >
                Customer acquisition evidence
              </h2>
              <CustomerEvidence
                projectId={projectId}
                environment={search.environment}
                customerId={search.customer}
                onOpenJourney={openJourney}
              />
            </section>
          ) : search.context ? (
            <AnalyticsJourneyDetail
              contextId={search.context}
              {...filters}
              onClose={() => onSearch({ context: undefined })}
            />
          ) : (
            <>
              {search.view === "overview" && (
                <>
                  {overview.data.visitors === 0 &&
                    overview.data.outcomes === 0 && (
                      <AnalyticsNoActivity
                        projectId={projectId}
                        canAdminister={canAdminister}
                      />
                    )}
                  <AnalyticsComparison comparison={overview.data.comparison} />
                  <AnalyticsOverview
                    data={overview.data}
                    onPage={(page) => onSearch({ view: "journeys", page })}
                    onSource={(source) =>
                      onSearch({ view: "journeys", source })
                    }
                  />
                  <AnalyticsRetainedHistory
                    projectId={projectId}
                    environment={search.environment}
                  />
                </>
              )}
              {search.view === "journeys" && (
                <AnalyticsJourneysPanel
                  search={search}
                  onSearch={onSearch}
                  map={map}
                  journeys={journeys}
                />
              )}
              {search.view === "acquisition" && (
                <AnalyticsAcquisitionPanel
                  filters={filters}
                  dimension={search.dimension}
                  onDimension={(dimension) => onSearch({ dimension })}
                  onSelect={onSearch}
                />
              )}
              {search.view === "funnels" && (
                <AnalyticsFunnelPanel
                  template={search.template}
                  onTemplate={(template) => onSearch({ template })}
                  onOpenJourney={openJourney}
                  data={funnels.data}
                  pending={funnels.isPending}
                  error={funnels.isError}
                />
              )}
              {search.view === "customers" && (
                <AnalyticsCustomerPanel
                  projectId={projectId}
                  onOpenCustomer={(customer) =>
                    onSearch({
                      view: "customers",
                      customer,
                      context: undefined,
                    })
                  }
                  data={customers.data}
                  pending={customers.isPending}
                  error={customers.isError}
                  journeys={journeys.data}
                  onOpenJourney={openJourney}
                />
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}
