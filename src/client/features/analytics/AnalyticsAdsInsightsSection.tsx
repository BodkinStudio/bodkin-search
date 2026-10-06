import { useQuery } from "@tanstack/react-query";
import { getAnalyticsAdsInsights } from "@/serverFunctions/analytics";

type Report = Awaited<ReturnType<typeof getAnalyticsAdsInsights>>;
type Connected = Extract<Report, { connected: true }>;
type Term = Connected["searchTerms"]["top"][number];
type Asset = Connected["assets"]["all"][number];

// What the ads are learning: searches worth more and searches spending with
// no result, and Google's rating of each headline and description. Shown
// only when a Google Ads account is connected.
export function AnalyticsAdsInsightsSection({
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
  const query = useQuery({
    queryKey: ["analyticsAdsInsights", filters],
    queryFn: () => getAnalyticsAdsInsights({ data: filters }),
  });
  if (query.isPending)
    return <p role="status">Loading what the ads are learning…</p>;
  if (query.isError)
    return <p role="alert">Couldn’t load what the ads are learning.</p>;
  const data = query.data;
  if (!data.connected) return null;
  const money = (n: number) =>
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: data.currency || "GBP",
      maximumFractionDigits: 2,
    }).format(n);
  return (
    <section
      aria-labelledby="ads-learning"
      className="space-y-4 rounded-lg border border-base-300 p-4"
    >
      <div>
        <h2 id="ads-learning" className="font-semibold">
          What the ads are learning
        </h2>
        <p className="text-sm text-base-content/70">
          {data.definitions.searchTerms} {data.definitions.siteResults}
        </p>
      </div>
      {data.searchTerms.error ? (
        <p role="alert" className="text-sm text-warning">
          Search terms couldn’t be read: {data.searchTerms.error}
        </p>
      ) : null}
      <TermTable
        title="Promising searches"
        note={data.definitions.promising}
        rows={data.searchTerms.promising}
        money={money}
        empty="None yet in this period."
      />
      <TermTable
        title="Spending with no result yet"
        note={data.definitions.spendingNoResult}
        rows={data.searchTerms.spendingNoResult}
        money={money}
        empty="None in this period."
      />
      <div>
        <h3 className="font-medium">Headlines and descriptions</h3>
        <p className="mb-2 text-sm text-base-content/70">
          {data.definitions.assets}
        </p>
        {data.assets.error ? (
          <p role="alert" className="text-sm text-warning">
            Ratings couldn’t be read: {data.assets.error}
          </p>
        ) : data.assets.all.length === 0 ? (
          <p className="text-sm text-base-content/70">
            No responsive search ad text served in this period.
          </p>
        ) : (
          <AssetTable rows={data.assets.all} />
        )}
      </div>
    </section>
  );
}

function TermTable({
  title,
  note,
  rows,
  money,
  empty,
}: {
  title: string;
  note: string;
  rows: Term[];
  money: (n: number) => string;
  empty: string;
}) {
  return (
    <div>
      <h3 className="font-medium">{title}</h3>
      <p className="mb-2 text-sm text-base-content/70">{note}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-base-content/70">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Search</th>
                <th>Keyword</th>
                <th className="text-right">Spend</th>
                <th className="text-right">Clicks</th>
                <th className="text-right">Google conversions</th>
                <th className="text-right">Keyword sign-ups</th>
                <th className="text-right">Keyword leads</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={`${t.searchTerm}|${t.keyword}|${t.campaignName}`}>
                  <td className="font-medium">{t.searchTerm}</td>
                  <td className="text-xs text-base-content/70">
                    {t.keyword ?? "—"}
                  </td>
                  <td className="text-right tabular-nums">{money(t.spend)}</td>
                  <td className="text-right tabular-nums">{t.clicks}</td>
                  <td className="text-right tabular-nums">
                    {Math.round(t.googleConversions * 10) / 10}
                  </td>
                  <td className="text-right tabular-nums">
                    {t.site?.signedUp ?? "—"}
                  </td>
                  <td className="text-right tabular-nums">
                    {t.site?.leads ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AssetTable({ rows }: { rows: Asset[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="table table-sm">
        <thead>
          <tr>
            <th>Text</th>
            <th>Type</th>
            <th>Google’s rating</th>
            <th className="text-right">Impressions</th>
            <th className="text-right">Click rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={`${a.fieldType}|${a.text}`}>
              <td className="font-medium">{a.text}</td>
              <td className="text-xs">{a.fieldType}</td>
              <td className="text-xs">
                {a.rating}
                {a.low && a.rating !== "Low" ? " (low in some ads)" : ""}
              </td>
              <td className="text-right tabular-nums">{a.impressions}</td>
              <td className="text-right tabular-nums">{a.clickRate}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
