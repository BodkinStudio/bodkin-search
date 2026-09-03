import { buildStrikingDistanceRows } from "@/server/features/gsc/searchPerformanceReport";
import { normalizeKeyPageUrl } from "@/server/features/project-context/services/contextUpdateOps";
import { sha256Hex } from "@/server/lib/audit/ids";
import { AppError } from "@/server/lib/errors";
import type { RecordGrowthSignalInput } from "@/types/schemas/growth";
import {
  growthStrikingDistanceInventorySchema,
  type GrowthStrikingDistanceInventory,
} from "@/types/schemas/growth-striking-distance";
import { z } from "zod";

export const STRIKING_DISTANCE_QUERY_DETECTOR_VERSION =
  "striking-distance-query-v1";
const STRIKING_DISTANCE_QUERY_MIN_POSITION = 5;
const STRIKING_DISTANCE_QUERY_MAX_POSITION = 20;
const STRIKING_DISTANCE_QUERY_MIN_IMPRESSIONS = 50;
const STRIKING_DISTANCE_QUERY_MAX_CANDIDATES = 3;
const GROWTH_TARGET_URL_MAX_LENGTH = 2000;

const keyPageSchema = z.strictObject({
  id: z.string().trim().min(1).max(100),
  projectId: z.string().trim().min(1).max(100),
  url: z.string().trim().min(1).max(4096),
  commercialWeight: z.number().int().min(1).max(5).nullable(),
});

const inputSchema = z.strictObject({
  projectId: z.string().trim().min(1).max(100),
  runId: z.string().trim().min(1).max(100),
  site: z.string().trim().min(1).max(2000),
  inventory: growthStrikingDistanceInventorySchema,
  keyPages: z.array(keyPageSchema).min(1).max(100),
});

type StrikingDistanceQueryOutcome =
  | {
      status: "candidate";
      query: string;
      canonicalPageUrl: string;
      site: string;
      property: string;
      keyPageId: string;
      commercialWeight: number | null;
      evidenceRef: string;
      baseline: { position: number; impressions: number; clicks: number };
      current: { position: number; impressions: number; clicks: number };
      signalDrafts: RecordGrowthSignalInput[];
    }
  | {
      status: "suppressed";
      suppressionReason: "retrieval_capped" | "no_eligible_query";
    };

function validation(message: string): never {
  throw new AppError("VALIDATION_ERROR", message);
}

function deltaPercent(baseline: number, current: number) {
  return baseline === 0 ? null : ((current - baseline) / baseline) * 100;
}

