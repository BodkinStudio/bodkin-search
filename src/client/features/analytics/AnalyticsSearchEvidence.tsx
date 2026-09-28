import { useQuery } from "@tanstack/react-query";
import {
  getAnalyticsSearchContext,
  getAnalyticsRetainedHistory,
} from "@/serverFunctions/analyticsConfiguration";
export function AnalyticsSearchEvidence({
  filters,
}: {
  filters: {
    projectId: string;
    environment: "production" | "test";
    from: string;
    to: string;
  };
}) {
  const query = useQuery({
    queryKey: ["analyticsSearchContext", filters],
    queryFn: () => getAnalyticsSearchContext({ data: filters }),
  });
  return (
    <section className="space-y-3 border-t border-base-300 pt-5">
      <h3 className="font-medium">Saved search context</h3>
      {query.isPending ? (
        <p role="status" className="text-sm">
          Loading saved page measurements…
        </p>
      ) : query.isError ? (
        <p role="alert" className="text-sm">
          Saved search measurements could not load.
        </p>
      ) : (
        <>
          <p className="max-w-3xl text-xs text-base-content/70">
            {query.data.definition}
          </p>
          {!query.data.rows.length ? (
            <p className="text-sm">
              No saved Search Console page measurements fit this period. Save a
              page measurement in Growth to compare its search evidence here.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>Page</th>
                    <th>Saved period</th>
                    <th>Search metric</th>
                    <th>Value</th>
                    <th>Tracked visitors</th>
                    <th>Coverage / captured</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        {r.host}
                        {r.path}
                      </td>
                      <td>
                        {r.start}–{r.end}
                        <span className="block text-xs text-base-content/60">
                          {r.timezone}
                        </span>
                      </td>
                      <td>{r.metric.replaceAll("_", " ")}</td>
                      <td>{r.value}</td>
                      <td>{r.visitors}</td>
                      <td>
                        {Math.round(r.completeness * 100)}% ·{" "}
                        {r.capturedAt.slice(0, 10)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
export function AnalyticsRetainedHistory({
  projectId,
  environment,
}: {
  projectId: string;
  environment: "production" | "test";
}) {
  const query = useQuery({
    queryKey: ["analyticsRetainedHistory", projectId, environment],
    queryFn: () =>
      getAnalyticsRetainedHistory({ data: { projectId, environment } }),
  });
  return (
    <details className="border-t border-base-300 pt-4">
      <summary className="cursor-pointer text-sm font-medium">
        Retained aggregate history · 13 months
      </summary>
      <p className="mt-3 text-xs text-base-content/70">
        UTC daily totals retained after individual detail expires. Visitor-days
        count a context once each day and must not be read as unique people
        across days. No personal identifiers are stored in these rows.
      </p>
      {query.isPending ? (
        <p role="status">Loading history…</p>
      ) : query.isError ? (
        <p role="alert">Retained history could not load.</p>
      ) : !query.data.length ? (
        <p className="mt-3 text-sm">
          No detail has reached its retention cutoff yet.
        </p>
      ) : (
        <div className="mt-3 max-h-96 overflow-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>UTC day</th>
                <th>Metric</th>
                <th>Total</th>
                <th>Currency</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((r) => (
                <tr key={`${r.day}:${r.metric}:${r.currency}`}>
                  <td>{r.day}</td>
                  <td>{r.metric.replaceAll("_", " ")}</td>
                  <td>{r.value}</td>
                  <td>{r.currency || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}
