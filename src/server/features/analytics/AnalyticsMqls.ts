import { calendarDay } from "@/shared/analytics/calendar";
import { analyticsChannels, channelFor, type AnalyticsChannel } from "@/shared/analytics/channels";
import type { AnalyticsQuery } from "@/types/schemas/analytics";
import { AnalyticsRepository as repo } from "./AnalyticsRepository";

// Qualified leads (MQLs): every verified lead_qualified outcome in the
// period, per calendar week against the project's weekly target, split by
// what qualified them (an enquiry such as a demo booking, or a trial), and
// attributed to the visitor's first touch in the 30 days before: the
// channel, source and campaign that brought them, and where they landed.

type Event = Awaited<ReturnType<typeof repo.contextEvents>>[number];
type Outcome = Awaited<ReturnType<typeof repo.outcomes>>[number];
export type MqlKind = "enquiry" | "trial" | "other";

const LOOKBACK_MS = 30 * 86400_000;
const groupBy = <T>(items: T[], key: (item: T) => string) => {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  return groups;
};
const QUALIFYING = new Set(["enquiry_submitted", "trial_started"]);

/** Monday of the calendar week holding `day` (YYYY-MM-DD). */
export function weekOf(day: string) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

/** What qualified the lead: the customer's enquiry or trial nearest before it (a day's grace after). */
export function kindOf(mql: Outcome, customerOutcomes: Outcome[]): MqlKind {
  const at = Date.parse(mql.occurredAt);
  const qualifying = customerOutcomes
    .filter((o) => QUALIFYING.has(o.name) && Date.parse(o.occurredAt) <= at + 86400_000)
    .toSorted((a, b) => Math.abs(Date.parse(a.occurredAt) - at) - Math.abs(Date.parse(b.occurredAt) - at))[0];
  if (!qualifying) return "other";
  return qualifying.name === "trial_started" ? "trial" : "enquiry";
}

/** The first touch of a journey: its first event that says where it came from, else its first event. */
export function firstTouch(history: Event[]) {
  const first = history[0];
  if (!first) return null;
  const sourced =
    history.find((e) => e.clickIdType || e.campaignSource || (e.referrerHost && e.referrerHost !== e.pageHost)) ?? first;
  return {
    at: first.receivedAt,
    landingPage: history.find((e) => e.name === "page_view")?.pagePath ?? first.pagePath,
    channel: channelFor(sourced),
    source: sourced.campaignSource ?? (sourced.referrerHost && sourced.referrerHost !== sourced.pageHost ? sourced.referrerHost : null),
    medium: sourced.campaignMedium,
    campaign: sourced.campaignName,
    content: sourced.campaignContent,
    term: sourced.campaignTerm,
    referrer: sourced.referrerHost ? `${sourced.referrerHost}${sourced.referrerPath ?? ""}` : null,
    clickIdType: sourced.clickIdType,
  };
}

