import { GscService } from "@/server/features/gsc/services/GscService";
import { ProjectContextRepository } from "@/server/features/project-context/repositories/ProjectContextRepository";
import { normalizeKeyPageUrl } from "@/server/features/project-context/services/contextUpdateOps";
import { calendarDateInTimezone } from "./GrowthMeasurementFacts";
import { AppError } from "@/server/lib/errors";
import {
  growthSearchPerformanceObservationSchema,
  growthSearchPerformanceSnapshotSchema,
  type GrowthSearchPerformanceSnapshot,
} from "@/types/schemas/growth-search-performance";
import { z } from "zod";
import type {
  FrozenGrowthSearchPerformanceSnapshot,
  FrozenTargetCollectionInput,
  GrowthSearchPerformanceCollectionInput,
} from "./GrowthSearchPerformanceAdapterTypes";
import { growthSearchPerformanceRequestWindows } from "./GrowthSearchPerformanceWindows";

const ROW_LIMIT = 1000;
export const GROWTH_SEARCH_PERFORMANCE_MAX_PAGE_REQUESTS = 25;
const MAX_FROZEN_WINDOW_DAYS = 365;
const SOURCE_TIMEZONE = "America/Los_Angeles";

const collectionInputSchema = z.strictObject({
  projectId: z.string().trim().min(1).max(100),
  startDate: z.string().trim().min(1).max(10),
  endDate: z.string().trim().min(1).max(10),
  capturedAt: z.string().datetime({ offset: true }),
  includeSiteContext: z.boolean().optional(),
  maxPageRequests: z
    .number()
    .int()
    .min(1)
    .max(GROWTH_SEARCH_PERFORMANCE_MAX_PAGE_REQUESTS)
    .optional(),
});
const gscRowSchema = z.object({
  keys: z.array(z.string().min(1)),
  clicks: z.number().int().nonnegative().safe(),
  impressions: z.number().int().nonnegative().safe(),
});
const frozenTargetCollectionInputSchema = collectionInputSchema
  .omit({ includeSiteContext: true })
  .extend({
    targetUrls: z
      .array(growthSearchPerformanceObservationSchema.shape.rawUrl)
      .min(1)
      .max(50),
  });

function validation(message: string): never {
  throw new AppError("VALIDATION_ERROR", message);
}

function daysInclusive(startDate: string, endDate: string) {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    new Date(start).toISOString().slice(0, 10) !== startDate ||
    new Date(end).toISOString().slice(0, 10) !== endDate ||
    end < start
  ) {
    validation("Collection dates must be valid inclusive calendar dates");
  }
  return (end - start) / 86_400_000 + 1;
}

function subtractDays(date: string, days: number) {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() - days);
  return result.toISOString().slice(0, 10);
}

function assertRequest(
  request: {
    startDate: string;
    endDate: string;
    dimensions?: string[];
    rowLimit?: number;
    startRow?: number;
    type?: string;
    dataState?: string;
    aggregationType?: string;
    dimensionFilterGroups?: unknown;
  },
  expected: {
    startDate: string;
    endDate: string;
    startRow: number;
    dimensions: string[];
  },
) {
  if (
    request.startDate !== expected.startDate ||
    request.endDate !== expected.endDate ||
    request.rowLimit !== ROW_LIMIT ||
    request.startRow !== (expected.startRow || undefined) ||
    request.type !== "web" ||
    request.dataState !== "final" ||
    request.aggregationType !== undefined ||
    request.dimensionFilterGroups !== undefined ||
    request.dimensions?.join("\u0000") !== expected.dimensions.join("\u0000")
  ) {
    validation(
      "Search Console returned a request that differs from collection",
    );
  }
}

function parseRows(rows: unknown[], dimensions: "page_date" | "date") {
  return rows.map((row) => {
    const value = gscRowSchema.parse(row);
    const { keys, clicks, impressions } = value;
    const expectedKeyCount = dimensions === "page_date" ? 2 : 1;
    if (
      !Array.isArray(keys) ||
      keys.length !== expectedKeyCount ||
      !keys.every((key) => typeof key === "string" && key.length > 0)
    ) {
      validation("Search Console returned malformed row keys");
    }
    const [first, second] = keys;
    const date = dimensions === "page_date" ? second : first;
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      new Date(`${date}T00:00:00.000Z`).toISOString().slice(0, 10) !== date
    ) {
      validation("Search Console returned an invalid row date");
    }
    if (dimensions === "page_date") {
      return growthSearchPerformanceObservationSchema.parse({
        rawUrl: first,
        date,
        clicks,
        impressions,
      });
    }
    return {
      rawUrl: undefined,
      date,
      clicks,
      impressions,
    };
  });
}

