import { AnalyticsRepository as repo } from "./AnalyticsRepository";
import type { AnalyticsQuery } from "@/types/schemas/analytics";
export async function acquisitionDimensions(q: AnalyticsQuery) {
  const [events, customers] = await Promise.all([
    repo.events(q),
    repo.customers(q),
  ]);
  const rows = new Map<
    string,
    {
      dimension: string;
      label: string;
      visitors: Set<string>;
      landings: Set<string>;
      assists: Set<string>;
      cta: Set<string>;
      customers: Set<string>;
    }
  >();
  const contexts = new Map<string, typeof events>();
  for (const event of events) {
    const group = contexts.get(event.contextId) ?? [];
    group.push(event);
    contexts.set(event.contextId, group);
  }
  for (const [contextId, history] of contexts) {
    const landing = history.find((e) => e.name === "page_view");
    const acquired = customers.filter(
      (c) => c.acquiredAt && history.some((e) => e.id === c.clickEventId),
    );
    for (const event of history) {
      const dimensions = [
        [
          "sources",
          event.campaignSource ?? event.referrerHost ?? "Direct / unknown",
        ],
        [
          "campaigns",
          [event.campaignSource, event.campaignMedium, event.campaignName]
            .filter(Boolean)
            .join(" / ") || "No campaign",
        ],
        ["pages", event.pagePath],
        ["destinations", event.destination],
      ];
      for (const [dimension, label] of dimensions) {
        if (!label) continue;
        const key = `${dimension}:${label}`;
        const row = rows.get(key) ?? {
          dimension: dimension!,
          label,
          visitors: new Set<string>(),
          landings: new Set<string>(),
          assists: new Set<string>(),
          cta: new Set<string>(),
          customers: new Set<string>(),
        };
        row.visitors.add(contextId);
        if (event.id === landing?.id) row.landings.add(contextId);
        acquired.forEach((customer) => {
          if (event.id === customer.clickEventId) {
            row.customers.add(customer.id);
            row.cta.add(customer.id);
          }
          if (event.name === "page_view") row.assists.add(customer.id);
        });
        rows.set(key, row);
      }
    }
  }
  return {
    rows: [...rows.values()]
      .map((r) => ({
        dimension: r.dimension,
        label: r.label,
        visitors: r.visitors.size,
        landings: r.landings.size,
        assists: r.assists.size,
        cta: r.cta.size,
        customers: r.customers.size,
      }))
      .toSorted((a, b) => b.visitors - a.visitors),
    definition:
      "Entry-context cohort in the selected period, with retained later customer acquisitions. Assists overlap and must not be summed as customers or revenue. Source and campaign labels preserve permitted referrer/UTM evidence; direct and unknown are not distinguished.",
  };
}
