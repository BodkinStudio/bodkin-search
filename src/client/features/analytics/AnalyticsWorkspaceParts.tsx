import { Link } from "@tanstack/react-router";
import { Download, Settings2 } from "lucide-react";
import { AnalyticsNoActivity } from "./AnalyticsInspectionState";
import { AnalyticsOverview } from "./AnalyticsOverview";
import { AnalyticsRetainedHistory } from "./AnalyticsSearchEvidence";
import { CustomerEvidence } from "./CustomerEvidence";
import type { AnalyticsEnvironment, AnalyticsSearch } from "./analytics-search";

type AnalyticsViewItem = {
  value: AnalyticsSearch["view"];
  label: string;
};

export function AnalyticsOverviewTab({
  projectId,
  environment,
  data,
  canAdminister,
  onSearch,
}: {
  projectId: string;
  environment: AnalyticsEnvironment;
  data: Parameters<typeof AnalyticsOverview>[0]["data"];
  canAdminister: boolean;
  onSearch: (patch: Partial<AnalyticsSearch>) => void;
}) {
  return (
    <>
      {data.visitors === 0 && data.outcomes === 0 && (
        <AnalyticsNoActivity
          projectId={projectId}
          canAdminister={canAdminister}
        />
      )}
      <AnalyticsOverview
        data={data}
        onPage={(page) => onSearch({ view: "journeys", page })}
        onSource={(source) => onSearch({ view: "journeys", source })}
      />
      <AnalyticsRetainedHistory
        projectId={projectId}
        environment={environment}
      />
    </>
  );
}

export function CustomerEvidenceSection({
  projectId,
  environment,
  customerId,
  onBack,
  onOpenJourney,
}: {
  projectId: string;
  environment: AnalyticsEnvironment;
  customerId: string;
  onBack: () => void;
  onOpenJourney: (context: string) => void;
}) {
  return (
    <section
      className="max-w-3xl space-y-4"
      aria-labelledby="customer-evidence-title"
    >
      <button className="btn btn-ghost btn-sm" onClick={onBack}>
        Back to customers
      </button>
      <h2 id="customer-evidence-title" className="text-xl font-semibold">
        Customer acquisition evidence
      </h2>
      <CustomerEvidence
        projectId={projectId}
        environment={environment}
        customerId={customerId}
        onOpenJourney={onOpenJourney}
      />
    </section>
  );
}

// The website area's own views, drawn as a quieter segmented row under the
// main Analytics tabs.
export function AnalyticsViewNav({
  views: items,
  current,
  onSelect,
}: {
  views: readonly AnalyticsViewItem[];
  current: AnalyticsSearch["view"];
  onSelect: (view: AnalyticsSearch["view"]) => void;
}) {
  return (
    <nav
      aria-label="Website analytics views"
      className="max-w-full overflow-x-auto"
    >
      <div className="join">
        {items.map((view) => (
          <button
            key={view.value}
            type="button"
            onClick={() => onSelect(view.value)}
            aria-current={current === view.value ? "page" : undefined}
            className={`btn btn-sm join-item ${current === view.value ? "btn-neutral" : "btn-ghost border-base-300"}`}
          >
            {view.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

export function AnalyticsTestDataBanner({
  canShowLive,
  onShowLive,
}: {
  canShowLive: boolean;
  onShowLive: () => void;
}) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-2.5 text-sm"
    >
      <span>
        Showing <strong>test data</strong>: installation checks and synthetic
        journeys, not real visitors.
      </span>
      {canShowLive ? (
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          onClick={onShowLive}
        >
          Show live data
        </button>
      ) : null}
    </div>
  );
}

export function AnalyticsHeaderActions({
  projectId,
  canAdminister,
  onExport,
}: {
  projectId: string;
  canAdminister: boolean;
  onExport?: () => void;
}) {
  return (
    <>
      <button
        className="btn btn-ghost btn-sm"
        onClick={onExport}
        disabled={!onExport}
      >
        <Download className="size-4" />
        Export JSON
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
    </>
  );
}

export function downloadAnalyticsJson(report: {
  filters: object;
  overview: unknown;
  journeys: unknown;
}) {
  const blob = new Blob(
    [
      JSON.stringify(
        {
          ...report,
          definitions: {
            visitors: "Permitted contexts, not unique humans",
            outcomes: "Verified activity-period outcomes",
          },
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
  a.download = `analytics-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