async function collectPageRows(
  input: GrowthSearchPerformanceCollectionInput,
  matchesUrl: (url: string) => boolean,
) {
  const observations: Array<{
    rawUrl: string;
    date: string;
    clicks: number;
    impressions: number;
  }> = [];
  const coordinates = new Set<string>();
  let property: string | null = null;
  let retrievalStatus: "exhausted" | "capped" = "capped";
  let startRow = 0;
  let requestsUsed = 0;
  const maxCalls =
    input.maxPageRequests ?? GROWTH_SEARCH_PERFORMANCE_MAX_PAGE_REQUESTS;
  for (let call = 0; call < maxCalls; call += 1) {
    requestsUsed += 1;
    const result = await GscService.getPerformance({
      projectId: input.projectId,
      startDate: input.startDate,
      endDate: input.endDate,
      dimensions: ["page", "date"],
      rowLimit: ROW_LIMIT,
      startRow,
      type: "web",
      dataState: "final",
    });
    assertRequest(result.request, {
      startDate: input.startDate,
      endDate: input.endDate,
      startRow,
      dimensions: ["page", "date"],
    });
    if (property !== null && result.siteUrl !== property)
      validation("Search Console property changed during collection");
    property = result.siteUrl;
    const rows = parseRows(result.rows, "page_date");
    if (rows.length > ROW_LIMIT)
      validation("Search Console returned more rows than requested");
    if (rows.length === 0) {
      retrievalStatus = "exhausted";
      break;
    }
    for (const row of rows) {
      const rawUrl = row.rawUrl!;
      normalizeKeyPageUrl(rawUrl);
      if (row.date < input.startDate || row.date > input.endDate)
        validation(
          "Search Console returned a row outside the collection window",
        );
      const coordinate = `${rawUrl}\u0000${row.date}`;
      if (coordinates.has(coordinate))
        validation("Search Console returned duplicate raw URL/day rows");
      coordinates.add(coordinate);
      if (matchesUrl(rawUrl)) {
        observations.push({
          rawUrl,
          date: row.date,
          clicks: row.clicks,
          impressions: row.impressions,
        });
      }
    }
    startRow += rows.length;
  }
  if (!property) validation("Search Console did not return a property");
  return { property, retrievalStatus, observations, requestsUsed };
}

/** Collects bounded, observed GSC facts; it intentionally does not infer absent rows. */
export async function collectGrowthSearchPerformance(
  input: GrowthSearchPerformanceCollectionInput,
): Promise<GrowthSearchPerformanceSnapshot> {
  input = collectionInputSchema.parse(input);
  const count = daysInclusive(input.startDate, input.endDate);
  if (count > 90) validation("Collection window cannot exceed 90 days");
  const capturedAt = new Date(input.capturedAt);
  if (Number.isNaN(capturedAt.valueOf())) validation("Capture time is invalid");
  const latestSourceDate = subtractDays(
    calendarDateInTimezone(capturedAt.toISOString(), SOURCE_TIMEZONE),
    3,
  );
  if (input.endDate > latestSourceDate) {
    validation(
      "Collection end must be at least three Pacific calendar days before capture",
    );
  }
  const maxCalls =
    input.maxPageRequests ?? GROWTH_SEARCH_PERFORMANCE_MAX_PAGE_REQUESTS;
  if (
    !Number.isSafeInteger(maxCalls) ||
    maxCalls < 1 ||
    maxCalls > GROWTH_SEARCH_PERFORMANCE_MAX_PAGE_REQUESTS
  ) {
    validation(
      `Page request cap must be between 1 and ${GROWTH_SEARCH_PERFORMANCE_MAX_PAGE_REQUESTS}`,
    );
  }

  const storedKeyPages = await ProjectContextRepository.listKeyPages(
    input.projectId,
  );
  if (storedKeyPages.length > 100) validation("Project has too many key pages");
  const keyPages = storedKeyPages.map((page) => {
    if (page.projectId !== input.projectId)
      validation("Key page belongs to another project");
    return {
      id: page.id,
      projectId: page.projectId,
      url: normalizeKeyPageUrl(page.url),
      commercialWeight: page.commercialWeight,
    };
  });
  const curatedUrls = new Set(keyPages.map((page) => page.url));

  const { property, retrievalStatus, observations } = await collectPageRows(
    input,
    (rawUrl) => curatedUrls.has(normalizeKeyPageUrl(rawUrl)),
  );

  let siteContext: GrowthSearchPerformanceSnapshot["siteContext"] = {
    status: "absent",
  };
  if (input.includeSiteContext) {
    const result = await GscService.getPerformance({
      projectId: input.projectId,
      startDate: input.startDate,
      endDate: input.endDate,
      dimensions: ["date"],
      rowLimit: ROW_LIMIT,
      type: "web",
      dataState: "final",
    });
    assertRequest(result.request, {
      startDate: input.startDate,
      endDate: input.endDate,
      startRow: 0,
      dimensions: ["date"],
    });
    if (result.siteUrl !== property)
      validation("Search Console property changed during site collection");
    const rows = parseRows(result.rows, "date");
    if (rows.length > ROW_LIMIT)
      validation("Search Console returned more site rows than requested");
    const dates = new Set<string>();
    let complete = true;
    for (const row of rows) {
      if (row.date < input.startDate || row.date > input.endDate) {
        validation(
          "Search Console returned a site row outside the collection window",
        );
      }
      if (dates.has(row.date))
        validation("Search Console returned duplicate site/day rows");
      dates.add(row.date);
    }
    complete = rows.length === count;
    siteContext = complete
      ? {
          status: "complete",
          observations: rows.map(({ date, clicks, impressions }) => ({
            date,
            clicks,
            impressions,
          })),
        }
      : { status: "requested_incomplete" };
  }

  return growthSearchPerformanceSnapshotSchema.parse({
    projectId: input.projectId,
    property,
    capturedAt: capturedAt.toISOString(),
    source: {
      calendar: SOURCE_TIMEZONE,
      searchType: "web",
      dataState: "final",
      pageRowsMayBeOmitted: true,
    },
    sourceWindow: { startDate: input.startDate, endDate: input.endDate },
    retrievalStatus,
    observations,
    keyPages,
    siteContext,
  });
}

