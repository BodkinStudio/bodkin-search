import type {
  AnalyticsSearch,
  ResolvedAnalyticsSearch,
} from "./analytics-search";

// One compact row: which days, compared with what, and (only when the project
// has both) live or test data. Days run in the project's reporting timezone.
export function AnalyticsPeriodControls({
  search,
  timezone,
  environments,
  onSearch,
}: {
  search: ResolvedAnalyticsSearch;
  timezone: string;
  environments: string[];
  onSearch: (patch: Partial<AnalyticsSearch>) => void;
}) {
  const filter = search.page ?? search.source;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <label className="flex items-center gap-2 text-sm">
        <span className="sr-only">Period</span>
        <select
          className="select select-sm"
          value={search.days}
          onChange={(e) =>
            onSearch({
              days:
                e.target.value === "7" ? 7 : e.target.value === "90" ? 90 : 30,
            })
          }
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          className="toggle toggle-sm toggle-primary"
          type="checkbox"
          checked={search.compare}
          onChange={(e) => onSearch({ compare: e.target.checked })}
        />
        Compare with the previous period
      </label>
      {environments.length > 1 ? (
        <label className="flex items-center gap-2 text-sm">
          <span className="text-base-content/70">Data</span>
          <select
            className="select select-sm"
            value={search.environment}
            onChange={(e) =>
              onSearch({
                environment: e.target.value === "test" ? "test" : "production",
                context: undefined,
              })
            }
          >
            <option value="production">Live</option>
            <option value="test">Test</option>
          </select>
        </label>
      ) : null}
      {filter ? (
        <button
          type="button"
          className="badge badge-lg gap-1 badge-primary badge-outline"
          onClick={() => onSearch({ page: undefined, source: undefined })}
          aria-label={`Clear the ${filter} filter`}
        >
          {filter} <span aria-hidden="true">×</span>
        </button>
      ) : null}
      <p className="text-xs text-base-content/60 sm:ml-auto">
        Days run in {timezone}
      </p>
    </div>
  );
}