function compareCodeUnits(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

type StrikingDistanceEvidenceInput = {
  projectId: string;
  site: string;
  query: string;
  page: string;
  capturedAt: string;
  baselineWindow: { startDate: string; endDate: string };
  currentWindow: { startDate: string; endDate: string };
  baseline: { position: number; impressions: number; clicks: number };
  current: { position: number; impressions: number; clicks: number };
};

async function hashEvidence(
  prefix: "gsc_striking_distance_v1" | "gsc_striking_distance_v2",
  input: Omit<StrikingDistanceEvidenceInput, "capturedAt"> & {
    capturedAt?: string;
  },
) {
  const evidence = JSON.stringify({
    detectorVersion: STRIKING_DISTANCE_QUERY_DETECTOR_VERSION,
    positionRange: [
      STRIKING_DISTANCE_QUERY_MIN_POSITION,
      STRIKING_DISTANCE_QUERY_MAX_POSITION,
    ],
    minimumImpressions: STRIKING_DISTANCE_QUERY_MIN_IMPRESSIONS,
    maxCandidates: STRIKING_DISTANCE_QUERY_MAX_CANDIDATES,
    ...input,
  });
  return `${prefix}:${await sha256Hex(evidence)}`;
}

export function strikingDistanceEvidenceRef(
  input: StrikingDistanceEvidenceInput,
) {
  return hashEvidence("gsc_striking_distance_v2", input);
}

export async function matchesStrikingDistanceEvidenceRef(
  input: StrikingDistanceEvidenceInput,
  savedEvidenceRef: string,
) {
  if (savedEvidenceRef.startsWith("gsc_striking_distance_v2:"))
    return savedEvidenceRef === (await strikingDistanceEvidenceRef(input));
  if (!savedEvidenceRef.startsWith("gsc_striking_distance_v1:")) return false;
  // Preview-era v1 evidence predates captured-at binding. Keep those immutable
  // graphs readable while every newly generated v2 reference binds the time.
  const legacyInput = {
    projectId: input.projectId,
    site: input.site,
    query: input.query,
    page: input.page,
    baselineWindow: input.baselineWindow,
    currentWindow: input.currentWindow,
    baseline: input.baseline,
    current: input.current,
  };
  return (
    savedEvidenceRef ===
    (await hashEvidence("gsc_striking_distance_v1", legacyInput))
  );
}

function signalDrafts(input: {
  projectId: string;
  runId: string;
  query: string;
  capturedAt: string;
  currentWindow: { startDate: string; endDate: string };
  evidenceRef: string;
  baseline: { position: number; impressions: number; clicks: number };
  current: { position: number; impressions: number; clicks: number };
}): RecordGrowthSignalInput[] {
  const measured = [
    ["gsc_average_position", "position"],
    ["gsc_impressions", "impressions"],
    ["gsc_clicks", "clicks"],
  ] as const;
  return measured.map(([metric, key]) => {
    const baselineValue = input.baseline[key];
    const currentValue = input.current[key];
    return {
      projectId: input.projectId,
      runId: input.runId,
      signalType: "striking_distance_query",
      entityType: "search_query",
      entityRef: input.query,
      metric,
      severity: "info",
      confidence: 0.8,
      periodStart: input.currentWindow.startDate,
      periodEnd: input.currentWindow.endDate,
      baselineValue,
      currentValue,
      deltaValue: currentValue - baselineValue,
      deltaPercent: deltaPercent(baselineValue, currentValue),
      evidenceKind: "gsc_period",
      evidenceRef: input.evidenceRef,
      capturedAt: input.capturedAt,
    };
  });
}

/**
 * Transforms an exhaustive, validated query/page inventory into at most three
 * reviewable ranking opportunities. It deliberately never manufactures a
 * baseline for an omitted query/page coordinate.
 */
export async function detectStrikingDistanceQueries(
  rawInput: z.input<typeof inputSchema>,
): Promise<StrikingDistanceQueryOutcome[]> {
  const input = inputSchema.parse(rawInput);
  const inventory: GrowthStrikingDistanceInventory = input.inventory;
  if (inventory.projectId !== input.projectId)
    validation("Inventory belongs to another project");
  if (
    inventory.baseline.retrievalStatus !== "exhausted" ||
    inventory.current.retrievalStatus !== "exhausted"
  )
    return [{ status: "suppressed", suppressionReason: "retrieval_capped" }];

  const keyPages = new Map<string, (typeof input.keyPages)[number]>();
  for (const keyPage of input.keyPages) {
    if (keyPage.projectId !== input.projectId)
      validation("Key page belongs to another project");
    const exact = normalizeKeyPageUrl(keyPage.url);
    if (keyPages.has(exact)) validation("Duplicate key page URL");
    keyPages.set(exact, { ...keyPage, url: exact });
  }

  const baselineByCoordinate = new Map(
    inventory.baseline.rows.map((row) => [
      `${row.query}\u0000${row.page}`,
      row,
    ]),
  );
  const rawCandidates = buildStrikingDistanceRows(
    inventory.current.rows.map((row) => ({
      keys: [row.query, row.page],
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.impressions === 0 ? 0 : row.clicks / row.impressions,
      position: row.position,
    })),
    inventory.current.rows.length,
  )
    .filter(
      (row) =>
        row.position >= STRIKING_DISTANCE_QUERY_MIN_POSITION &&
        row.position <= STRIKING_DISTANCE_QUERY_MAX_POSITION &&
        row.impressions >= STRIKING_DISTANCE_QUERY_MIN_IMPRESSIONS,
    )
    .flatMap((current) => {
      const keyPage = keyPages.get(current.page);
      const baseline = baselineByCoordinate.get(
        `${current.query}\u0000${current.page}`,
      );
      if (!keyPage || !baseline) return [];
      if (current.page.length > GROWTH_TARGET_URL_MAX_LENGTH) return [];
      return [{ current, baseline, keyPage }];
    })
    .toSorted(
      (left, right) =>
        right.current.impressions - left.current.impressions ||
        left.current.position - right.current.position ||
        compareCodeUnits(left.current.query, right.current.query) ||
        compareCodeUnits(left.current.page, right.current.page),
    );
  const candidates = rawCandidates.slice(
    0,
    STRIKING_DISTANCE_QUERY_MAX_CANDIDATES,
  );

  if (candidates.length === 0)
    return [{ status: "suppressed", suppressionReason: "no_eligible_query" }];

  return Promise.all(
    candidates.map(async ({ current, baseline, keyPage }) => {
      const facts = {
        baseline: {
          position: baseline.position,
          impressions: baseline.impressions,
          clicks: baseline.clicks,
        },
        current: {
          position: current.position,
          impressions: current.impressions,
          clicks: current.clicks,
        },
      };
      const sharedEvidenceRef = await strikingDistanceEvidenceRef({
        projectId: input.projectId,
        site: input.site,
        query: current.query,
        page: current.page,
        capturedAt: inventory.capturedAt,
        baselineWindow: inventory.baselineWindow,
        currentWindow: inventory.currentWindow,
        ...facts,
      });
      return {
        status: "candidate" as const,
        query: current.query,
        canonicalPageUrl: current.page,
        site: input.site,
        property: inventory.property,
        keyPageId: keyPage.id,
        commercialWeight: keyPage.commercialWeight,
        evidenceRef: sharedEvidenceRef,
        ...facts,
        signalDrafts: signalDrafts({
          projectId: input.projectId,
          runId: input.runId,
          query: current.query,
          capturedAt: inventory.capturedAt,
          currentWindow: inventory.currentWindow,
          evidenceRef: sharedEvidenceRef,
          ...facts,
        }),
      };
    }),
  );
}
