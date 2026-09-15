import { normalizeKeyPageUrl } from "@/server/features/project-context/services/contextUpdateOps";
import { sha256Hex } from "@/server/lib/audit/ids";
import { AppError } from "@/server/lib/errors";
import type { RecordGrowthSignalInput } from "@/types/schemas/growth";
import {
  growthStrikingDistanceInventorySchema,
  type GrowthStrikingDistanceInventory,
} from "@/types/schemas/growth-striking-distance";
import { z } from "zod";

export const HIGH_IMPRESSION_LOW_CTR_DETECTOR_VERSION =
  "high-impression-low-ctr-v1";
const LOW_CTR_POLICY = {
  minimumImpressions: 100,
  minPosition: 1,
  maxPosition: 4,
  absoluteLoss: 0.01,
  relativeLoss: 0.25,
  maxCandidates: 3,
} as const;

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
type Facts = {
  position: number;
  impressions: number;
  clicks: number;
  ctr: number;
};
type EvidenceInput = {
  projectId: string;
  site: string;
  query: string;
  page: string;
  capturedAt: string;
  baselineWindow: { startDate: string; endDate: string };
  currentWindow: { startDate: string; endDate: string };
  baseline: Facts;
  current: Facts;
};

function ctr(clicks: number, impressions: number) {
  return impressions === 0 ? 0 : clicks / impressions;
}
function deltaPercent(baseline: number, current: number) {
  return baseline === 0 ? null : ((current - baseline) / baseline) * 100;
}
function compare(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}
export async function lowCtrEvidenceRef(input: EvidenceInput) {
  return `gsc_low_ctr_v1:${await sha256Hex(JSON.stringify({ detectorVersion: HIGH_IMPRESSION_LOW_CTR_DETECTOR_VERSION, thresholds: LOW_CTR_POLICY, ...input }))}`;
}
export async function matchesLowCtrEvidenceRef(
  input: EvidenceInput,
  evidenceRef: string,
) {
  return evidenceRef === (await lowCtrEvidenceRef(input));
}
function drafts(input: {
  projectId: string;
  runId: string;
  query: string;
  capturedAt: string;
  currentWindow: { startDate: string; endDate: string };
  evidenceRef: string;
  baseline: Facts;
  current: Facts;
}): RecordGrowthSignalInput[] {
  return (
    [
      ["gsc_ctr", "ctr"],
      ["gsc_clicks", "clicks"],
      ["gsc_impressions", "impressions"],
      ["gsc_average_position", "position"],
    ] as const
  ).map(([metric, key]) => ({
    projectId: input.projectId,
    runId: input.runId,
    signalType: "ctr_below_expected",
    entityType: "search_query",
    entityRef: input.query,
    metric,
    severity: "info",
    confidence: 0.8,
    periodStart: input.currentWindow.startDate,
    periodEnd: input.currentWindow.endDate,
    baselineValue: input.baseline[key],
    currentValue: input.current[key],
    deltaValue: input.current[key] - input.baseline[key],
    deltaPercent: deltaPercent(input.baseline[key], input.current[key]),
    evidenceKind: "gsc_period",
    evidenceRef: input.evidenceRef,
    capturedAt: input.capturedAt,
  }));
}
export async function detectHighImpressionLowCtrQueries(
  raw: z.input<typeof inputSchema>,
) {
  const input = inputSchema.parse(raw);
  const inventory: GrowthStrikingDistanceInventory = input.inventory;
  if (inventory.projectId !== input.projectId)
    throw new AppError(
      "VALIDATION_ERROR",
      "Inventory belongs to another project",
    );
  if (
    inventory.baseline.retrievalStatus !== "exhausted" ||
    inventory.current.retrievalStatus !== "exhausted"
  )
    return [
      {
        status: "suppressed" as const,
        suppressionReason: "retrieval_capped" as const,
      },
    ];
  const pages = new Map<string, (typeof input.keyPages)[number]>();
  for (const page of input.keyPages) {
    if (page.projectId !== input.projectId)
      throw new AppError(
        "VALIDATION_ERROR",
        "Key page belongs to another project",
      );
    const url = normalizeKeyPageUrl(page.url);
    if (pages.has(url))
      throw new AppError("VALIDATION_ERROR", "Duplicate key page URL");
    pages.set(url, page);
  }
  const baseline = new Map(
    inventory.baseline.rows.map((row) => [
      `${row.query}\u0000${row.page}`,
      row,
    ]),
  );
  const candidates = inventory.current.rows
    .flatMap((row) => {
      const prior = baseline.get(`${row.query}\u0000${row.page}`);
      const keyPage = pages.get(row.page);
      // Keep full provider queries in the inventory, but respect saved-signal limits.
      if (
        !prior ||
        !keyPage ||
        row.page.length > 2000 ||
        row.query.length > 500
      )
        return [];
      const before = ctr(prior.clicks, prior.impressions);
      const now = ctr(row.clicks, row.impressions);
      if (
        prior.impressions < LOW_CTR_POLICY.minimumImpressions ||
        row.impressions < LOW_CTR_POLICY.minimumImpressions ||
        before === 0 ||
        row.position < LOW_CTR_POLICY.minPosition ||
        row.position > LOW_CTR_POLICY.maxPosition ||
        row.position > prior.position ||
        before - now < LOW_CTR_POLICY.absoluteLoss ||
        (before - now) / before < LOW_CTR_POLICY.relativeLoss
      )
        return [];
      return [
        {
          row,
          prior,
          keyPage,
          baseline: {
            position: prior.position,
            impressions: prior.impressions,
            clicks: prior.clicks,
            ctr: before,
          },
          current: {
            position: row.position,
            impressions: row.impressions,
            clicks: row.clicks,
            ctr: now,
          },
          missedClicks: (before - now) * row.impressions,
        },
      ];
    })
    .toSorted(
      (a, b) =>
        b.missedClicks - a.missedClicks ||
        b.current.impressions - a.current.impressions ||
        compare(a.row.query, b.row.query) ||
        compare(a.row.page, b.row.page),
    )
    .slice(0, LOW_CTR_POLICY.maxCandidates);
  if (!candidates.length)
    return [
      {
        status: "suppressed" as const,
        suppressionReason: "no_eligible_query" as const,
      },
    ];
  return Promise.all(
    candidates.map(async (candidate) => {
      const evidenceRef = await lowCtrEvidenceRef({
        projectId: input.projectId,
        site: input.site,
        query: candidate.row.query,
        page: candidate.row.page,
        capturedAt: inventory.capturedAt,
        baselineWindow: inventory.baselineWindow,
        currentWindow: inventory.currentWindow,
        baseline: candidate.baseline,
        current: candidate.current,
      });
      return {
        status: "candidate" as const,
        query: candidate.row.query,
        canonicalPageUrl: candidate.row.page,
        site: input.site,
        property: inventory.property,
        keyPageId: candidate.keyPage.id,
        commercialWeight: candidate.keyPage.commercialWeight,
        evidenceRef,
        baseline: candidate.baseline,
        current: candidate.current,
        signalDrafts: drafts({
          projectId: input.projectId,
          runId: input.runId,
          query: candidate.row.query,
          capturedAt: inventory.capturedAt,
          currentWindow: inventory.currentWindow,
          evidenceRef,
          baseline: candidate.baseline,
          current: candidate.current,
        }),
      };
    }),
  );
}
