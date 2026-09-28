import {
  LinkedInPageContentRepository,
  type LinkedInImportRecord,
  type LinkedInPageContentRepositoryContract,
  type LinkedInPostMetricRecord,
  type StoredLinkedInPost,
} from "@/server/features/linkedin/repositories/LinkedInPageContentRepository";
import { sha256Hex } from "@/server/lib/audit/ids";
import {
  LINKEDIN_COUNT_METRIC_NAMES,
  type LinkedInImportResult,
  type LinkedInMetricChanges,
  type LinkedInPageMetricTotals,
  type LinkedInPageOverview,
  type LinkedInPageOverviewResult,
  type LinkedInPostPerformanceItem,
  type LinkedInPostPerformanceResult,
  type LinkedInReportError,
  type LinkedInReportWarning,
} from "@/shared/linkedin";
import {
  linkedinImportSchema,
  type LinkedInImportCommand,
  type LinkedInPostImport,
} from "@/types/schemas/linkedin";

const TOP_POST_LIMIT = 10;

function aggregate(rows: LinkedInPostMetricRecord[]): LinkedInPageMetricTotals {
  const total = (metric: (typeof LINKEDIN_COUNT_METRIC_NAMES)[number]) => {
    const values = rows
      .map((row) => row[metric])
      .filter((value): value is number => value !== null);
    return values.length === 0
      ? null
      : values.reduce((sum, value) => sum + value, 0);
  };
  return {
    impressions: total("impressions"),
    membersReached: total("membersReached"),
    videoViews: total("videoViews"),
    clicks: total("clicks"),
    reactions: total("reactions"),
    comments: total("comments"),
    reposts: total("reposts"),
    follows: total("follows"),
    // Page Content exports contain post metrics only; do not invent page views.
    pageViews: null,
  };
}

function compare(
  current: LinkedInPageMetricTotals,
  previous: LinkedInPageMetricTotals,
): LinkedInMetricChanges & { pageViews: number | null } {
  const difference = (metric: keyof LinkedInPageMetricTotals) =>
    current[metric] === null || previous[metric] === null
      ? null
      : current[metric] - previous[metric];
  return {
    impressions: difference("impressions"),
    membersReached: difference("membersReached"),
    videoViews: difference("videoViews"),
    clicks: difference("clicks"),
    reactions: difference("reactions"),
    comments: difference("comments"),
    reposts: difference("reposts"),
    follows: difference("follows"),
    pageViews: difference("pageViews"),
  };
}

function containsMissingMetrics(rows: LinkedInPostMetricRecord[]): boolean {
  return rows.some((row) =>
    [
      ...LINKEDIN_COUNT_METRIC_NAMES.map((metric) => row[metric]),
      row.providerClickThroughRate,
      row.providerEngagementRate,
    ].some((value) => value === null),
  );
}

function previousPeriod(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  const lengthInDays =
    Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const previousEnd = new Date(start.getTime() - 86_400_000);
  const previousStart = new Date(
    previousEnd.getTime() - (lengthInDays - 1) * 86_400_000,
  );
  return {
    startDate: previousStart.toISOString().slice(0, 10),
    endDate: previousEnd.toISOString().slice(0, 10),
  };
}

function noImport(projectId: string): LinkedInReportError {
  return {
    status: "error",
    projectId,
    error: {
      code: "linkedin_no_import",
      message:
        "No LinkedIn Page Content import exists for this project. Upload a Page Content export first.",
      actionUrl: `/p/${projectId}/dashboard#linkedin-page-content`,
    },
  };
}

function source(importRecord: LinkedInImportRecord) {
  return {
    provider: "linkedin_page_content_manual" as const,
    pageName: importRecord.pageName,
    startDate: importRecord.startDate,
    endDate: importRecord.endDate,
    importedAt: importRecord.importedAt,
    rowCount: importRecord.rowCount,
  };
}

function postIdentity(post: LinkedInPostImport): string {
  return post.postUrl ?? `${post.postText}\u0000${post.publishedAt ?? ""}`;
}

