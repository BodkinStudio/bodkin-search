import { useQuery } from "@tanstack/react-query";
import { getAnalyticsTraffic } from "@/serverFunctions/analytics";

type Report = Awaited<ReturnType<typeof getAnalyticsTraffic>>;
type Row = Report["byKeyword"][number] & {
  spend?: number | null;
  adClicks?: number | null;
};

// Where visitors come from and what they do next: by channel, and for ad
// visitors by campaign and keyword, with where they landed, how far they
// read, which calls to action they clicked and whether they became leads.
export function AnalyticsTrafficSection({
  filters,
  onOpenChannel,
}: {
  filters: {
    projectId: string;
    environment: "test" | "production";
    from: string;
    to: string;
    timezone?: string;
  };
  onOpenChannel: (channel: string) => void;
}) {
  const query = useQuery({
    queryKey: ["analyticsTraffic", filters],
    queryFn: () => getAnalyticsTraffic({ data: filters }),
  });
  if (query.isPending)
    return <p role="status">Loading where visitors come from…</p>;
  if (query.isError)
    return <p role="alert">Couldn’t load where visitors come from.</p>;
  const data = query.data;
  const money = (n: number | null) =>
    n === null
      ? "—"
      : new Intl.NumberFormat(undefined, {
          style: "currency",
          currency:
            (data.ads.connected &&
              "currency" in data.ads &&
              data.ads.currency) ||
            "GBP",
          maximumFractionDigits: 0,
        }).format(n);
  return (
    <div className="space-y-6">
      <section
        aria-labelledby="traffic-channels"
        className="rounded-lg border border-base-300 p-4"
      >
        <h2 id="traffic-channels" className="mb-1 font-semibold">
          Where visitors come from
        </h2>
        <p className="mb-3 text-sm text-base-content/70">
          {data.visitors} visitors in the period, by the channel of their first
          touch. Select a channel to read those visitors’ journeys.
        </p>
        <TrafficTable
          rows={data.byChannel}
          label="Channel"
          onSelect={(row) => onOpenChannel(row.label)}
        />
      </section>

      <section
        aria-labelledby="traffic-campaigns"
        className="rounded-lg border border-base-300 p-4"
      >
        <h2 id="traffic-campaigns" className="mb-1 font-semibold">
          Ad visitors by campaign
        </h2>
        {data.ads.connected && "error" in data.ads && data.ads.error ? (
          <p role="alert" className="mb-2 text-sm text-warning">
            Google Ads couldn’t be read: {data.ads.error}
          </p>
        ) : null}
        {data.byAdCampaign.length === 0 ? (
          <p className="text-sm text-base-content/70">
            No ad visitors seen in this period. Ad clicks show here once they
            carry Google’s click id or UTM tags (set the account’s final URL
            suffix).
          </p>
        ) : (
          <TrafficTable
            rows={data.byAdCampaign}
            label="Campaign"
            money={money}
          />
        )}
      </section>

      {data.byKeyword.length ? (
        <section
          aria-labelledby="traffic-keywords"
          className="rounded-lg border border-base-300 p-4"
        >
          <h2 id="traffic-keywords" className="mb-3 font-semibold">
            Ad visitors by keyword
          </h2>
          <TrafficTable rows={data.byKeyword} label="Keyword" />
        </section>
      ) : null}
      <p className="text-xs text-base-content/60">
        {data.definitions.adClicks}
      </p>
    </div>
  );
}

function TrafficTable({
  rows,
  label,
  onSelect,
  money,
}: {
  rows: Row[];
  label: string;
  onSelect?: (row: Row) => void;
  money?: (n: number | null) => string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="table table-sm">
        <thead>
          <tr>
            <th>{label}</th>
            {money ? <th className="text-right">Spend</th> : null}
            {money ? <th className="text-right">Ad clicks</th> : null}
            <th className="text-right">Visitors</th>
            <th>Top landing pages</th>
            <th className="text-right" title="Pages read per visitor">
              Pages
            </th>
            <th className="text-right">Start trial</th>
            <th className="text-right">Book a demo</th>
            <th className="text-right">Contact</th>
            <th
              className="text-right"
              title="Gave a work email to start a trial, or booked a demo"
            >
              Signed up
            </th>
            <th
              className="text-right"
              title="A trial started in the product, or a demo booked"
            >
              Qualified leads
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td>
                {onSelect ? (
                  <button
                    type="button"
                    className="font-medium text-primary hover:underline"
                    onClick={() => onSelect(row)}
                  >
                    {row.label}
                  </button>
                ) : (
                  <span className="font-medium">{row.label}</span>
                )}
              </td>
              {money ? (
                <td className="text-right">{money(row.spend ?? null)}</td>
              ) : null}
              {money ? (
                <td className="text-right">{row.adClicks ?? "—"}</td>
              ) : null}
              <td className="text-right tabular-nums">{row.visitors}</td>
              <td className="max-w-72 text-xs text-base-content/70">
                {row.topLandings.map((l) => (
                  <span key={l.path} className="block truncate" title={l.path}>
                    {l.path}{" "}
                    <span className="text-base-content/50">({l.visitors})</span>
                  </span>
                ))}
              </td>
              <td className="text-right tabular-nums">{row.pagesPerVisitor}</td>
              <td className="text-right tabular-nums">
                {row.clicked.start_trial}
              </td>
              <td className="text-right tabular-nums">
                {row.clicked.book_demo}
              </td>
              <td className="text-right tabular-nums">{row.clicked.contact}</td>
              <td className="text-right tabular-nums">{row.signedUp}</td>
              <td className="text-right tabular-nums">{row.leads}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
