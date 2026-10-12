import { z } from "zod";

// Microsoft Clarity's Data Export API: what Clarity measured on each page
// over the last 24 hours. Clarity allows a project ten requests a day and
// only reaches back three days, so this is asked once a day and kept.

const ENDPOINT =
  "https://www.clarity.ms/export-data/api/v1/project-live-insights";

const responseSchema = z.array(
  z.object({
    metricName: z.string(),
    information: z.array(z.record(z.string(), z.unknown())).nullish(),
  }),
);

/** What is kept for a page. Sessions and bot sessions are counts; the rest are averages over its sessions. */
export type ClarityMeasures = {
  sessions?: number;
  botSessions?: number;
  scrollDepth?: number;
  activeTime?: number;
  deadClickPct?: number;
  rageClickPct?: number;
  quickBackPct?: number;
  excessiveScrollPct?: number;
  errorClickPct?: number;
  scriptErrorPct?: number;
};

/** Clarity's metric and field, and the measure it is kept as. */
const MEASURES: [
  metric: string,
  field: string,
  measure: keyof ClarityMeasures,
][] = [
  ["Traffic", "totalSessionCount", "sessions"],
  ["Traffic", "totalBotSessionCount", "botSessions"],
  ["ScrollDepth", "averageScrollDepth", "scrollDepth"],
  ["EngagementTime", "activeTime", "activeTime"],
  ["DeadClickCount", "sessionsWithMetricPercentage", "deadClickPct"],
  ["RageClickCount", "sessionsWithMetricPercentage", "rageClickPct"],
  ["QuickbackClick", "sessionsWithMetricPercentage", "quickBackPct"],
  ["ExcessiveScroll", "sessionsWithMetricPercentage", "excessiveScrollPct"],
  ["ErrorClickCount", "sessionsWithMetricPercentage", "errorClickPct"],
  ["ScriptErrorCount", "sessionsWithMetricPercentage", "scriptErrorPct"],
];

/** A failure whose message is safe to keep and show: it never carries the token. */
export class ClarityError extends Error {}

function errorMessage(status: number) {
  if (status === 401 || status === 403)
    return "Clarity rejected the token. Create a new one in Clarity under Settings, Data Export.";
  if (status === 429)
    return "Clarity's daily request limit for this project is used up.";
  return `Clarity API error (${status}).`;
}

/** Every page Clarity saw in the last 24 hours, with its measures. */
export async function clarityPageInsights(
  token: string,
  fetchImpl: typeof fetch = fetch,
) {
  const response = await fetchImpl(`${ENDPOINT}?numOfDays=1&dimension1=URL`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new ClarityError(errorMessage(response.status));
  const metrics = responseSchema.parse(await response.json());
  const pages = new Map<string, ClarityMeasures>();
  for (const metric of metrics) {
    const fields = MEASURES.filter(([name]) => name === metric.metricName);
    for (const row of fields.length ? (metric.information ?? []) : []) {
      const url = Object.entries(row).find(
        ([key]) => key.toLowerCase() === "url",
      )?.[1];
      if (typeof url !== "string" || !url) continue;
      const measures = pages.get(url) ?? {};
      for (const [, field, measure] of fields) {
        // Clarity sends numbers as numbers or as strings, and null for no data.
        const raw = row[field];
        const value =
          typeof raw === "number" || (typeof raw === "string" && raw !== "")
            ? Number(raw)
            : Number.NaN;
        if (Number.isFinite(value)) measures[measure] = value;
      }
      pages.set(url, measures);
    }
  }
  return [...pages].map(([url, measures]) => ({ url, measures }));
}
