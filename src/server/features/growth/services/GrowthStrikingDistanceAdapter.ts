import { GscService } from "@/server/features/gsc/services/GscService";
import { normalizeKeyPageUrl } from "@/server/features/project-context/services/contextUpdateOps";
import { calendarDateInTimezone } from "./GrowthMeasurementFacts";
import { AppError } from "@/server/lib/errors";
import {
  growthStrikingDistanceInventorySchema,
  growthStrikingDistanceRowSchema,
  growthStrikingDistanceWindowSchema,
  type GrowthStrikingDistanceInventory,
} from "@/types/schemas/growth-striking-distance";
import { z } from "zod";

const ROW_LIMIT = 1000;
const GROWTH_STRIKING_DISTANCE_MAX_PAGE_REQUESTS = 10;
const SOURCE_TIMEZONE = "America/Los_Angeles";

const inputSchema = z
  .strictObject({
    projectId: z.string().trim().min(1).max(100),
    capturedAt: z.string().datetime({ offset: true }),
    baselineWindow: growthStrikingDistanceWindowSchema,
    currentWindow: growthStrikingDistanceWindowSchema,
  })
  .superRefine((value, context) => {
    const baselineDays = daysInclusive(value.baselineWindow);
    const currentDays = daysInclusive(value.currentWindow);
    if (baselineDays !== 28 || currentDays !== 28)
      context.addIssue({
        code: "custom",
        message: "Striking-distance windows must each be 28 days",
      });
    if (
      nextDate(value.baselineWindow.endDate) !== value.currentWindow.startDate
    )
      context.addIssue({ code: "custom", message: "Windows must be adjacent" });
  });

const providerRowSchema = z.strictObject({
  keys: z.array(z.string().min(1)).length(2),
  clicks: z.number().finite().int().nonnegative().safe(),
  impressions: z.number().finite().int().nonnegative().safe(),
  ctr: z.number().finite().min(0).max(1),
  position: z.number().finite().positive(),
});

function validation(message: string): never {
  throw new AppError("VALIDATION_ERROR", message);
}

function normalizeQuery(query: string) {
  const normalized = query
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en-US");
  if (!normalized) validation("Search Console returned an invalid query");
  return normalized;
}

function compareCodeUnits(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function daysInclusive(window: { startDate: string; endDate: string }) {
  return (
    (Date.parse(`${window.endDate}T00:00:00.000Z`) -
      Date.parse(`${window.startDate}T00:00:00.000Z`)) /
      86_400_000 +
    1
  );
}

function nextDate(date: string) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10);
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
  expected: { startDate: string; endDate: string; startRow: number },
) {
  if (
    request.startDate !== expected.startDate ||
    request.endDate !== expected.endDate ||
    request.dimensions?.join("\u0000") !== "query\u0000page" ||
    request.rowLimit !== ROW_LIMIT ||
    request.startRow !== (expected.startRow || undefined) ||
    request.type !== "web" ||
    request.dataState !== "final" ||
    request.aggregationType !== undefined ||
    request.dimensionFilterGroups !== undefined
  )
    validation(
      "Search Console returned a request that differs from collection",
    );
}

