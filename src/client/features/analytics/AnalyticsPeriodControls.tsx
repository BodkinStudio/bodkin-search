import type { AnalyticsSearch } from "./analytics-search";
export function AnalyticsPeriodControls({
  search,
  timezone,
  onSearch,
}: {
  search: AnalyticsSearch;
  timezone: string;
  onSearch: (patch: Partial<AnalyticsSearch>) => void;
}) {
  const zones = [
    ...new Set([
      timezone,
      "UTC",
      "Europe/London",
      "America/New_York",
      "America/Los_Angeles",
      "Asia/Tokyo",
      "Australia/Sydney",
    ]),
  ];
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="grid gap-1 text-xs text-base-content/70">
        Period
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
      <label className="grid gap-1 text-xs text-base-content/70">
        Environment
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
          <option value="production">Production</option>
          <option value="test">Test</option>
        </select>
      </label>
      <label className="grid gap-1 text-xs text-base-content/70">
        Calendar timezone
        <select
          className="select select-sm max-w-56"
          value={timezone}
          onChange={(e) => onSearch({ timezone: e.target.value })}
        >
          {zones.map((z) => (
            <option key={z}>{z}</option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 pb-2 text-xs">
        <input
          className="checkbox checkbox-sm"
          type="checkbox"
          checked={search.compare}
          onChange={(e) => onSearch({ compare: e.target.checked })}
        />
        Compare preceding period
      </label>
      {(search.page || search.source) && (
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => onSearch({ page: undefined, source: undefined })}
        >
          Clear {search.page ?? search.source} filter ×
        </button>
      )}
    </div>
  );
}
