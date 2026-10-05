import { AnalyticsNoSources } from "./AnalyticsNoSources";
import { AnalyticsTrackingStatus } from "./AnalyticsTrackingHealth";
import {
  AnalyticsHeaderActions,
  AnalyticsOverviewTab,
  downloadAnalyticsJson,
  AnalyticsTestDataBanner,
  AnalyticsViewNav,
  CustomerEvidenceSection,
} from "./AnalyticsWorkspaceParts";
import {
  getAnalyticsReportingSettings,
  getAnalyticsCapabilities,
} from "@/serverFunctions/analyticsConfiguration";
import { calendarWindow } from "@/shared/analytics/calendar";
import { AnalyticsPeriodControls } from "./AnalyticsPeriodControls";
import { AnalyticsInspectionState } from "./AnalyticsInspectionState";
import { AnalyticsAcquisitionPanel } from "./AnalyticsAcquisitionPanel";
import { useQuery } from "@tanstack/react-query";
import {
  getAnalyticsOverview,
  listAnalyticsJourneys,
  getAnalyticsJourneyMap,
  getAnalyticsCustomers,
  getAnalyticsFunnels,
  getAnalyticsMqls,
  listAnalyticsSources,
} from "@/serverFunctions/analytics";
import { AnalyticsMqlsPanel } from "./AnalyticsMqlsPanel";
import { AnalyticsJourneyDetail } from "./AnalyticsJourneyDetail";
import { AnalyticsJourneysPanel } from "./AnalyticsJourneysPanel";
import {
  AnalyticsCustomerPanel,
  AnalyticsFunnelPanel,
} from "./AnalyticsDetailPanels";
import {
  resolveEnvironment,
  type AnalyticsSearch,
  type ResolvedAnalyticsSearch,
} from "./analytics-search";
import { PageShell } from "@/client/components/PageShell";
import {
  SectionNav,
  sectionNavItemClass,
} from "@/client/components/SectionNav";
import { SearchPerformanceReport } from "@/client/features/search-performance/SearchPerformancePage";
import { AnalyticsChannels } from "./AnalyticsChannels";

