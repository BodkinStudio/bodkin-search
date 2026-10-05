import { reportingSettings } from "./AnalyticsReportingConfiguration";
import { onboardingStatus } from "./onboarding";
import { calendarDay } from "@/shared/analytics/calendar";
import { channelFor } from "@/shared/analytics/channels";
import { funnels } from "./AnalyticsFunnels";
import { AnalyticsRepository as repo } from "./AnalyticsRepository";
import type { AnalyticsQuery } from "@/types/schemas/analytics";
type Event = Awaited<ReturnType<typeof repo.events>>[number];
const requirePersonal = async (q: AnalyticsQuery) => {
  const config = await repo.settings(q.projectId);
  if (!config.personalAccess)
    throw new Error(
      "Individual journey access is disabled in tracking settings",
    );
  return config;
};
const groupEvents = (events: Event[]) => {
  const groups = new Map<string, Event[]>();
  for (const e of events) {
    const group = groups.get(e.contextId) ?? [];
    group.push(e);
    groups.set(e.contextId, group);
  }
  return groups;
};
const sourceOf = (events: Event[]) => {
  const event = events.find((e) => e.campaignSource || e.referrerHost);
  return event?.campaignSource ?? event?.referrerHost ?? "Direct / unknown";
};
const inWindow = (date: string | null, q: AnalyticsQuery) => {
  const w = repo.windowFor(q);
  return !!date && date >= w.from && date <= w.to;
};
async function overview(q: AnalyticsQuery) {
  const [events, allCustomers, outcomes, config] = await Promise.all([
    repo.events(q),
    repo.customers(q),
    repo.outcomes(q),
    repo.settings(q.projectId),
  ]);
  if (
    events.length > 20000 ||
    allCustomers.length > 10000 ||
    outcomes.length > 20000
  )
    throw new Error("Reporting limit reached; choose a shorter period");
  const customers = allCustomers.filter((c) => inWindow(c.acquiredAt, q));
  const primary = outcomes.filter((o) => o.name === config.primaryOutcome);
  const groups = groupEvents(events);
  const daily = new Map<
    string,
    { date: string; visitors: Set<string>; outcomes: number }
  >();
  for (const e of events) {
    const date = calendarDay(e.receivedAt, q.timezone ?? "UTC");
    const item = daily.get(date) ?? {
      date,
      visitors: new Set<string>(),
      outcomes: 0,
    };
    item.visitors.add(e.contextId);
    daily.set(date, item);
  }
  for (const o of primary) {
    const date = calendarDay(o.occurredAt, q.timezone ?? "UTC");
    const item = daily.get(date) ?? {
      date,
      visitors: new Set<string>(),
      outcomes: 0,
    };
    item.outcomes++;
    daily.set(date, item);
  }
  const sources = new Map<
    string,
    { label: string; visitors: number; outcomes: number }
  >();
  const pages = new Map<
    string,
    { path: string; visitors: number; outcomes: number }
  >();
  for (const [contextId, history] of groups) {
    const source = sourceOf(history);
    const path = history.find((e) => e.name === "page_view")?.pagePath;
    const acquired = allCustomers.filter(
      (c) => c.acquiredAt && history.some((e) => e.id === c.clickEventId),
    ).length;
    const row = sources.get(source) ?? {
      label: source,
      visitors: 0,
      outcomes: 0,
    };
    row.visitors++;
    row.outcomes += acquired;
    sources.set(source, row);
    if (path) {
      const page = pages.get(path) ?? { path, visitors: 0, outcomes: 0 };
      page.visitors++;
      page.outcomes += acquired;
      pages.set(path, page);
    }
    void contextId;
  }
  const revenue = new Map<
    string,
    { currency: string; receipts: number; refunds: number }
  >();
  for (const o of outcomes) {
    if (!o.currency || o.amountMinor === null) continue;
    const row = revenue.get(o.currency) ?? {
      currency: o.currency,
      receipts: 0,
      refunds: 0,
    };
    if (o.name === "payment_succeeded") row.receipts += o.amountMinor;
    if (o.name === "refund_issued") row.refunds += o.amountMinor;
    revenue.set(o.currency, row);
  }
  const attribution = {
    manual: customers.filter((c) => c.method === "manual").length,
    exact: customers.filter((c) => c.method === "exact").length,
    ip_time: customers.filter((c) => c.method === "ip_time").length,
    unattributed: customers.filter((c) => c.method === "unattributed").length,
  };
  const reportingWindow = repo.windowFor(q);
  for (
    let day = Date.parse(
      calendarDay(reportingWindow.from, q.timezone ?? "UTC"),
    );
    day <= Date.parse(calendarDay(reportingWindow.to, q.timezone ?? "UTC")) &&
    daily.size < 100;
    day += 86400_000
  ) {
    const date = new Date(day).toISOString().slice(0, 10);
    if (!daily.has(date))
      daily.set(date, { date, visitors: new Set<string>(), outcomes: 0 });
  }
  return {
    outcomesAvailable: outcomes.length > 0 || allCustomers.length > 0,
    visitors: groups.size,
    sessions: new Set(events.map((e) => e.sessionId)).size,
    outcomes: primary.length,
    customers: customers.length,
    attribution,
    daily: [...daily.values()]
      .toSorted((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({
        date: d.date,
        visitors: d.visitors.size,
        outcomes: d.outcomes,
      })),
    sources: [...sources.values()].toSorted((a, b) => b.visitors - a.visitors),
    pages: [...pages.values()].toSorted((a, b) => b.visitors - a.visitors),
    revenue: [...revenue.values()],
    primaryOutcome: config.primaryOutcome,
    coverage: `${attribution.exact + attribution.ip_time} of ${customers.length} new customers have a retained acquisition link. Unknown tracking coverage is not zero conversion.`,
    definitions: {
      visitors: "Distinct permitted contexts",
      outcomes: `Verified ${config.primaryOutcome} events in the activity period`,
      tableOutcomes:
        "Acquired customers linked to the displayed entry-context cohort; may complete later",
    },
    window: repo.windowFor(q),
    freshness: new Date().toISOString(),
  };
}
async function journeys(q: AnalyticsQuery) {
  await requirePersonal(q);
  const [events, customers] = await Promise.all([
    repo.events(q),
    repo.customers(q),
  ]);
  const result = [...groupEvents(events)].map(([contextId, history]) => {
    const customer = customers.find((c) => c.contextId === contextId);
    const inferred = customers.find(
      (c) =>
        c.method === "ip_time" && history.some((e) => e.id === c.clickEventId),
    );
    return {
      contextId,
      firstSeenAt: history[0].receivedAt,
      lastSeenAt: history.at(-1)!.receivedAt,
      landingPage:
        history.find((e) => e.name === "page_view")?.pagePath ?? null,
      source: sourceOf(history),
      events: history.length,
      sessions: new Set(history.map((e) => e.sessionId)).size,
      organizationId: customer?.externalId ?? null,
      method: customer?.method ?? inferred?.method ?? "unattributed",
      stage: history.at(-1)!.name,
    };
  });
  return result
    .toSorted((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
    .slice(q.offset, q.offset + q.limit);
}
async function journey(q: AnalyticsQuery, contextId: string) {
  await requirePersonal(q);
  return (await repo.events(q))
    .filter((e) => e.contextId === contextId)
    .map((e) => ({
      id: e.id,
      eventId: e.eventId,
      name: e.name,
      pageHost: e.pageHost,
      pagePath: e.pagePath,
      receivedAt: e.receivedAt,
      occurredAt: e.occurredAt,
      sequence: e.sequence,
      sessionId: e.sessionId,
      trust: e.trust,
      action: e.action,
      destination: e.destination,
      // Where this step came from, when it says (a landing from an ad, a
      // search, another site): the journey's source, shown on its first step.
      referrerHost: e.referrerHost,
      referrerPath: e.referrerPath,
      campaignSource: e.campaignSource,
      campaignMedium: e.campaignMedium,
      campaignName: e.campaignName,
      campaignContent: e.campaignContent,
      campaignTerm: e.campaignTerm,
      clickIdType: e.clickIdType,
      channel:
        e.clickIdType ||
        e.campaignSource ||
        (e.referrerHost && e.referrerHost !== e.pageHost)
          ? channelFor(e)
          : null,
    }));
}
async function journeyMap(q: AnalyticsQuery) {
  await requirePersonal(q);
  const [events, customers] = await Promise.all([
    repo.events(q),
    repo.customers(q),
  ]);
  const exact = new Map(
    customers
      .filter((c) => c.contextId && c.method === "exact")
      .map((c) => [c.contextId!, c.externalId]),
  );
  return {
    paths: events
      .filter((e) => e.name === "page_view" && e.pagePath)
      .map((e) => ({
        contextId: e.contextId,
        receivedAt: e.receivedAt,
        sequence: e.sequence,
        host: e.pageHost,
        path: e.pagePath,
        organizationId: exact.get(e.contextId) ?? null,
        customerBinding: exact.has(e.contextId)
          ? ("exact" as const)
          : ("anonymous" as const),
      })),
    inferredAttributions: customers
      .filter((c) => c.method === "ip_time")
      .map((c) => ({
        organizationId: c.externalId,
        method: c.method,
        clickEventId: c.clickEventId,
      })),
  };
}
async function customerRows(q: AnalyticsQuery) {
  await requirePersonal(q);
  const [customers, outcomes, events, config] = await Promise.all([
    repo.customers(q),
    repo.outcomes(q),
    repo.events(q),
    reportingSettings(q.projectId),
  ]);
  return customers
    .filter((c) => inWindow(c.acquiredAt ?? c.firstSeenAt, q))
    .slice(q.offset, q.offset + q.limit)
    .map((c) => ({
      id: c.id,
      organizationId: c.externalId,
      issuer: c.issuer,
      method: c.method,
      acquiredAt: c.acquiredAt,
      firstSeenAt: c.firstSeenAt,
      contextId: c.contextId,
      reason: c.reason,
      lifecycle: c.lifecycle,
      decisionVersion: c.decisionVersion,
      onboarding: onboardingStatus({
        startedAt:
          outcomes
            .filter(
              (o) =>
                o.customerId === c.id && o.name === "registration_completed",
            )
            .map((o) => o.occurredAt)
            .toSorted()[0] ??
          events.find(
            (e) => e.contextId === c.contextId && e.name === "product_opened",
          )?.receivedAt ??
          null,
        completedAt:
          outcomes
            .filter(
              (o) => o.customerId === c.id && o.name === config.onboardingEvent,
            )
            .map((o) => o.occurredAt)
            .toSorted()[0] ?? null,
        instrumented: config.onboardingInstrumented,
        waitDays: config.onboardingWaitDays,
        asOf: new Date(
          Math.min(Date.now(), Date.parse(repo.windowFor(q).to)),
        ).toISOString(),
      }),
    }));
}
async function acquisition(q: AnalyticsQuery) {
  return (await customerRows(q)).filter((c) => c.acquiredAt);
}
export const AnalyticsQueries = {
  overview,
  journeys,
  journey,
  journeyMap,
  customers: customerRows,
  acquisition,
  funnels,
};
