import { GscService } from "@/server/features/gsc/services/GscService";
import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import { getLatestResults } from "@/server/features/rank-tracking/services/rankTrackingResults";
import { normalizeBacklinksTarget } from "@/server/lib/dataforseoBacklinksTarget";
import { GscNotConnectedError } from "@/server/lib/gscErrors";
import { captureServerError } from "@/server/lib/posthog";
import type {
  GrowthEvidenceMonth,
  GrowthEvidencePosition,
  GrowthPlanEvidenceDto,
  GrowthPlanEvidenceSeriesDto,
} from "@/types/schemas/growth-plan";
import { GrowthPlanRepository as repo } from "../repositories/GrowthPlanRepository";
import { resolvePageContextGscWindow } from "./GrowthPageContextService";

// Search Console is a live read with no OR filter (a dimension filter group is
// always ANDed), so every distinct URL costs one call. Ten keeps one plan page
// load bounded; every workstream slices from those same ten reads.
const MAX_PAGE_URLS = 10;
const MAX_KEYWORDS = 25;
const MONTHS = 16;
const GSC_ROW_LIMIT = 1000;

type DailyRow = { date: string; clicks: number; impressions: number };
type Window = { start: string; end: string };

const lower = (value: string) => value.trim().toLowerCase();

/** Host comparison for `isProject`; stored junk yields null rather than throwing. */
function domainHost(value: string | null) {
  if (!value) return null;
  try {
    return normalizeBacklinksTarget(value, { scope: "domain" }).apiTarget;
  } catch {
    return null;
  }
}

const monthOf = (date: string) => date.slice(0, 7);
const firstDayOf = (month: string) => `${month}-01`;
function lastDayOf(month: string) {
  const [year, index] = month.split("-").map(Number);
  return new Date(Date.UTC(year ?? 0, index ?? 1, 0))
    .toISOString()
    .slice(0, 10);
}

/**
 * The request window starts MONTHS whole months before the final-data month, so
 * aggregation always yields MONTHS complete months once the trailing partial
 * month is dropped.
 */
function requestWindow(finalDataDate: string): Window {
  const [year, month] = finalDataDate.split("-").map(Number);
  const start = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1 - MONTHS, 1));
  return { start: start.toISOString().slice(0, 10), end: finalDataDate };
}

/** Daily rows folded into whole calendar months, oldest first, zeros included. */
function completeMonths(
  rows: DailyRow[],
  window: Window,
): GrowthEvidenceMonth[] {
  const totals = new Map<string, GrowthEvidenceMonth>();
  let cursor = monthOf(window.start);
  while (firstDayOf(cursor) <= window.end) {
    if (lastDayOf(cursor) <= window.end)
      totals.set(cursor, { month: cursor, clicks: 0, impressions: 0 });
    const [year, index] = cursor.split("-").map(Number);
    cursor = new Date(Date.UTC(year ?? 0, index ?? 1, 1))
      .toISOString()
      .slice(0, 7);
  }
  for (const row of rows) {
    const total = totals.get(monthOf(row.date));
    if (!total) continue;
    total.clicks += row.clicks;
    total.impressions += row.impressions;
  }
  return [...totals.values()].slice(-MONTHS);
}

function dailyRows(rows: unknown[]): DailyRow[] {
  const out: DailyRow[] = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const { keys, clicks, impressions } = row as {
      keys?: unknown;
      clicks?: unknown;
      impressions?: unknown;
    };
    const date: unknown = Array.isArray(keys) ? keys[0] : undefined;
    if (
      typeof date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      typeof clicks !== "number" ||
      typeof impressions !== "number"
    )
      continue;
    out.push({
      date,
      clicks: Math.max(0, Math.round(clicks)),
      impressions: Math.max(0, Math.round(impressions)),
    });
  }
  return out;
}

/**
 * One Search Console call per distinct URL, shared by the plan series and every
 * workstream slice. A URL that fails is dropped and counted; a missing
 * connection stops the loop because no later URL could succeed either.
 */
