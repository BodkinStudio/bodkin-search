/* eslint-disable complexity, max-lines -- detector keeps related validation and rule evidence together */
import { sha256Hex } from "@/server/lib/audit/ids";
import { AppError } from "@/server/lib/errors";
import { normalizeKeyPageUrl } from "@/server/features/project-context/services/contextUpdateOps";
import { calendarDateInTimezone } from "./GrowthMeasurementFacts";
import {
  DEFAULT_PRIORITY_PAGE_CLICK_DECLINE_THRESHOLDS,
  growthSearchPerformanceSnapshotSchema,
  priorityPageClickDeclineThresholdsSchema,
  type GrowthSearchPerformanceSnapshot,
} from "@/types/schemas/growth-search-performance";
import {
  recordGrowthSignalSchema,
  type RecordGrowthSignalInput,
} from "@/types/schemas/growth";
import { z } from "zod";

const SOURCE_TIMEZONE = "America/Los_Angeles";
export const PRIORITY_PAGE_CLICK_DECLINE_DETECTOR_VERSION =
  "priority-page-click-decline-v2";
export const PRIORITY_PAGE_CLICK_DECLINE_DETECTOR_VERSIONS = [
  "priority-page-click-decline-v1",
  PRIORITY_PAGE_CLICK_DECLINE_DETECTOR_VERSION,
] as const;
type PriorityPageClickDeclineDetectorVersion =
  (typeof PRIORITY_PAGE_CLICK_DECLINE_DETECTOR_VERSIONS)[number];

export function isPriorityPageClickDeclineDetectorVersion(
  value: unknown,
): value is PriorityPageClickDeclineDetectorVersion {
  return PRIORITY_PAGE_CLICK_DECLINE_DETECTOR_VERSIONS.some(
    (version) => version === value,
  );
}

const priorityPageClickDeclineDetectorInputSchema = z.strictObject({
  projectId: z.string().trim().min(1).max(100),
  runId: z.string().trim().min(1).max(100),
  snapshot: growthSearchPerformanceSnapshotSchema,
  baselineWindow: z.strictObject({
    startDate: z.string().trim().min(1).max(10),
    endDate: z.string().trim().min(1).max(10),
  }),
  currentWindow: z.strictObject({
    startDate: z.string().trim().min(1).max(10),
    endDate: z.string().trim().min(1).max(10),
  }),
  thresholds: priorityPageClickDeclineThresholdsSchema.optional(),
});

type DeclineInput = z.infer<typeof priorityPageClickDeclineDetectorInputSchema>;

const SUPPRESSION_REASONS = [
  "retrieval_capped",
  "site_context_incomplete",
  "missing_observation",
  "zero_baseline",
  "low_baseline",
  "not_material",
  "site_wide_decline",
] as const;

type SuppressionReason =
  | "retrieval_capped"
  | "site_context_incomplete"
  | "missing_observation"
  | "zero_baseline"
  | "low_baseline"
  | "not_material"
  | "site_wide_decline";

type PriorityPageClickDeclineOutcome = {
  keyPageId: string;
  status: "signal" | "suppressed";
  suppressionReason?: SuppressionReason;
  baselineClicks?: number;
  currentClicks?: number;
  lostClicks?: number;
  declinePercent?: number;
  priority?: number;
  signal?: RecordGrowthSignalInput;
};

const outcomeFacts = {
  keyPageId: z.string().trim().min(1).max(100),
  baselineClicks: z.number().int().nonnegative().safe().optional(),
  currentClicks: z.number().int().nonnegative().safe().optional(),
  lostClicks: z.number().int().optional(),
  declinePercent: z.number().finite().optional(),
} as const;

const priorityPageClickDeclineOutcomeSchema = z.union([
  z.strictObject({
    ...outcomeFacts,
    status: z.literal("suppressed"),
    suppressionReason: z.enum(SUPPRESSION_REASONS),
  }),
  z.strictObject({
    ...outcomeFacts,
    status: z.literal("signal"),
    priority: z.number().finite().nonnegative(),
    signal: recordGrowthSignalSchema,
  }),
]);

function validation(message: string): never {
  throw new AppError("VALIDATION_ERROR", message);
}

