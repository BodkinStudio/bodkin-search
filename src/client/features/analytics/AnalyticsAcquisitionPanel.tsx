import { AnalyticsSearchEvidence } from "./AnalyticsSearchEvidence";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { getAnalyticsAcquisitionDimensions } from "@/serverFunctions/analytics";
export function AnalyticsAcquisitionPanel({
  filters,
  dimension,
  onDimension,
  onSelect,
}: {
  filters: {
    projectId: string;
    environment: "test" | "production";
    from: string;
    to: string;
  };
  dimension: string;
  onDimension: (
    value: "sources" | "campaigns" | "pages" | "destinations",
  ) => void;
  onSelect: (patch: {
    view: "journeys";
    source?: string;
    page?: string;
  }) => void;
}) {
  const query = useQuery({
    queryKey: ["acquisitionDimensions", filters],
    queryFn: () => getAnalyticsAcquisitionDimensions({ data: filters }),
  });
  return (
    <section className="space-y-5">
      <h2 className="text-lg font-semibold">Acquisition evidence</h2>
      <div className="flex flex-wrap gap-2" aria-label="Acquisition dimension">
        {(["sources", "campaigns", "pages", "destinations"] as const).map(
          (d) => (
            <button
              key={d}
              className={`btn btn-sm ${dimension === d ? "btn-primary" : "btn-ghost"}`}
              aria-pressed={dimension === d}
              onClick={() => onDimension(d)}
            >
              {d[0].toUpperCase() + d.slice(1)}
            </button>
          ),
        )}
      </div>
      {query.isPending ? (
        <p role="status">Loading acquisition…</p>
      ) : query.isError ? (
        <p role="alert">Could not load acquisition evidence.</p>
      ) : (
        <>
          <p className="max-w-3xl text-sm text-base-content/70">
            {query.data.definition}
          </p>
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>{dimension}</th>
                  <th>Visitors</th>
                  <th>Landings</th>
                  <th>Assisted customers</th>
                  <th>CTA customers</th>
                  <th>Attributed customers</th>
                </tr>
              </thead>
              <tbody>
                {query.data.rows
                  .filter((r) => r.dimension === dimension)
                  .map((r) => (
                    <tr key={r.label}>
                      <td>
                        {dimension === "sources" || dimension === "pages" ? (
                          <button
                            className="text-primary"
                            onClick={() =>
                              onSelect({
                                view: "journeys",
                                ...(dimension === "sources"
                                  ? { source: r.label }
                                  : { page: r.label }),
                              })
                            }
                          >
                            {r.label}
                          </button>
                        ) : (
                          r.label
                        )}
                      </td>
                      <td>{r.visitors}</td>
                      <td>{r.landings}</td>
                      <td>{r.assists}</td>
                      <td>{r.cta}</td>
                      <td>{r.customers}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <AnalyticsSearchEvidence filters={filters} />
      <Link
        to="/p/$projectId/search-performance"
        params={{ projectId: filters.projectId }}
        className="text-sm text-primary"
      >
        Inspect aggregate Search Console context
      </Link>
      <p className="text-xs text-base-content/60">
        Search queries describe aggregate demand and cannot identify individual
        visitors.
      </p>
    </section>
  );
}
