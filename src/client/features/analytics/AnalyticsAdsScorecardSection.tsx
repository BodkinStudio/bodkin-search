import { useQuery } from "@tanstack/react-query";
import { StatTile } from "@/client/components/StatTile";
import { getAnalyticsAdsInsights } from "@/serverFunctions/analytics";
import { SHORT_CALL_SECONDS } from "@/shared/analytics/ads-scorecard";

type Report = Awaited<ReturnType<typeof getAnalyticsAdsInsights>>;
type Connected = Extract<Report, { connected: true }>;
type Scorecard = NonNullable<Connected["scorecard"]>;

/** Below this share of ad clicks seen on the site, ad results are undercounted. */
const LOW_COVERAGE = 50;

// Ad spend against results: what the ads cost, what Google reported, and what
// the site saw those visitors actually do. Shown only when a Google Ads
// account is connected. Shares its query with the ads learning section.
export function AnalyticsAdsScorecardSection({
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
    return <p role="status">Loading ad spend against results…</p>;
  if (query.isError)
    return <p role="alert">Couldn’t load ad spend against results.</p>;
  const data = query.data;
  if (!data.connected) return null;
  const money = (n: number | null, digits = 0) =>
    n === null
      ? "—"
      : new Intl.NumberFormat(undefined, {
          style: "currency",
          currency: data.currency || "GBP",
          maximumFractionDigits: digits,
        }).format(n);
  const card = data.scorecard;
  return (
    <section aria-labelledby="ads-scorecard" className="space-y-4">
      <div>
        <h2 id="ads-scorecard" className="text-lg font-semibold">
          Ad spend against results
        </h2>
        <p className="text-sm text-base-content/70">
          {data.definitions.scorecard}
        </p>
      </div>
      {data.scorecardError ? (
        <p role="alert" className="text-sm text-warning">
          Google Ads couldn’t be read: {data.scorecardError}
        </p>
      ) : null}
      {card ? <Scorecard card={card} data={data} money={money} /> : null}
    </section>
  );
}

function Scorecard({
  card,
  data,
  money,
}: {
  card: Scorecard;
  data: Connected;
  money: (n: number | null, digits?: number) => string;
}) {
  const t = card.totals;
  const lowCoverage = t.seenRate !== null && t.seenRate < LOW_COVERAGE;
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile
          label="Ad spend"
          value={money(t.spend)}
          hint={`${t.clicks} clicks · ${money(t.costPerClick, 2)} a click`}
        />
        <StatTile
          label="Google conversions"
          value={t.googleConversions}
          hint="What the account’s conversion actions counted"
        />
        <StatTile
          label="Ad visitors seen"
          value={t.visitorsSeen}
          hint={t.seenRate === null ? "No clicks" : `${t.seenRate}% of clicks`}
        />
        <StatTile
          label="Signed up from ads"
          value={t.signedUp}
          hint={
            t.signedUp
              ? `${money(t.costPerSignUp)} each`
              : `None for ${money(t.spend)}`
          }
        />
        <StatTile
          label="Qualified leads from ads"
          value={t.leads}
          hint={
            t.leads
              ? `${money(t.costPerLead)} each`
              : `None for ${money(t.spend)}`
          }
        />
      </div>

      <ul className="list-disc space-y-1 pl-5 text-sm">
        <li>
          Google reported <strong>{t.googleConversions} conversions</strong>;
          the site saw <strong>{t.leads} qualified leads</strong> and{" "}
          <strong>{t.signedUp} sign-ups</strong> from ad visitors.
        </li>
        {t.biddingConversions > 0 ? (
          <li>
            Of the {t.biddingConversions} conversions Google’s bidding optimises
            for: <strong>{t.biddingOnCallsRate ?? 0}%</strong> are phone calls
            (not checked against demos or trials),{" "}
            <strong>{t.biddingOnOtherRate ?? 0}%</strong> are page views, clicks
            or other actions, and <strong>{t.biddingOnLeadsRate ?? 0}%</strong>{" "}
            record a lead or sale.
          </li>
        ) : null}
        {lowCoverage ? (
          <li className="text-warning">
            The site saw only {t.seenRate}% of ad clicks in this period, so ad
            visitors, sign-ups and leads are undercounted. Compare a period with
            better coverage before judging cost per lead.
          </li>
        ) : null}
      </ul>

      <div className="rounded-lg border border-base-300 p-4">
        <h3 className="mb-2 font-medium">By campaign</h3>
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Type</th>
                <th className="text-right">Spend</th>
                <th className="text-right">Clicks</th>
                <th className="text-right">Google conversions</th>
                <th className="text-right" title={data.definitions.seenRate}>
                  Visitors seen
                </th>
                <th className="text-right">Start trial</th>
                <th className="text-right">Book a demo</th>
                <th className="text-right">Signed up</th>
                <th className="text-right">Qualified leads</th>
                <th className="text-right">Cost per lead</th>
              </tr>
            </thead>
            <tbody>
              {card.campaigns.map((c) => (
                <tr key={c.campaignName}>
                  <td className="font-medium">{c.campaignName}</td>
                  <td className="text-xs">{c.type}</td>
                  <td className="text-right tabular-nums">{money(c.spend)}</td>
                  <td className="text-right tabular-nums">{c.clicks}</td>
                  <td className="text-right tabular-nums">
                    {c.googleConversions}
                  </td>
                  <td className="text-right tabular-nums">
                    {c.visitorsSeen}
                    {c.seenRate !== null ? (
                      <span className="text-base-content/50">
                        {" "}
                        ({c.seenRate}%)
                      </span>
                    ) : null}
                  </td>
                  <td className="text-right tabular-nums">
                    {c.startTrialClicks}
                  </td>
                  <td className="text-right tabular-nums">
                    {c.bookDemoClicks}
                  </td>
                  <td className="text-right tabular-nums">{c.signedUp}</td>
                  <td className="text-right tabular-nums">{c.leads}</td>
                  <td className="text-right tabular-nums">
                    {c.costPerLead === null ? "None yet" : money(c.costPerLead)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border border-base-300 p-4">
        <h3 className="font-medium">What Google counts as a conversion</h3>
        <p className="mb-2 text-sm text-base-content/70">
          {data.definitions.googleConversions}
        </p>
        {card.error ? (
          <p role="alert" className="text-sm text-warning">
            Conversion actions couldn’t be read: {card.error}
          </p>
        ) : card.conversionActions.length === 0 ? (
          <p className="text-sm text-base-content/70">
            No conversions recorded in this period.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Conversion action</th>
                  <th>Google’s category</th>
                  <th>What it records</th>
                  <th>Bidding optimises for it</th>
                  <th className="text-right">Conversions</th>
                </tr>
              </thead>
              <tbody>
                {card.conversionActions.map((a) => (
                  <tr key={a.action}>
                    <td className="font-medium">{a.action}</td>
                    <td className="text-xs">{a.category}</td>
                    <td className="text-xs">{recordsLabel(a)}</td>
                    <td className="text-xs">
                      {a.usedForBidding ? "Yes" : "No"}
                    </td>
                    <td className="text-right tabular-nums">
                      {a.allConversions}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CallsTable data={data} />

      <div className="rounded-lg border border-base-300 p-4">
        <h3 className="mb-2 font-medium">Ad visitors against other visitors</h3>
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Visitors from</th>
                <th className="text-right">Visitors</th>
                <th className="text-right">Clicked start trial</th>
                <th className="text-right">Clicked book a demo</th>
                <th className="text-right">Signed up</th>
                <th className="text-right">Qualified leads</th>
              </tr>
            </thead>
            <tbody>
              {card.comparison.map((row) => (
                <tr key={row.channel}>
                  <td className="font-medium">{row.channel}</td>
                  <td className="text-right tabular-nums">{row.visitors}</td>
                  <td className="text-right tabular-nums">
                    {row.startTrialRate === null
                      ? "—"
                      : `${row.startTrialRate}%`}
                  </td>
                  <td className="text-right tabular-nums">
                    {row.bookDemoRate === null ? "—" : `${row.bookDemoRate}%`}
                  </td>
                  <td className="text-right tabular-nums">
                    {row.signedUp}
                    {row.signUpRate !== null ? (
                      <span className="text-base-content/50">
                        {" "}
                        ({row.signUpRate}%)
                      </span>
                    ) : null}
                  </td>
                  <td className="text-right tabular-nums">{row.leads}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function recordsLabel(a: Scorecard["conversionActions"][number]) {
  if (a.kind === "lead") return "A lead or sale";
  if (a.kind === "other") return "A visit or click";
  return a.minCallSeconds === null
    ? "A phone call (not checked against demos or trials)"
    : `A phone call of ${a.minCallSeconds}s or more (not checked against demos or trials)`;
}

const seconds = (n: number | null) => (n === null ? "—" : `${n}s`);

function CallsTable({ data }: { data: Connected }) {
  const calls = data.calls;
  return (
    <div className="rounded-lg border border-base-300 p-4">
      <h3 className="font-medium">Calls Google counted</h3>
      <p className="mb-2 text-sm text-base-content/70">
        {data.definitions.calls}
      </p>
      {"total" in calls ? (
        calls.total === 0 ? (
          <p className="text-sm text-base-content/70">
            No calls from ads in this period.
          </p>
        ) : (
          <>
            <ul className="mb-3 list-disc space-y-1 pl-5 text-sm">
              <li>
                <strong>{calls.total} calls</strong>: {calls.answered} answered,{" "}
                {calls.missed} missed. Answered calls lasted{" "}
                <strong>{seconds(calls.medianSeconds)}</strong> at the median;{" "}
                <strong>{calls.short}</strong> lasted under {SHORT_CALL_SECONDS}{" "}
                seconds.
              </li>
              <li>
                {calls.minCallSeconds === null
                  ? "No call length setting was read for the call conversion actions."
                  : `The call conversion action counts any call of ${calls.minCallSeconds} seconds or more.`}
              </li>
            </ul>
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th className="text-right">Calls</th>
                    <th className="text-right">Answered</th>
                    <th className="text-right">Median length</th>
                  </tr>
                </thead>
                <tbody>
                  {calls.byCampaign.map((c) => (
                    <tr key={c.campaignName}>
                      <td className="font-medium">{c.campaignName}</td>
                      <td className="text-right tabular-nums">{c.calls}</td>
                      <td className="text-right tabular-nums">{c.answered}</td>
                      <td className="text-right tabular-nums">
                        {seconds(c.medianSeconds)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer">Each call</summary>
              <div className="overflow-x-auto">
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th>Started</th>
                      <th>Campaign</th>
                      <th>Answered</th>
                      <th className="text-right">Length</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calls.recent.map((c, index) => (
                      <tr key={`${c.startedAt ?? ""}-${index}`}>
                        <td className="tabular-nums">{c.startedAt ?? "—"}</td>
                        <td>{c.campaignName ?? "—"}</td>
                        <td>{c.answered ? "Yes" : "No"}</td>
                        <td className="text-right tabular-nums">
                          {seconds(c.seconds)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )
      ) : (
        <p role="alert" className="text-sm text-warning">
          Calls couldn’t be read: {calls.error}
        </p>
      )}
    </div>
  );
}
