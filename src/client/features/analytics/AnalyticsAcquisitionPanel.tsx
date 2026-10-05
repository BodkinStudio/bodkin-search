import { AnalyticsSearchEvidence } from "./AnalyticsSearchEvidence";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { getAnalyticsAcquisitionDimensions } from "@/serverFunctions/analytics";
import { AnalyticsTrafficSection } from "./AnalyticsTrafficSection";
const DIMENSION_LABELS = {
  sources: "Source",
  campaigns: "Campaign",
  pages: "Landing page",
  destinations: "Destination",
} as const;

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
    timezone?: string;
  };
  dimension: keyof typeof DIMENSION_LABELS;
  onDimension: (
    value: "sources" | "campaigns" | "pages" | "destinations",
  ) => void;
  onSelect: (patch: {
    view: "journeys";
    source?: string;
    page?: string;
    channel?: string;
  }) => void;
}) {
  const query = useQuery({
    queryKey: ["acquisitionDimensions", filters],
    queryFn: () => getAnalyticsAcquisitionDimensions({ data: filters }),
  });
  return (
    <section className="space-y-5">
      <AnalyticsTrafficSection
        filters={filters}
        onOpenChannel={(channel) => onSelect({ view: "journeys", channel })}
      />
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
              {DIMENSION_LABELS[d]}
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
                  <th>{DIMENSION_LABELS[dimension]}</th>
                  <th className="text-right">Visitors</th>
                  <th className="text-right">Landings</th>
                  <th
                    className="text-right"
                    title="Customers who passed through here at any point"
                  >
                    Assisted
                  </th>
                  <th
                    className="text-right"
                    title="Customers who clicked a call to action here"
                  >
                    Via call to action
                  </th>
                  <th
                    className="text-right"
                    title="Customers whose journey began here"
                  >
                    Customers
                  </th>
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
                      <td className="text-right tabular-nums">{r.visitors}</td>
                      <td className="text-right tabular-nums">{r.landings}</td>
                      <td className="text-right tabular-nums">{r.assists}</td>
                      <td className="text-right tabular-nums">{r.cta}</td>
                      <td className="text-right tabular-nums">{r.customers}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <AnalyticsSearchEvidence filters={filters} />
      <Link
        to="/p/$projectId/analytics"
        params={{ projectId: filters.projectId }}
        search={{ view: "search" }}
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