async function collectWindow(input: {
  projectId: string;
  window: { startDate: string; endDate: string };
}) {
  let property: string | null = null;
  let startRow = 0;
  const contributions: Array<{
    rawCoordinate: string;
    coordinate: string;
    row: GrowthStrikingDistanceInventory["current"]["rows"][number];
  }> = [];
  const rawCoordinates = new Set<string>();
  const collectedRows = () => {
    const rowsByCoordinate = new Map<
      string,
      GrowthStrikingDistanceInventory["current"]["rows"][number]
    >();
    for (const contribution of contributions.toSorted((left, right) =>
      compareCodeUnits(left.rawCoordinate, right.rawCoordinate),
    )) {
      const existing = rowsByCoordinate.get(contribution.coordinate);
      if (!existing) {
        rowsByCoordinate.set(contribution.coordinate, contribution.row);
        continue;
      }
      const impressions = existing.impressions + contribution.row.impressions;
      const clicks = existing.clicks + contribution.row.clicks;
      if (!Number.isSafeInteger(impressions) || !Number.isSafeInteger(clicks))
        validation("Search Console row aggregate exceeds safe integer range");
      rowsByCoordinate.set(
        contribution.coordinate,
        growthStrikingDistanceRowSchema.parse({
          query: existing.query,
          page: existing.page,
          clicks,
          impressions,
          position:
            impressions === 0
              ? Math.min(existing.position, contribution.row.position)
              : (existing.position * existing.impressions +
                  contribution.row.position * contribution.row.impressions) /
                impressions,
        }),
      );
    }
    return Array.from(rowsByCoordinate.values()).toSorted((left, right) =>
      compareCodeUnits(
        `${left.query}\u0000${left.page}`,
        `${right.query}\u0000${right.page}`,
      ),
    );
  };

  for (
    let requestNumber = 0;
    requestNumber < GROWTH_STRIKING_DISTANCE_MAX_PAGE_REQUESTS;
    requestNumber += 1
  ) {
    const result = await GscService.getPerformance({
      projectId: input.projectId,
      startDate: input.window.startDate,
      endDate: input.window.endDate,
      dimensions: ["query", "page"],
      rowLimit: ROW_LIMIT,
      startRow,
      type: "web",
      dataState: "final",
    });
    assertRequest(result.request, { ...input.window, startRow });
    if (property !== null && property !== result.siteUrl)
      validation("Search Console property changed during collection");
    property = result.siteUrl;
    if (result.rows.length > ROW_LIMIT)
      validation("Search Console returned more rows than requested");
    if (result.rows.length === 0)
      return {
        property:
          property ?? validation("Search Console did not return a property"),
        retrievalStatus: "exhausted" as const,
        requestsUsed: requestNumber + 1,
        rows: collectedRows(),
      };

    for (const raw of result.rows) {
      const parsed = providerRowSchema.safeParse(raw);
      if (!parsed.success)
        validation("Search Console returned a malformed query/page row");
      const [rawQuery, rawPage] = parsed.data.keys;
      const rawCoordinate = `${rawQuery}\u0000${rawPage}`;
      if (rawCoordinates.has(rawCoordinate))
        validation("Search Console returned duplicate query/page rows");
      rawCoordinates.add(rawCoordinate);
      const query = normalizeQuery(rawQuery);
      let page: string;
      try {
        page = normalizeKeyPageUrl(rawPage);
      } catch {
        validation("Search Console returned an invalid page URL");
      }
      const coordinate = `${query}\u0000${page}`;
      const next = growthStrikingDistanceRowSchema.parse({
        query,
        page,
        clicks: parsed.data.clicks,
        impressions: parsed.data.impressions,
        position: parsed.data.position,
      });
      contributions.push({ rawCoordinate, coordinate, row: next });
    }
    startRow += result.rows.length;
  }
  return {
    property:
      property ?? validation("Search Console did not return a property"),
    retrievalStatus: "capped" as const,
    requestsUsed: GROWTH_STRIKING_DISTANCE_MAX_PAGE_REQUESTS,
    rows: collectedRows(),
  };
}

/** Collects two adjacent bounded inventories. A cap is deliberately not usable evidence. */
export async function collectGrowthStrikingDistanceInventory(
  rawInput: z.input<typeof inputSchema>,
): Promise<GrowthStrikingDistanceInventory> {
  const input = inputSchema.parse(rawInput);
  const latestFinalDate = calendarDateInTimezone(
    input.capturedAt,
    SOURCE_TIMEZONE,
  );
  const cutoff = new Date(`${latestFinalDate}T00:00:00.000Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - 3);
  if (input.currentWindow.endDate > cutoff.toISOString().slice(0, 10))
    validation("Current window does not satisfy the final-data lag");
  // Collect sequentially: this keeps the provider call budget legible and
  // prevents a connection/property change from racing between windows.
  const baseline = await collectWindow({
    projectId: input.projectId,
    window: input.baselineWindow,
  });
  const current = await collectWindow({
    projectId: input.projectId,
    window: input.currentWindow,
  });
  if (baseline.property !== current.property)
    validation("Search Console property changed between collection windows");
  return growthStrikingDistanceInventorySchema.parse({
    projectId: input.projectId,
    property: baseline.property,
    capturedAt: input.capturedAt,
    baselineWindow: input.baselineWindow,
    currentWindow: input.currentWindow,
    baseline: {
      retrievalStatus: baseline.retrievalStatus,
      requestsUsed: baseline.requestsUsed,
      rows: baseline.rows,
    },
    current: {
      retrievalStatus: current.retrievalStatus,
      requestsUsed: current.requestsUsed,
      rows: current.rows,
    },
  });
}