/**
 * Collects page/date rows for immutable measurement targets. Target matching is
 * deliberately raw and exact: normalized or trailing-slash variants do not
 * stand in for a frozen URL.
 */
export async function collectFrozenGrowthSearchPerformance(
  input: FrozenTargetCollectionInput,
): Promise<FrozenGrowthSearchPerformanceSnapshot> {
  input = frozenTargetCollectionInputSchema.parse(input);
  const count = daysInclusive(input.startDate, input.endDate);
  if (count > MAX_FROZEN_WINDOW_DAYS)
    validation(
      `Frozen measurement window cannot exceed ${MAX_FROZEN_WINDOW_DAYS} days`,
    );
  const capturedAt = new Date(input.capturedAt);
  if (Number.isNaN(capturedAt.valueOf())) validation("Capture time is invalid");
  const latestSourceDate = subtractDays(
    calendarDateInTimezone(capturedAt.toISOString(), SOURCE_TIMEZONE),
    3,
  );
  if (input.endDate > latestSourceDate)
    validation(
      "Collection end must be at least three Pacific calendar days before capture",
    );
  const maxCalls =
    input.maxPageRequests ?? GROWTH_SEARCH_PERFORMANCE_MAX_PAGE_REQUESTS;
  if (
    !Number.isSafeInteger(maxCalls) ||
    maxCalls < 1 ||
    maxCalls > GROWTH_SEARCH_PERFORMANCE_MAX_PAGE_REQUESTS
  )
    validation(
      `Page request cap must be between 1 and ${GROWTH_SEARCH_PERFORMANCE_MAX_PAGE_REQUESTS}`,
    );
  const targetUrls = new Set(input.targetUrls);
  if (targetUrls.size !== input.targetUrls.length)
    validation("Frozen measurement targets must be unique");
  let property: string | null = null;
  let retrievalStatus: "exhausted" | "capped" = "exhausted";
  let remainingRequests = maxCalls;
  let requestsUsed = 0;
  const observations: FrozenGrowthSearchPerformanceSnapshot["observations"] =
    [];
  const requestWindows = growthSearchPerformanceRequestWindows(
    input.startDate,
    input.endDate,
  );
  for (const [index, window] of requestWindows.entries()) {
    const collected = await collectPageRows(
      { ...input, ...window, maxPageRequests: remainingRequests },
      (rawUrl) => targetUrls.has(rawUrl),
    );
    remainingRequests -= collected.requestsUsed;
    requestsUsed += collected.requestsUsed;
    if (property !== null && collected.property !== property)
      validation("Search Console property changed during collection");
    property = collected.property;
    observations.push(...collected.observations);
    if (
      collected.retrievalStatus === "capped" ||
      (remainingRequests === 0 && index < requestWindows.length - 1)
    ) {
      retrievalStatus = "capped";
      break;
    }
  }
  if (!property) validation("Search Console did not return a property");
  return {
    projectId: input.projectId,
    property,
    capturedAt: capturedAt.toISOString(),
    sourceWindow: { startDate: input.startDate, endDate: input.endDate },
    retrievalStatus,
    requestsUsed,
    observations,
  };
}