export async function mqlReport(q: AnalyticsQuery) {
  const timezone = q.timezone ?? "UTC";
  const window = repo.windowFor(q);
  const [outcomes, config] = await Promise.all([repo.outcomes(q), repo.settings(q.projectId)]);
  const mqls = outcomes.filter((o) => o.name === "lead_qualified").toSorted((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const byCustomer = groupBy(outcomes, (o) => o.customerId);

  // The journeys behind them: the outcome's own visitor plus every visitor
  // identified as the same customer, over the 30 days before.
  const contexts = await repo.customerContexts(q.projectId, q.environment, [...new Set(mqls.map((o) => o.customerId))]);
  const contextsOf = new Map<string, Set<string>>();
  for (const c of contexts) if (c.customerId) contextsOf.set(c.customerId, (contextsOf.get(c.customerId) ?? new Set()).add(c.id));
  for (const o of mqls) if (o.contextId) contextsOf.set(o.customerId, (contextsOf.get(o.customerId) ?? new Set()).add(o.contextId));
  const allContexts = [...new Set([...contextsOf.values()].flatMap((s) => [...s]))];
  const events = await repo.contextEvents(
    q.projectId,
    allContexts,
    new Date(Date.parse(window.from) - LOOKBACK_MS).toISOString(),
    window.to,
  );
  const eventsByContext = groupBy(events, (e) => e.contextId);

  const rows = mqls.map((o) => {
    const at = Date.parse(o.occurredAt);
    const history = [...(contextsOf.get(o.customerId) ?? [])]
      .flatMap((id) => eventsByContext.get(id) ?? [])
      .filter((e) => {
        const t = Date.parse(e.receivedAt);
        return t <= at && t >= at - LOOKBACK_MS;
      })
      .toSorted((a, b) => a.receivedAt.localeCompare(b.receivedAt) || a.sequence - b.sequence);
    const touch = firstTouch(history);
    return {
      outcomeId: o.id,
      occurredAt: o.occurredAt,
      week: weekOf(calendarDay(o.occurredAt, timezone)),
      kind: kindOf(o, byCustomer.get(o.customerId) ?? []),
      customerId: o.customerId,
      contextId: history.at(-1)?.contextId ?? o.contextId,
      pagesViewed: history.filter((e) => e.name === "page_view").length,
      firstTouch: touch,
      channel: (touch?.channel ?? "Direct") as AnalyticsChannel,
      tracked: history.length > 0,
    };
  });

  // Every calendar week in the period, so a quiet week shows as zero.
  const weeks = new Map<string, { week: string; mqls: number; enquiries: number; trials: number }>();
  for (let day = Date.parse(calendarDay(window.from, timezone)); day <= Date.parse(calendarDay(window.to, timezone)) && weeks.size < 60; day += 86400_000) {
    const week = weekOf(new Date(day).toISOString().slice(0, 10));
    if (!weeks.has(week)) weeks.set(week, { week, mqls: 0, enquiries: 0, trials: 0 });
  }
  for (const r of rows) {
    const w = weeks.get(r.week) ?? { week: r.week, mqls: 0, enquiries: 0, trials: 0 };
    w.mqls++;
    if (r.kind === "enquiry") w.enquiries++;
    if (r.kind === "trial") w.trials++;
    weeks.set(r.week, w);
  }

  const tally = <K extends string>(key: (r: (typeof rows)[number]) => K | null | undefined) => {
    const counts = new Map<K, number>();
    for (const r of rows) {
      const k = key(r);
      if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return [...counts].map(([label, mqls]) => ({ label, mqls })).toSorted((a, b) => b.mqls - a.mqls);
  };

  return {
    target: config.weeklyMqlTarget ?? null,
    total: rows.length,
    enquiries: rows.filter((r) => r.kind === "enquiry").length,
    trials: rows.filter((r) => r.kind === "trial").length,
    untracked: rows.filter((r) => !r.tracked).length,
    weekly: [...weeks.values()].toSorted((a, b) => a.week.localeCompare(b.week)),
    byChannel: analyticsChannels
      .map((channel) => ({ label: channel, mqls: rows.filter((r) => r.channel === channel).length }))
      .filter((c) => c.mqls > 0),
    byCampaign: tally((r) =>
      r.firstTouch?.campaign ? [r.firstTouch.source, r.firstTouch.medium, r.firstTouch.campaign].filter(Boolean).join(" / ") : null,
    ),
    bySource: tally((r) => r.firstTouch?.source ?? (r.tracked ? "Direct / unknown" : null)),
    // Individual rows only where the project allows personal inspection.
    leads: config.personalAccess ? rows.toReversed().slice(q.offset, q.offset + q.limit) : null,
    definitions: {
      mql: "A verified lead_qualified outcome: the project sends one for each demo booked or trial started.",
      kind: "What qualified it: the customer's enquiry (e.g. a demo booking) or trial nearest the lead.",
      attribution: "First touch in the 30 days before the lead, across every visitor identified as the customer.",
      untracked: "Leads with no permitted journey (no consent, a direct calendar link, or a blocked tracker): counted, not attributed.",
      weeks: `Calendar weeks starting Monday, in ${timezone}.`,
    },
    window,
  };
}
