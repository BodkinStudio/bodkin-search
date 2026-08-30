/* eslint-disable max-lines -- detector keeps related validation and rule evidence together */
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
const DETECTOR_VERSION = "priority-page-click-decline-v1";

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

function siteTotals(
  snapshot: GrowthSearchPerformanceSnapshot,
  expectedDays: string[],
) {
  if (snapshot.siteContext.status !== "complete") return null;
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
  const materialSiteDecline =
    siteBaseline != null &&
    siteCurrent != null &&
    siteBaseline >= thresholds.minimumBaselineClicks &&
    siteBaseline - siteCurrent >= thresholds.minimumLostClicks &&
    siteDecline != null &&
    siteDecline >= thresholds.minimumDeclinePercent;

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
    const baselineClicks = observedTotals(
      snapshot.observations,
      new Set([canonicalUrl]),
      baselineDays,
    );
    const currentClicks = observedTotals(
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
    if (baselineClicks < thresholds.minimumBaselineClicks) {
      outcomes.push({
        keyPageId: page.id,
        status: "suppressed",
        suppressionReason: "low_baseline",
        baselineClicks,
        currentClicks,
        lostClicks,
        declinePercent,
      });
      continue;
    }
    if (
      lostClicks < thresholds.minimumLostClicks ||
      declinePercent < thresholds.minimumDeclinePercent
    ) {
      outcomes.push({
        keyPageId: page.id,
        status: "suppressed",
        suppressionReason: "not_material",
        baselineClicks,
        currentClicks,
        lostClicks,
        declinePercent,
      });
      continue;
    }
    if (
      materialSiteDecline &&
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
      detectorVersion: DETECTOR_VERSION,
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