// Journeys and customers show individual people, so they only appear for
// those who may inspect them (or can switch inspection on).
const views = [
  { value: "overview", label: "Overview", personal: false },
  { value: "mqls", label: "Qualified leads", personal: false },
  { value: "acquisition", label: "Sources", personal: false },
  { value: "funnels", label: "Funnels", personal: false },
  { value: "journeys", label: "Journeys", personal: true },
  { value: "customers", label: "Customers", personal: true },
] as const;
// The site's own journey tracking: overview, sources, funnels, journeys and
// customers, with their period controls.
function AnalyticsWebsite({
  projectId,
  search: requested,
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
  const canInspect = capabilities.data?.canInspect === true;
  const sources = useQuery({
    queryKey: ["analyticsSources", projectId],
    queryFn: () => listAnalyticsSources({ data: { projectId } }),
  });
  const search: ResolvedAnalyticsSearch = {
    ...requested,
    environment: resolveEnvironment(requested.environment, sources.data),
  };
  const environmentKnown = !!requested.environment || !sources.isPending;
  const timezone = search.timezone ?? reporting.data?.timezone ?? "UTC";
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
    enabled: environmentKnown,
  });
  const journeys = useQuery({
    queryKey: ["analyticsJourneys", filters],
    queryFn: () => listAnalyticsJourneys({ data: filters }),
    enabled:
      canInspect && (search.view === "journeys" || search.view === "customers"),
  });
  const map = useQuery({
    queryKey: ["analyticsMap", filters],
    queryFn: () => getAnalyticsJourneyMap({ data: filters }),
    enabled:
      canInspect && search.view === "journeys" && search.display === "map",
  });
  const customers = useQuery({
    queryKey: ["analyticsCustomers", filters],
    queryFn: () => getAnalyticsCustomers({ data: filters }),
    enabled: canInspect && search.view === "customers",
  });
  const funnels = useQuery({
    queryKey: ["analyticsFunnels", filters, search.template, search.action],
    queryFn: () =>
      getAnalyticsFunnels({
        data: { ...filters, template: search.template, action: search.action },
      }),
    enabled: search.view === "funnels",
  });
  const mqls = useQuery({
    queryKey: ["analyticsMqls", filters],
    queryFn: () => getAnalyticsMqls({ data: filters }),
    enabled: environmentKnown && search.view === "mqls",
  });
  const openJourney = (context: string) =>
    onSearch({ view: "journeys", context, customer: undefined });
  const filteredJourneys = filterJourneys(journeys.data, search);
  if (sources.data?.length === 0)
    return (
      <AnalyticsNoSources projectId={projectId} canAdminister={canAdminister} />
    );
  const environments = [
    ...new Set(sources.data?.map((source) => source.environment) ?? []),
  ];
  const visibleViews = views.filter(
    (view) => !view.personal || canInspect || canAdminister,
  );
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <AnalyticsViewNav
          views={visibleViews}
          current={search.view}
          onSelect={(view) =>
            onSearch({ view, context: undefined, customer: undefined })
          }
        />
        <div className="flex flex-wrap gap-2">
          <AnalyticsHeaderActions
            projectId={projectId}
            canAdminister={canAdminister}
            onExport={
              overview.data
                ? () =>
                    downloadAnalyticsJson({
                      filters,
                      overview: overview.data,
                      journeys: filteredJourneys,
                    })
                : undefined
            }
          />
        </div>
      </div>
      <AnalyticsPeriodControls
        search={search}
        timezone={timezone}
        environments={environments}
        onSearch={onSearch}
      />
      <AnalyticsTrackingStatus
        projectId={projectId}
        environment={search.environment}
        canConfigure={canAdminister}
      />
      {search.environment === "test" ? (
        <AnalyticsTestDataBanner
          canShowLive={environments.includes("production")}
          onShowLive={() => onSearch({ environment: "production" })}
        />
      ) : null}
      {needsInspection && capabilities.isPending ? (
        <p role="status">Checking individual inspection access…</p>
      ) : needsInspection && !canInspect ? (
        <AnalyticsInspectionState
          projectId={projectId}
          enabled={capabilities.data?.inspectionEnabled ?? false}
          admin={canAdminister}
        />
      ) : overview.isPending || !environmentKnown ? (
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
      ) : (
        <>
          {search.customer ? (
            <CustomerEvidenceSection
              projectId={projectId}
              environment={search.environment}
              customerId={search.customer}
              onBack={() => onSearch({ customer: undefined })}
              onOpenJourney={openJourney}
            />
          ) : search.context ? (
            <AnalyticsJourneyDetail
              contextId={search.context}
              {...filters}
              onClose={() => onSearch({ context: undefined })}
            />
          ) : (
            <>
              {search.view === "overview" && (
                <AnalyticsOverviewTab
                  projectId={projectId}
                  environment={search.environment}
                  data={overview.data}
                  canAdminister={canAdminister}
                  onSearch={onSearch}
                />
              )}
              {search.view === "mqls" && (
                <AnalyticsMqlsPanel
                  data={mqls.data}
                  pending={mqls.isPending}
                  error={mqls.isError}
                  canInspect={canInspect}
                  onOpenJourney={openJourney}
                />
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
    </>
  );
}

const areas = [
  { value: "website", label: "Website", view: "overview" },
  { value: "search", label: "Google Search", view: "search" },
  { value: "channels", label: "Channels", view: "channels" },
] as const;

// One place for every analytics source: the site's own tracking, Google
// Search Console, and the connected channels (GA4, YouTube, LinkedIn).
export function AnalyticsWorkspace({
  projectId,
  search,
  onSearch,
}: {
  projectId: string;
  search: AnalyticsSearch;
  onSearch: (patch: Partial<AnalyticsSearch>) => void;
}) {
  const area =
    search.view === "search" || search.view === "channels"
      ? search.view
      : "website";
  return (
    <PageShell
      title="Analytics"
      description="Where visitors come from, what they do, and who becomes a customer."
      nav={
        <SectionNav label="Analytics">
          {areas.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-current={area === item.value ? "page" : undefined}
              className={sectionNavItemClass(area === item.value)}
              onClick={() =>
                onSearch({
                  view: item.view,
                  context: undefined,
                  customer: undefined,
                })
              }
            >
              {item.label}
            </button>
          ))}
        </SectionNav>
      }
    >
      {area === "search" ? (
        <SearchPerformanceReport projectId={projectId} />
      ) : area === "channels" ? (
        <AnalyticsChannels projectId={projectId} />
      ) : (
        <AnalyticsWebsite
          projectId={projectId}
          search={search}
          onSearch={onSearch}
        />
      )}
    </PageShell>
  );
}

// The journeys the export describes: the same source, page and matching
// filters the reader has applied on screen.
function filterJourneys<
  J extends {
    landingPage: string | null;
    source: string | null;
    channel?: string | null;
    method: string;
  },
>(journeys: J[] | undefined, search: AnalyticsSearch) {
  return journeys?.filter(
    (j) =>
      (!search.page || j.landingPage === search.page) &&
      (!search.source || j.source === search.source) &&
      (!search.channel || j.channel === search.channel) &&
      (search.method === "all" || j.method === search.method),
  );
}
