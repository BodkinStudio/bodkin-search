import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { StatTile } from "@/client/components/StatTile";
import {
  chartAxisTick,
  chartGridProps,
  chartTooltipStyle,
} from "@/client/lib/chartTheme";
import type { getAnalyticsMqls } from "@/serverFunctions/analytics";

type Report = Awaited<ReturnType<typeof getAnalyticsMqls>>;
type Lead = NonNullable<Report["leads"]>[number];

const formatWeek = (week: string) =>
  new Date(`${week}T00:00:00.000Z`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
const kindLabel: Record<Lead["kind"], string> = {
  enquiry: "Demo or enquiry",
  trial: "Trial",
  other: "Other",
};

// Qualified leads (MQLs): per calendar week against the weekly target,
// split by what qualified them, with the channel, source and campaign that
// brought each one, and (for those who may inspect people) each lead's journey.
export function AnalyticsMqlsPanel({
  data,
  pending,
  error,
  canInspect,
  onOpenJourney,
}: {
  data: Report | undefined;
  pending: boolean;
  error: boolean;
  canInspect: boolean;
  onOpenJourney: (contextId: string) => void;
}) {
  if (pending) return <p role="status">Loading qualified leads…</p>;
  if (error || !data)
    return <p role="alert">Qualified leads couldn’t load. Try again.</p>;
  const latest = data.weekly.at(-1);
  const rows = data.weekly.map((w) => ({
    ...w,
    other: w.mqls - w.enquiries - w.trials,
  }));
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Qualified leads"
          value={data.total}
          hint="Demos booked and trials started in the period"
        />
        <StatTile label="Demos or enquiries" value={data.enquiries} />
        <StatTile label="Trials" value={data.trials} />
        <StatTile
          label="This week"
          value={
            data.target
              ? `${latest?.mqls ?? 0} of ${data.target}`
              : (latest?.mqls ?? 0)
          }
          hint={
            data.target
              ? "Against the weekly target"
              : "Set a weekly target in Configuration"
          }
        />
      </div>

      <section
        aria-labelledby="mqls-weekly"
        className="rounded-lg border border-base-300 p-4"
      >
        <h2 id="mqls-weekly" className="mb-4 font-semibold">
          Qualified leads by week
        </h2>
        <div
          className="h-60 w-full"
          role="img"
          aria-label="Qualified leads by week, demos and trials; values in the table below"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={rows}
              margin={{ top: 6, right: 8, bottom: 0, left: -20 }}
            >
              <CartesianGrid {...chartGridProps} vertical={false} />
              <XAxis
                dataKey="week"
                tickFormatter={formatWeek}
                tick={chartAxisTick}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={chartAxisTick}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={chartTooltipStyle}
                labelFormatter={(label) =>
                  `Week of ${formatWeek(String(label))}`
                }
              />
              <Legend />
              <Bar
                dataKey="enquiries"
                name="Demos or enquiries"
                stackId="mqls"
                fill="var(--color-primary)"
                isAnimationActive={false}
              />
              <Bar
                dataKey="trials"
                name="Trials"
                stackId="mqls"
                fill="var(--color-secondary)"
                isAnimationActive={false}
              />
              <Bar
                dataKey="other"
                name="Other"
                stackId="mqls"
                fill="var(--color-neutral)"
                isAnimationActive={false}
              />
              {data.target ? (
                <ReferenceLine
                  y={data.target}
                  stroke="var(--color-accent)"
                  strokeDasharray="4 4"
                  label={{
                    value: `Target ${data.target}`,
                    position: "insideTopRight",
                    fontSize: 11,
                  }}
                />
              ) : null}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <details className="mt-2 text-xs text-base-content/70">
          <summary className="cursor-pointer">Show the numbers</summary>
          <table className="table table-xs mt-2">
            <thead>
              <tr>
                <th>Week of</th>
                <th className="text-right">Qualified leads</th>
                <th className="text-right">Demos or enquiries</th>
                <th className="text-right">Trials</th>
              </tr>
            </thead>
            <tbody>
              {data.weekly.map((w) => (
                <tr key={w.week}>
                  <td>{formatWeek(w.week)}</td>
                  <td className="text-right">{w.mqls}</td>
                  <td className="text-right">{w.enquiries}</td>
                  <td className="text-right">{w.trials}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>

      <AdsSpend ads={data.ads} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Breakdown
          title="By channel"
          rows={data.byChannel}
          empty="No attributed leads yet."
        />
        <Breakdown
          title="By campaign"
          rows={data.byCampaign}
          empty="No leads came from a tagged campaign yet."
        />
      </div>
      {data.untracked ? (
        <p className="text-sm text-base-content/70">
          {data.untracked} of {data.total} leads have no tracked journey (no
          consent, a direct calendar link or a blocked tracker): they are
          counted but not attributed.
        </p>
      ) : null}

      <section
        aria-labelledby="mqls-leads"
        className="rounded-lg border border-base-300 p-4"
      >
        <h2 id="mqls-leads" className="mb-3 font-semibold">
          Each lead and how they arrived
        </h2>
        {data.leads === null ? (
          <p className="text-sm text-base-content/70">
            Individual leads are shown to administrators when individual
            inspection is on in Configuration.
          </p>
        ) : data.leads.length === 0 ? (
          <p className="text-sm text-base-content/70">
            No qualified leads in this period.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Lead</th>
                  <th>Channel</th>
                  <th>Source / medium / campaign</th>
                  <th>Landed on</th>
                  <th className="text-right">Pages</th>
                  <th>
                    <span className="sr-only">Journey</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.leads.map((lead) => (
                  <tr key={lead.outcomeId}>
                    <td className="whitespace-nowrap">
                      {new Date(lead.occurredAt).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </td>
                    <td>{kindLabel[lead.kind]}</td>
                    <td>{lead.tracked ? lead.channel : "Not tracked"}</td>
                    <td className="max-w-xs truncate" title={touchLabel(lead)}>
                      {touchLabel(lead)}
                    </td>
                    <td className="max-w-xs truncate">
                      {lead.firstTouch?.landingPage ?? "—"}
                    </td>
                    <td className="text-right">{lead.pagesViewed}</td>
                    <td className="text-right">
                      {lead.contextId && canInspect ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs"
                          onClick={() => onOpenJourney(lead.contextId!)}
                        >
                          View journey
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function touchLabel(lead: Lead) {
  const t = lead.firstTouch;
  if (!t) return "—";
  const tags = [t.source, t.medium, t.campaign].filter(Boolean).join(" / ");
  const extra = [
    t.content && `content ${t.content}`,
    t.term && `term ${t.term}`,
    lead.adCampaign
      ? `Google Ads: ${lead.adCampaign.campaignName}${lead.adCampaign.keyword ? ` (${lead.adCampaign.keyword})` : ""}`
      : t.clickIdType && `${t.clickIdType} click`,
  ]
    .filter(Boolean)
    .join(", ");
  return [tags || t.referrer || "Direct", extra].filter(Boolean).join(" · ");
}

function Breakdown({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: { label: string; mqls: number }[];
  empty: string;
}) {
  return (
    <section className="rounded-lg border border-base-300 p-4">
      <h3 className="mb-2 font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-base-content/70">{empty}</p>
      ) : (
        <table className="table table-sm">
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <td>{row.label}</td>
                <td className="text-right">{row.mqls}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function AdsSpend({ ads }: { ads: Report["ads"] }) {
  if (!ads.connected)
    return (
      <p className="text-sm text-base-content/70">
        Connect Google Ads in Settings → Integrations to see what each campaign
        costs per qualified lead.
      </p>
    );
  if (!("campaigns" in ads) || !ads.campaigns)
    return (
      <p role="alert" className="text-sm text-warning">
        Google Ads couldn’t be read: {ads.error}
      </p>
    );
  const money = (n: number | null) =>
    n === null
      ? "—"
      : new Intl.NumberFormat(undefined, {
          style: "currency",
          currency: ads.currency || "GBP",
          maximumFractionDigits: 0,
        }).format(n);
  return (
    <section
      aria-labelledby="mqls-ads"
      className="rounded-lg border border-base-300 p-4"
    >
      <h2 id="mqls-ads" className="mb-3 font-semibold">
        Google Ads: cost per qualified lead
      </h2>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatTile label="Spend" value={money(ads.spend)} hint={ads.account} />
        <StatTile label="Qualified leads from ads" value={ads.mqls} />
        <StatTile
          label="Cost per qualified lead"
          value={money(ads.costPerMql)}
        />
      </div>
      {ads.campaigns.length === 0 ? (
        <p className="text-sm text-base-content/70">
          No campaign had impressions in this period.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Campaign</th>
                <th className="text-right">Spend</th>
                <th className="text-right">Clicks</th>
                <th className="text-right">Qualified leads</th>
                <th className="text-right">Demos / trials</th>
                <th className="text-right">Cost per lead</th>
              </tr>
            </thead>
            <tbody>
              {ads.campaigns.map((c) => (
                <tr key={c.campaignId}>
                  <td>{c.campaignName}</td>
                  <td className="text-right">{money(c.spend)}</td>
                  <td className="text-right">{c.clicks}</td>
                  <td className="text-right">{c.mqls}</td>
                  <td className="text-right">
                    {c.enquiries} / {c.trials}
                  </td>
                  <td className="text-right">{money(c.costPerMql)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-base-content/60">
        A lead counts for a campaign when its ad click or its UTM campaign
        matches it. Leads from ads clicked before the period, or never tracked,
        are not counted here.
      </p>
    </section>
  );
}
