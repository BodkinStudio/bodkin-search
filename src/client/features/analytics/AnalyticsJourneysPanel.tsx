import { visitorLabel } from "./AnalyticsOverview";
import type { UseQueryResult } from "@tanstack/react-query";
import type {
  getAnalyticsJourneyMap,
  listAnalyticsJourneys,
} from "@/serverFunctions/analytics";
import type {
  AnalyticsSearch,
  ResolvedAnalyticsSearch,
} from "./analytics-search";
import { JourneyMap } from "./JourneyMap";
import { AttributionLabel } from "./AnalyticsOverview";
export function AnalyticsJourneysPanel({
  search,
  onSearch,
  map,
  journeys,
}: {
  search: ResolvedAnalyticsSearch;
  onSearch: (patch: Partial<AnalyticsSearch>) => void;
  map: UseQueryResult<Awaited<ReturnType<typeof getAnalyticsJourneyMap>>>;
  journeys: UseQueryResult<Awaited<ReturnType<typeof listAnalyticsJourneys>>>;
}) {
  const openJourney = (context: string) =>
    onSearch({ view: "journeys", context });
  const filtering = !!search.page || !!search.source || search.method !== "all";
  const filteredJourneys = journeys.data?.filter(
    (j) =>
      (!search.page || j.landingPage === search.page) &&
      (!search.source || j.source === search.source) &&
      (search.method === "all" || j.method === search.method),
  );
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="join">
          <button
            className={`btn btn-sm join-item ${search.display === "list" ? "btn-active" : ""}`}
            onClick={() => onSearch({ display: "list" })}
          >
            Journey list
          </button>
          <button
            className={`btn btn-sm join-item ${search.display === "map" ? "btn-active" : ""}`}
            onClick={() => onSearch({ display: "map" })}
          >
            Website map
          </button>
        </div>
        <label className="flex items-center gap-2 text-xs">
          Connection
          <select
            className="select select-sm"
            value={search.method}
            onChange={(e) =>
              onSearch({
                method:
                  e.target.value === "exact"
                    ? "exact"
                    : e.target.value === "ip_time"
                      ? "ip_time"
                      : e.target.value === "unattributed"
                        ? "unattributed"
                        : "all",
              })
            }
          >
            <option value="all">All methods</option>
            <option value="exact">Exact only</option>
            <option value="ip_time">Inferred</option>
            <option value="unattributed">Unattributed</option>
          </select>
        </label>
      </div>
      {search.display === "map" ? (
        map.isError ? (
          <p role="alert">Could not load the map.</p>
        ) : map.isPending ? (
          <p role="status">Loading observed paths…</p>
        ) : (
          <JourneyMap
            pages={
              // The journey list is paged, so it only narrows the map when
              // the reader has filtered by source, page or match type.
              filtering && filteredJourneys
                ? map.data.paths.filter((p) =>
                    filteredJourneys.some((j) => j.contextId === p.contextId),
                  )
                : map.data.paths
            }
            onOpenJourney={openJourney}
          />
        )
      ) : journeys.isPending ? (
        <p role="status">Loading journeys…</p>
      ) : journeys.isError ? (
        <p role="alert">Could not load journeys.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Visitor</th>
                <th>First source / landing</th>
                <th>Latest activity</th>
                <th>Visits</th>
                <th>Connection</th>
              </tr>
            </thead>
            <tbody>
              {filteredJourneys?.map((j) => (
                <tr key={j.contextId}>
                  <td>
                    <button
                      className="font-medium text-primary hover:underline"
                      onClick={() => openJourney(j.contextId)}
                    >
                      {visitorLabel(j.contextId)}
                    </button>
                    {j.organizationId && (
                      <p className="mt-1 text-xs text-base-content/60">
                        {j.organizationId}
                      </p>
                    )}
                  </td>
                  <td>
                    <p>{j.source || "Direct / unknown"}</p>
                    <p className="max-w-64 truncate text-xs text-base-content/60">
                      {j.landingPage ?? "No page observed"}
                    </p>
                  </td>
                  <td className="whitespace-nowrap text-xs">
                    {j.lastSeenAt.slice(0, 16).replace("T", " ")}
                  </td>
                  <td className="tabular-nums">{j.sessions}</td>
                  <td>
                    <AttributionLabel method={j.method} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filteredJourneys?.length && (
            <p className="py-12 text-center text-sm text-base-content/70">
              No journeys match this view. Check filters or tracking health.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