async function readPages(projectId: string, urls: string[], window: Window) {
  const rowsByUrl = new Map<string, DailyRow[]>();
  const failed = new Set<string>();
  for (const url of urls) {
    try {
      const result = await GscService.getPerformance({
        projectId,
        startDate: window.start,
        endDate: window.end,
        dimensions: ["date"],
        filters: [{ dimension: "page", operator: "equals", expression: url }],
        rowLimit: GSC_ROW_LIMIT,
        type: "web",
        dataState: "final",
      });
      rowsByUrl.set(url, dailyRows(result.rows));
    } catch (error) {
      if (error instanceof GscNotConnectedError)
        return { rowsByUrl, failed, notConnected: true };
      failed.add(url);
      await captureServerError(error, {
        area: "growth_plan_evidence",
        projectId,
      });
    }
  }
  return { rowsByUrl, failed, notConnected: false };
}

type KeywordFacts = {
  volumes: Map<string, number | null>;
  positions: Map<string, GrowthEvidencePosition[]>;
  rankTracked: boolean;
};

/** Saved volume plus the latest position per rank-tracking config, read once. */
async function readKeywords(
  projectId: string,
  projectDomain: string | null,
  keywords: string[],
): Promise<KeywordFacts> {
  const [volumeRows, configs] = await Promise.all([
    repo.listSavedKeywordVolumes(projectId, keywords),
    RankTrackingRepository.getConfigsForProject(projectId),
  ]);

  // Ordered newest fetch first, so the first row per keyword wins.
  const volumes = new Map<string, number | null>();
  for (const row of volumeRows)
    if (!volumes.has(row.keyword)) volumes.set(row.keyword, row.searchVolume);

  const projectHost = domainHost(projectDomain);
  const positions = new Map<string, GrowthEvidencePosition[]>();
  // One latest-results read per config, not per keyword.
  await Promise.all(
    configs.map(async (config) => {
      const results = await getLatestResults(config.id, projectId);
      const device = config.devices === "mobile" ? "mobile" : "desktop";
      const checkedAt = results.run?.lastCheckedAt ?? null;
      for (const row of results.rows) {
        const keyword = lower(row.keyword);
        if (!keywords.includes(keyword)) continue;
        positions.set(keyword, [
          ...(positions.get(keyword) ?? []),
          {
            configId: config.id,
            domain: config.domain,
            locationCode: config.locationCode ?? null,
            locationName: config.locationName ?? null,
            device,
            isProject:
              projectHost !== null && domainHost(config.domain) === projectHost,
            position: row[device].position,
            checkedAt,
          },
        ]);
      }
    }),
  );

  return { volumes, positions, rankTracked: configs.length > 0 };
}

type Slice = { urls: string[]; keywords: string[] };

const pushDistinct = (
  slice: Slice,
  key: "urls" | "keywords",
  value: string,
) => {
  if (!slice[key].includes(value)) slice[key].push(value);
};
type PlanReads = {
  window: Window;
  queriedUrls: Set<string>;
  rowsByUrl: Map<string, DailyRow[]>;
  failed: Set<string>;
  notConnected: boolean;
  queriedKeywords: Set<string>;
  keywords: KeywordFacts;
};

function seriesFor(
  scope: "plan" | "workstream",
  workstreamId: string | null,
  slice: Slice,
  reads: PlanReads,
): GrowthPlanEvidenceSeriesDto {
  const queried = slice.urls.filter((url) => reads.queriedUrls.has(url));
  const succeeded = queried.filter((url) => !reads.failed.has(url));
  const months = completeMonths(
    succeeded.flatMap((url) => reads.rowsByUrl.get(url) ?? []),
    reads.window,
  );
  const failedUrls = queried.length - succeeded.length;
  const pagesState = ((): GrowthPlanEvidenceSeriesDto["pages"]["state"] => {
    if (slice.urls.length === 0) return "no_targets";
    if (reads.notConnected) return "not_connected";
    // Targets exist but the plan-wide cap left every one of them unread.
    if (queried.length === 0) return "capped";
    if (succeeded.length === 0) return "unavailable";
    // Zero everywhere means Search Console does not report these URLs in this
    // form, whether or not some other URL in the slice also failed.
    return months.every(
      (month) => month.clicks === 0 && month.impressions === 0,
    )
      ? "no_data"
      : "available";
  })();
  const charted = pagesState === "available" || pagesState === "no_data";

  const sliceKeywords = slice.keywords.filter((keyword) =>
    reads.queriedKeywords.has(keyword),
  );
  const keywordsState =
    ((): GrowthPlanEvidenceSeriesDto["keywords"]["state"] =>
      slice.keywords.length === 0
        ? "no_targets"
        : sliceKeywords.length === 0
          ? "capped"
          : "available")();

  return {
    scope,
    workstreamId,
    pages: {
      state: pagesState,
      // A capped slice describes the targets it has; every other state
      // describes what was attempted.
      urls: pagesState === "capped" ? slice.urls : queried,
      totalUrls: slice.urls.length,
      failedUrls,
      months: charted ? months : [],
      window: charted ? reads.window : null,
    },
    keywords: {
      state: keywordsState,
      items: sliceKeywords.map((keyword) => ({
        keyword,
        searchVolume: reads.keywords.volumes.get(keyword) ?? null,
        positions: reads.keywords.positions.get(keyword) ?? [],
      })),
      totalKeywords: slice.keywords.length,
      rankTracked: reads.keywords.rankTracked,
    },
  };
}

