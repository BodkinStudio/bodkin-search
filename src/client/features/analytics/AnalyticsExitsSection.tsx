import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAnalyticsExits } from "@/serverFunctions/analytics";

// Where visits end: for each page, the visits that saw it, the visits that
// ended on it, and how many of those left without acting. For every visit,
// or for the visitors one channel brought.
export function AnalyticsExitsSection({
  filters,
}: {
  filters: {
    projectId: string;
    environment: "test" | "production";
    from: string;
    to: string;
    timezone?: string;
  };
}) {
  const [channel, setChannel] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["analyticsExits", filters],
    queryFn: () => getAnalyticsExits({ data: filters }),
  });
  if (query.isPending) return <p role="status">Loading where visits end…</p>;
  if (query.isError) return <p role="alert">Couldn’t load where visits end.</p>;
  const data = query.data;
  const selected = data.byChannel.find((row) => row.channel === channel);
  const pages = selected ? selected.pages : data.pages.slice(0, 15);
  return (
    <section
      aria-labelledby="exits-pages"
      className="rounded-lg border border-base-300 p-4"
    >
      <h2 id="exits-pages" className="mb-1 font-semibold">
        Where visits end
      </h2>
      <p className="mb-3 text-sm text-base-content/70">
        {selected ? selected.visits : data.visits} visits in the period, by the
        last page each one viewed. Pages that lose the most visits without a
        call to action clicked come first.
      </p>
      <div className="mb-3 flex flex-wrap gap-2" aria-label="Channel">
        <button
          type="button"
          className={`btn btn-sm ${selected ? "btn-ghost" : "btn-primary"}`}
          aria-pressed={!selected}
          onClick={() => setChannel(null)}
        >
          All visits
        </button>
        {data.byChannel.map((row) => (
          <button
            key={row.channel}
            type="button"
            className={`btn btn-sm ${row.channel === selected?.channel ? "btn-primary" : "btn-ghost"}`}
            aria-pressed={row.channel === selected?.channel}
            onClick={() => setChannel(row.channel)}
          >
            {row.channel}
          </button>
        ))}
      </div>
      {pages.length === 0 ? (
        <p className="text-sm text-base-content/70">
          No page views seen in this period.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Page</th>
                <th
                  className="text-right"
                  title="Visits that saw this page at least once"
                >
                  Visits
                </th>
                <th className="text-right" title={data.definitions.exits}>
                  Ended here
                </th>
                <th className="text-right" title={data.definitions.exitRate}>
                  Exit rate
                </th>
                <th className="text-right" title={data.definitions.onlyPage}>
                  Only page seen
                </th>
                <th
                  className="text-right"
                  title={data.definitions.leftWithoutActing}
                >
                  Left without acting
                </th>
              </tr>
            </thead>
            <tbody>
              {pages.map((row) => (
                <tr key={row.path}>
                  <td
                    className="max-w-96 truncate font-medium"
                    title={row.path}
                  >
                    {row.path}
                  </td>
                  <td className="text-right tabular-nums">{row.visits}</td>
                  <td className="text-right tabular-nums">{row.exits}</td>
                  <td className="text-right tabular-nums">{row.exitRate}%</td>
                  <td className="text-right tabular-nums">{row.onlyPage}</td>
                  <td className="text-right tabular-nums">
                    {row.leftWithoutActing}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-base-content/60">
        {data.definitions.visit} {data.definitions.leftWithoutActing}
      </p>
    </section>
  );
}