async function storedPosts(
  posts: LinkedInPostImport[],
): Promise<StoredLinkedInPost[]> {
  return Promise.all(
    posts.map(async (post) => ({
      ...post,
      postKey: await sha256Hex(postIdentity(post)),
    })),
  );
}

function mapPost(row: LinkedInPostMetricRecord): LinkedInPostPerformanceItem {
  return {
    postUrl: row.postUrl,
    postText: row.postText,
    publishedAt: row.publishedAt,
    impressions: row.impressions,
    membersReached: row.membersReached,
    videoViews: row.videoViews,
    clicks: row.clicks,
    reactions: row.reactions,
    comments: row.comments,
    reposts: row.reposts,
    follows: row.follows,
    providerClickThroughRate:
      row.providerClickThroughRate === null
        ? null
        : row.providerClickThroughRate / 100,
    providerEngagementRate:
      row.providerEngagementRate === null
        ? null
        : row.providerEngagementRate / 100,
  };
}

export function createLinkedInPageContentService(
  repository: LinkedInPageContentRepositoryContract = LinkedInPageContentRepository,
) {
  async function importPageContent(
    command: LinkedInImportCommand,
  ): Promise<LinkedInImportResult> {
    const value = linkedinImportSchema.parse(command);
    const previous = await repository.findImportByPeriod(
      value.projectId,
      value.startDate,
      value.endDate,
    );
    const importId = crypto.randomUUID();

    try {
      await repository.replaceImport({
        id: importId,
        projectId: value.projectId,
        pageName: value.pageName,
        startDate: value.startDate,
        endDate: value.endDate,
        importedAt: new Date().toISOString(),
        posts: await storedPosts(value.posts),
      });
    } catch {
      return {
        status: "error",
        error: {
          code: "linkedin_import_failed",
          message:
            "The LinkedIn Page Content import could not be saved. Try again.",
        },
      };
    }

    return {
      status: "ok",
      importId,
      rowCount: value.posts.length,
      replaced: previous !== null,
    };
  }

  async function loadOverview(projectId: string): Promise<{
    overview: LinkedInPageOverview;
    latest: LinkedInImportRecord;
  } | null> {
    const latest = await repository.findLatestImport(projectId);
    if (!latest) return null;

    const currentRows = await repository.listPosts(latest.id);
    const priorRange = previousPeriod(latest.startDate, latest.endDate);
    const priorImport = await repository.findImportByPeriod(
      projectId,
      priorRange.startDate,
      priorRange.endDate,
    );
    const comparablePrior =
      priorImport?.pageName === latest.pageName ? priorImport : null;
    const previousRows = comparablePrior
      ? await repository.listPosts(comparablePrior.id)
      : null;

    const current = aggregate(currentRows);
    const previous = previousRows ? aggregate(previousRows) : null;
    const currentPartial = containsMissingMetrics(currentRows);
    const previousPartial = previousRows
      ? containsMissingMetrics(previousRows)
      : false;
    const warnings: LinkedInReportWarning[] = [];
    if (currentPartial) warnings.push("partial_current_metric_values");
    if (previousPartial) warnings.push("partial_previous_metric_values");
    if (!comparablePrior) warnings.push("no_exact_adjacent_prior_import");

    return {
      latest,
      overview: {
        status: "ok",
        projectId,
        source: source(latest),
        current,
        previous,
        comparison: previous ? compare(current, previous) : null,
        completeness:
          currentPartial || previousPartial ? "partial" : "complete",
        warnings,
      },
    };
  }

  async function overview(input: {
    projectId: string;
  }): Promise<LinkedInPageOverviewResult> {
    const loaded = await loadOverview(input.projectId);
    return loaded?.overview ?? noImport(input.projectId);
  }

  async function topPosts(input: {
    projectId: string;
  }): Promise<LinkedInPostPerformanceResult> {
    const loaded = await loadOverview(input.projectId);
    if (!loaded) return noImport(input.projectId);
    const posts = await repository.listTopPosts(
      loaded.latest.id,
      TOP_POST_LIMIT,
    );
    return { ...loaded.overview, posts: posts.map(mapPost) };
  }

  return {
    import: importPageContent,
    overview,
    topPosts,
  } as const;
}

export const LinkedInPageContentService = createLinkedInPageContentService();