/** Distinct url/keyword targets per workstream and plan-wide, in action order. */
async function collectTargets(projectId: string) {
  const [workstreams, actions, targets] = await Promise.all([
    repo.listWorkstreams(projectId),
    repo.listPlanActions(projectId),
    repo.listActionTargets(projectId),
  ]);
  const byAction = new Map<string, typeof targets>();
  for (const target of targets)
    byAction.set(target.actionId, [
      ...(byAction.get(target.actionId) ?? []),
      target,
    ]);

  const plan: Slice = { urls: [], keywords: [] };
  const slices = new Map<string, Slice>(
    workstreams.map((workstream) => [
      workstream.id,
      { urls: [], keywords: [] },
    ]),
  );
  for (const action of actions) {
    const slice = action.workstreamId
      ? slices.get(action.workstreamId)
      : undefined;
    for (const target of byAction.get(action.id) ?? []) {
      if (target.targetType !== "url" && target.targetType !== "keyword")
        continue;
      const key = target.targetType === "url" ? "urls" : "keywords";
      const value =
        target.targetType === "url"
          ? target.targetValue
          : lower(target.targetValue);
      pushDistinct(plan, key, value);
      if (slice) pushDistinct(slice, key, value);
    }
  }
  return { workstreams, plan, slices };
}

/**
 * Every chart on the Plan page in one request: the plan-wide series plus each
 * workstream's slice, derived only from what the plan's actions already target.
 * Live Search Console for pages, saved keyword metrics and rank tracking for
 * keywords. Nothing here spends credits.
 */
async function getPlanEvidence(
  input: { projectId: string },
  options: { now?: Date } = {},
): Promise<GrowthPlanEvidenceDto> {
  const { projectId } = input;
  const [{ workstreams, plan, slices }, projectDomain] = await Promise.all([
    collectTargets(projectId),
    repo.projectDomain(projectId),
  ]);

  const queriedUrls = plan.urls.slice(0, MAX_PAGE_URLS);
  const queriedKeywords = plan.keywords.slice(0, MAX_KEYWORDS);
  const window = requestWindow(
    resolvePageContextGscWindow(options.now ?? new Date()).endDate,
  );
  const [pages, keywords] = await Promise.all([
    queriedUrls.length > 0
      ? readPages(projectId, queriedUrls, window)
      : Promise.resolve({
          rowsByUrl: new Map<string, DailyRow[]>(),
          failed: new Set<string>(),
          notConnected: false,
        }),
    queriedKeywords.length > 0
      ? readKeywords(projectId, projectDomain, queriedKeywords)
      : Promise.resolve({
          volumes: new Map<string, number | null>(),
          positions: new Map<string, GrowthEvidencePosition[]>(),
          rankTracked: false,
        }),
  ]);

  const reads: PlanReads = {
    window,
    queriedUrls: new Set(queriedUrls),
    queriedKeywords: new Set(queriedKeywords),
    keywords,
    ...pages,
  };
  return {
    plan: seriesFor("plan", null, plan, reads),
    workstreams: workstreams.map((workstream) =>
      seriesFor(
        "workstream",
        workstream.id,
        slices.get(workstream.id) ?? { urls: [], keywords: [] },
        reads,
      ),
    ),
  };
}

export const GrowthPlanEvidenceService = { getPlanEvidence } as const;