function compareCodeUnits(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function dateMs(date: string) {
  const result = Date.parse(`${date}T00:00:00.000Z`);
  if (
    !Number.isFinite(result) ||
    new Date(result).toISOString().slice(0, 10) !== date
  ) {
    validation("Detector windows must use valid calendar dates");
  }
  return result;
}

function days(window: { startDate: string; endDate: string }) {
  const start = dateMs(window.startDate);
  const end = dateMs(window.endDate);
  if (end < start) validation("Detector window end must not precede its start");
  const result: string[] = [];
  for (let value = start; value <= end; value += 86_400_000) {
    result.push(new Date(value).toISOString().slice(0, 10));
  }
  return result;
}

function safeAdd(left: number, right: number) {
  const sum = left + right;
  if (!Number.isSafeInteger(sum))
    validation("Observed click total exceeds safe integer range");
  return sum;
}

function expectedAliases(url: string) {
  const normalized = new URL(normalizeKeyPageUrl(url));
  const hostname = normalized.hostname.replace(/^www\./, "");
  return ["http:", "https:"].flatMap((protocol) =>
    [hostname, `www.${hostname}`].map((host) => {
      const alias = new URL(normalized.toString());
      alias.protocol = protocol;
      alias.hostname = host;
      return alias.toString();
    }),
  );
}

function validateWindows(
  input: DeclineInput,
  snapshot: GrowthSearchPerformanceSnapshot,
) {
  const sourceStart = dateMs(snapshot.sourceWindow.startDate);
  const sourceEnd = dateMs(snapshot.sourceWindow.endDate);
  if (sourceEnd < sourceStart) validation("Snapshot source window is invalid");
  if ((sourceEnd - sourceStart) / 86_400_000 + 1 > 90)
    validation("Snapshot source window cannot exceed 90 days");
  const baselineStart = dateMs(input.baselineWindow.startDate);
  const baselineEnd = dateMs(input.baselineWindow.endDate);
  const currentStart = dateMs(input.currentWindow.startDate);
  const currentEnd = dateMs(input.currentWindow.endDate);
  if (baselineEnd < baselineStart || currentEnd < currentStart)
    validation("Detector window end must not precede its start");
  const baselineLength = (baselineEnd - baselineStart) / 86_400_000 + 1;
  const currentLength = (currentEnd - currentStart) / 86_400_000 + 1;
  if (baselineLength > 90 || currentLength > 90)
    validation("Detector windows cannot exceed 90 days");
  if (baselineLength !== currentLength)
    validation("Detector windows must be equal length");
  if (baselineEnd >= currentStart)
    validation("Detector windows must be adjacent without overlap");
  if (baselineEnd !== currentStart - 86_400_000)
    validation(
      "Detector comparison window must immediately precede current window",
    );
  if (
    baselineStart < sourceStart ||
    baselineEnd > sourceEnd ||
    currentStart < sourceStart ||
    currentEnd > sourceEnd
  )
    validation("Detector windows must be contained in the source snapshot");
  const capturedAt = new Date(snapshot.capturedAt);
  if (Number.isNaN(capturedAt.valueOf()))
    validation("Snapshot capture time is invalid");
  const latestFinalDate = new Date(
    `${calendarDateInTimezone(capturedAt.toISOString(), SOURCE_TIMEZONE)}T00:00:00.000Z`,
  );
  latestFinalDate.setUTCDate(latestFinalDate.getUTCDate() - 3);
  if (
    snapshot.sourceWindow.endDate > latestFinalDate.toISOString().slice(0, 10)
  ) {
    validation("Snapshot source window does not satisfy the final-data lag");
  }
  return {
    baselineDays: days(input.baselineWindow),
    currentDays: days(input.currentWindow),
    capturedAt: capturedAt.toISOString(),
  };
}

function observedTotals(
  observations: GrowthSearchPerformanceSnapshot["observations"],
  rawUrls: Set<string>,
  expectedDays: string[],
) {
  const clicksByDay = new Map<string, number>();
  for (const observation of observations) {
    if (!rawUrls.has(normalizeKeyPageUrl(observation.rawUrl))) continue;
    clicksByDay.set(
      observation.date,
      safeAdd(clicksByDay.get(observation.date) ?? 0, observation.clicks),
    );
  }
  let total = 0;
  for (const day of expectedDays) {
    const value = clicksByDay.get(day);
    if (value === undefined) return null;
    total = safeAdd(total, value);
  }
  return total;
}

const LOG_TWO = Math.log(2);
const HALF_LOG_TWO_PI = 0.9189385332046727;
const LANCZOS_COEFFICIENTS = [
  0.9999999999998099, 676.5203681218851, -1259.1392167224028, 771.3234287776531,
  -176.6150291621406, 12.507343278686905, -0.13857109526572012,
  9.984369578019572e-6, 1.5056327351493116e-7,
];

function logGamma(value: number) {
  const shifted = value - 1;
  let coefficients = LANCZOS_COEFFICIENTS[0];
  for (let index = 1; index < LANCZOS_COEFFICIENTS.length; index += 1)
    coefficients += LANCZOS_COEFFICIENTS[index] / (shifted + index);
  const offset = shifted + LANCZOS_COEFFICIENTS.length - 1.5;
  return (
    HALF_LOG_TWO_PI +
    (shifted + 0.5) * Math.log(offset) -
    offset +
    Math.log(coefficients)
  );
}

function exactCountLogPValue(baseline: number, current: number) {
  const total = safeAdd(baseline, current);
  if (total === 0) return 0;
  // P(X <= current), X ~ Binomial(total, .5). Start with the largest term in
  // the lower tail and accumulate smaller terms relative to it, so neither the
  // initial mass nor the final probability can underflow to a false zero.
  const logLargestTerm =
    logGamma(total + 1) -
    logGamma(current + 1) -
    logGamma(baseline + 1) -
    total * LOG_TWO;
  let relativeTerm = 1;
  let relativeSum = 1;
  for (let k = current; k > 0; k -= 1) {
    relativeTerm *= k / (total - k + 1);
    const nextSum = relativeSum + relativeTerm;
    if (nextSum === relativeSum) break;
    relativeSum = nextSum;
  }
  return logLargestTerm + Math.log(relativeSum);
}

function isExactCountSignificant(
  baseline: number,
  current: number,
  configuredPageCount: number,
) {
  const logPValue = exactCountLogPValue(baseline, current);
  return (
    Number.isFinite(logPValue) &&
    logPValue <= Math.log(0.05 / configuredPageCount)
  );
}

function isMaterialDecline(input: {
  baseline: number;
  current: number;
  thresholds: z.infer<typeof priorityPageClickDeclineThresholdsSchema>;
  configuredPageCount: number;
  requireCompleteSiteContext: boolean;
  lowVolumeEnabled: boolean;
}) {
  if (input.baseline === 0) return false;
  const lost = input.baseline - input.current;
  const decline = lost / input.baseline;
  if (decline < input.thresholds.minimumDeclinePercent) return false;
  if (input.baseline >= input.thresholds.minimumBaselineClicks)
    return lost >= input.thresholds.minimumLostClicks;
  return (
    input.lowVolumeEnabled &&
    input.requireCompleteSiteContext &&
    isExactCountSignificant(
      input.baseline,
      input.current,
      input.configuredPageCount,
    )
  );
}

function siteTotals(
  snapshot: GrowthSearchPerformanceSnapshot,
  expectedDays: string[],
) {
  if (snapshot.siteContext.status !== "complete") return null;
  if (snapshot.siteContext.coverage !== "sparse_date_inventory_v2") {
    const byDay = new Map(
      snapshot.siteContext.observations.map((row) => [row.date, row.clicks]),
    );
    let total = 0;
    for (const day of expectedDays) {
      const value = byDay.get(day);
      if (value === undefined) return null;
      total = safeAdd(total, value);
    }
    return total;
  }
  let total = 0;
  for (const row of snapshot.siteContext.observations)
    if (expectedDays.includes(row.date)) total = safeAdd(total, row.clicks);
  return total;
}

/** Pure rule evaluation except for the deterministic SHA-256 provenance digest. */
export async function detectPriorityPageClickDeclines(
  input: DeclineInput,
): Promise<PriorityPageClickDeclineOutcome[]> {
  input = priorityPageClickDeclineDetectorInputSchema.parse(input);
  const snapshot = input.snapshot;
  if (snapshot.projectId !== input.projectId)
    validation("Snapshot belongs to another project");
  if (
    snapshot.source.calendar !== SOURCE_TIMEZONE ||
    snapshot.source.searchType !== "web" ||
    snapshot.source.dataState !== "final" ||
    !snapshot.source.pageRowsMayBeOmitted
  )
    validation("Snapshot source provenance is incompatible with this detector");
  if (!input.runId.trim() || input.runId.length > 100)
    validation("Run id is invalid");
  const thresholds = priorityPageClickDeclineThresholdsSchema.parse(
    input.thresholds ?? DEFAULT_PRIORITY_PAGE_CLICK_DECLINE_THRESHOLDS,
  );
  const { baselineDays, currentDays, capturedAt } = validateWindows(
    input,
    snapshot,
  );
  const normalizedPages = new Map<string, string>();
  for (const page of snapshot.keyPages) {
    const normalized = normalizeKeyPageUrl(page.url);
    if (normalizedPages.has(normalized))
      validation("Duplicate canonical key-page URL");
    normalizedPages.set(normalized, page.id);
  }
  if (snapshot.comparisonEvidence) {
    const comparison = snapshot.comparisonEvidence;
    if (
      comparison.baselineWindow.startDate !== input.baselineWindow.startDate ||
      comparison.baselineWindow.endDate !== input.baselineWindow.endDate ||
      comparison.currentWindow.startDate !== input.currentWindow.startDate ||
      comparison.currentWindow.endDate !== input.currentWindow.endDate
    )
      validation("Comparison evidence windows differ from detector windows");
    for (const fact of comparison.pages) {
      const page = snapshot.keyPages.find(
        (candidate) => candidate.id === fact.keyPageId,
      );
      if (!page)
        validation("Comparison evidence references an unknown key page");
      const expected = expectedAliases(page.url);
      if (
        fact.aliases.length !== expected.length ||
        fact.aliases.some((alias, index) => alias !== expected[index])
      )
        validation("Comparison evidence aliases do not match key page");
    }
  }
  const siteBaseline = siteTotals(snapshot, baselineDays);
  const siteCurrent = siteTotals(snapshot, currentDays);
  const incompleteSiteContext =
    snapshot.siteContext.status === "requested_incomplete" ||
    (snapshot.siteContext.status === "complete" &&
      (siteBaseline == null || siteCurrent == null));
  const siteDecline =
    siteBaseline != null && siteCurrent != null && siteBaseline > 0
      ? (siteBaseline - siteCurrent) / siteBaseline
      : null;
  const comparisonFacts =
    snapshot.comparisonEvidence?.status === "complete"
      ? new Map(
          snapshot.comparisonEvidence.pages.map((fact) => [
            fact.keyPageId,
            fact,
          ]),
        )
      : null;
  const materialSiteDecline =
    siteBaseline != null &&
    siteCurrent != null &&
    isMaterialDecline({
      baseline: siteBaseline,
      current: siteCurrent,
      thresholds,
      configuredPageCount: 1,
      requireCompleteSiteContext: snapshot.siteContext.status === "complete",
      lowVolumeEnabled: comparisonFacts !== null,
    });

  const outcomes: PriorityPageClickDeclineOutcome[] = [];
  for (const page of [...snapshot.keyPages].toSorted((left, right) =>
    compareCodeUnits(left.id, right.id),
  )) {
    if (snapshot.retrievalStatus === "capped") {
      outcomes.push({
        keyPageId: page.id,
        status: "suppressed",
        suppressionReason: "retrieval_capped",
      });
      continue;
    }
    if (incompleteSiteContext) {
      outcomes.push({
        keyPageId: page.id,
        status: "suppressed",
        suppressionReason: "site_context_incomplete",
      });
      continue;
    }
    const canonicalUrl = normalizeKeyPageUrl(page.url);
    const fact = comparisonFacts?.get(page.id);
    const baselineClicks =
      fact?.baseline.clicks ??
      observedTotals(
        snapshot.observations,
        new Set([canonicalUrl]),
        baselineDays,
      );
    const currentClicks =
      fact?.current.clicks ??
      observedTotals(
        snapshot.observations,
        new Set([canonicalUrl]),
        currentDays,
      );
    if (baselineClicks == null || currentClicks == null) {
      outcomes.push({
        keyPageId: page.id,
        status: "suppressed",
        suppressionReason: "missing_observation",
      });
      continue;
    }
    if (baselineClicks === 0) {
      outcomes.push({
        keyPageId: page.id,
        status: "suppressed",
        suppressionReason: "zero_baseline",
        baselineClicks,
        currentClicks,
      });
      continue;
    }
    const lostClicks = baselineClicks - currentClicks;
    const declinePercent = lostClicks / baselineClicks;
    if (
      !isMaterialDecline({
        baseline: baselineClicks,
        current: currentClicks,
        thresholds,
        configuredPageCount: snapshot.keyPages.length,
        requireCompleteSiteContext:
          snapshot.siteContext.status === "complete" && !incompleteSiteContext,
        lowVolumeEnabled: comparisonFacts !== null,
      })
    ) {
      outcomes.push({
        keyPageId: page.id,
        status: "suppressed",
        suppressionReason:
          baselineClicks < thresholds.minimumBaselineClicks
            ? "low_baseline"
            : "not_material",
        baselineClicks,
        currentClicks,
        lostClicks,
        declinePercent,
      });
      continue;
    }
    if (
      materialSiteDecline &&
      siteDecline !== null &&
      declinePercent <= siteDecline + thresholds.siteSuppressionMarginPercent
    ) {
      outcomes.push({
        keyPageId: page.id,
        status: "suppressed",
        suppressionReason: "site_wide_decline",
        baselineClicks,
        currentClicks,
        lostClicks,
        declinePercent,
      });
      continue;
    }
    const priority = lostClicks * (page.commercialWeight ?? 1);
    if (!Number.isSafeInteger(priority) || priority < 0)
      validation("Priority must be finite");
    const provenance = {
      detectorVersion: PRIORITY_PAGE_CLICK_DECLINE_DETECTOR_VERSION,
      projectId: snapshot.projectId,
      property: snapshot.property,
      keyPageId: page.id,
      keyPageUrl: canonicalUrl,
      capturedAt,
      baselineWindow: input.baselineWindow,
      currentWindow: input.currentWindow,
      thresholds,
      observations: snapshot.observations
        .filter(
          (row) =>
            normalizeKeyPageUrl(row.rawUrl) === canonicalUrl &&
            (baselineDays.includes(row.date) || currentDays.includes(row.date)),
        )
        .toSorted((left, right) =>
          compareCodeUnits(
            `${left.date}\u0000${left.rawUrl}`,
            `${right.date}\u0000${right.rawUrl}`,
          ),
        ),
      siteContext:
        snapshot.siteContext.status === "complete"
          ? {
              ...snapshot.siteContext,
              observations: [...snapshot.siteContext.observations].toSorted(
                (left, right) => compareCodeUnits(left.date, right.date),
              ),
            }
          : snapshot.siteContext,
      comparisonEvidence: snapshot.comparisonEvidence
        ? {
            ...snapshot.comparisonEvidence,
            pages: [...snapshot.comparisonEvidence.pages].toSorted(
              (left, right) =>
                compareCodeUnits(left.keyPageId, right.keyPageId),
            ),
          }
        : undefined,
    };
    const evidenceRef = `gsc:${await sha256Hex(JSON.stringify(provenance))}`;
    const signal = recordGrowthSignalSchema.parse({
      projectId: input.projectId,
      runId: input.runId,
      signalType: "priority_page_click_decline",
      entityType: "key_page",
      entityRef: page.id,
      metric: "gsc_clicks",
      severity:
        baselineClicks >= thresholds.minimumBaselineClicks &&
        lostClicks >= thresholds.criticalLostClicks &&
        declinePercent >= thresholds.criticalDeclinePercent
          ? "critical"
          : "warning",
      confidence: 0.8,
      periodStart: input.currentWindow.startDate,
      periodEnd: input.currentWindow.endDate,
      baselineValue: baselineClicks,
      currentValue: currentClicks,
      deltaValue: -lostClicks,
      deltaPercent: -declinePercent * 100,
      evidenceKind: "gsc_period",
      evidenceRef,
      capturedAt,
    });
    outcomes.push({
      keyPageId: page.id,
      status: "signal",
      baselineClicks,
      currentClicks,
      lostClicks,
      declinePercent,
      priority,
      signal,
    });
  }
  return outcomes
    .toSorted(
      (left, right) =>
        (right.priority ?? -1) - (left.priority ?? -1) ||
        compareCodeUnits(left.keyPageId, right.keyPageId),
    )
    .map((outcome) => priorityPageClickDeclineOutcomeSchema.parse(outcome));
}
