import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { account } from "@/db/schema";
import { AppError } from "@/server/lib/errors";
import {
  asOverview,
  type LinkedInPageMetrics,
  linkedInDateRange,
  linkedInPreviousRange,
  linkedInIntervals,
} from "./linkedinReporting";
import {
  createLinkedInClient,
  followerStatisticsSchema,
  pageStatisticsSchema,
  shareStatisticsSchema,
} from "@/server/lib/linkedinClient";
import { LinkedInApiError } from "@/server/lib/linkedinErrors";
import {
  LINKEDIN_API_CACHE_TTL_MS,
  LINKEDIN_API_RETENTION_MS,
  LINKEDIN_MARKETING_API_VERSION,
  LINKEDIN_OAUTH_PROVIDER_ID,
  type LinkedInPageMetricTotals,
} from "@/shared/linkedin";
import { LinkedInPageApiRepository } from "../repositories/LinkedInPageApiRepository";

type LinkedInCacheRow = LinkedInPageMetrics & {
  retrievedAt: string;
  expiresAt: string;
  apiVersion: string;
  completeness: string;
};
type LinkedInApiOverview = {
  status: "ok";
  projectId: string;
  source: {
    provider: "linkedin_api";
    page: { id: string; name: string };
    dateRange: { start: string; end: string };
    previousDateRange: { start: string; end: string };
    retrievedAt: string;
    apiVersion: typeof LINKEDIN_MARKETING_API_VERSION;
    freshness: "fresh" | "stale";
    retainUntil: string;
  };
  current: LinkedInPageMetricTotals;
  previous: LinkedInPageMetricTotals;
  comparison: LinkedInPageMetricTotals;
  completeness: "complete" | "partial";
  warnings: Array<"api_refresh_failed">;
};
const inflight = new Map<string, Promise<LinkedInApiOverview>>();
const sum = (values: number[]) => {
  const total = values.reduce((a, b) => a + b, 0);
  if (!Number.isSafeInteger(total)) throw new LinkedInApiError("malformed");
  return total;
};
function normalizeMetrics(
  followers: unknown,
  page: unknown,
  shares: unknown,
): LinkedInPageMetrics {
  const f = followerStatisticsSchema.safeParse(followers);
  const p = pageStatisticsSchema.safeParse(page);
  const s = shareStatisticsSchema.safeParse(shares);
  if (!f.success || !p.success || !s.success)
    throw new LinkedInApiError("malformed");
  return {
    followerGains: sum(
      f.data.elements.map(
        (x) =>
          x.followerGains.organicFollowerGain +
          x.followerGains.paidFollowerGain,
      ),
    ),
    pageViews: sum(
      p.data.elements.map(
        (x) => x.totalPageStatistics.views.allPageViews.pageViews,
      ),
    ),
    organicImpressions: sum(
      s.data.elements.map((x) => x.totalShareStatistics.impressionCount),
    ),
    uniqueImpressions: sum(
      s.data.elements.map((x) => x.totalShareStatistics.uniqueImpressionsCount),
    ),
    clicks: sum(s.data.elements.map((x) => x.totalShareStatistics.clickCount)),
    likes: sum(s.data.elements.map((x) => x.totalShareStatistics.likeCount)),
    comments: sum(
      s.data.elements.map((x) => x.totalShareStatistics.commentCount),
    ),
    reposts: sum(s.data.elements.map((x) => x.totalShareStatistics.shareCount)),
  };
}
function cachedMetrics(cache: LinkedInCacheRow): LinkedInPageMetrics {
  return {
    followerGains: cache.followerGains,
    pageViews: cache.pageViews,
    organicImpressions: cache.organicImpressions,
    uniqueImpressions: cache.uniqueImpressions,
    clicks: cache.clicks,
    likes: cache.likes,
    comments: cache.comments,
    reposts: cache.reposts,
  };
}
function comparison(
  current: LinkedInPageMetrics,
  previous: LinkedInPageMetrics,
) {
  const difference = (key: keyof LinkedInPageMetrics) =>
    current[key] === null || previous[key] === null
      ? null
      : current[key] - previous[key];
  return {
    followerGains: difference("followerGains"),
    pageViews: difference("pageViews"),
    organicImpressions: difference("organicImpressions"),
    uniqueImpressions: difference("uniqueImpressions"),
    clicks: difference("clicks"),
    likes: difference("likes"),
    comments: difference("comments"),
    reposts: difference("reposts"),
  };
}
async function grant(userId: string, accountId: string) {
  return (
    (
      await db
        .select({ id: account.id })
        .from(account)
        .where(
          and(
            eq(account.userId, userId),
            eq(account.providerId, LINKEDIN_OAUTH_PROVIDER_ID),
            eq(account.accountId, accountId),
          ),
        )
        .limit(1)
    )[0] ?? null
  );
}

export const LinkedInPageApiService = {
  getConnection: (projectId: string) =>
    LinkedInPageApiRepository.getConnection(projectId),
  async userHasGrant(userId: string) {
    return (
      (
        await db
          .select({ id: account.id })
          .from(account)
          .where(
            and(
              eq(account.userId, userId),
              eq(account.providerId, LINKEDIN_OAUTH_PROVIDER_ID),
            ),
          )
      ).length > 0
    );
  },
  async listPages(userId: string) {
    const grants = await db
      .select({ accountId: account.accountId })
      .from(account)
      .where(
        and(
          eq(account.userId, userId),
          eq(account.providerId, LINKEDIN_OAUTH_PROVIDER_ID),
        ),
      );
    return Promise.all(
      grants.map(async (item) => ({
        accountId: item.accountId,
        pages: await createLinkedInClient({
          userId,
          linkedinAccountId: item.accountId,
        }).listAdminPages(),
      })),
    );
  },
  async selectPage(input: {
    projectId: string;
    organizationId: string;
    userId: string;
    accountId: string;
    pageId: string;
  }) {
    if (!(await grant(input.userId, input.accountId)))
      throw new AppError(
        "NOT_FOUND",
        "That LinkedIn account is not connected.",
      );
    const page = (
      await createLinkedInClient({
        userId: input.userId,
        linkedinAccountId: input.accountId,
      }).listAdminPages()
    ).find((item) => item.pageId === input.pageId);
    if (!page)
      throw new AppError(
        "NOT_FOUND",
        "That LinkedIn Page is not administered by the connected account.",
      );
    return LinkedInPageApiRepository.upsertConnection({
      projectId: input.projectId,
      organizationId: input.organizationId,
      pageId: page.pageId,
      pageName: page.pageName,
      connectedByUserId: input.userId,
      linkedinAccountId: input.accountId,
    });
  },
  async disconnect(input: { projectId: string; userId: string }) {
    const connection = await LinkedInPageApiRepository.getConnection(
      input.projectId,
    );
    await Promise.all([
      LinkedInPageApiRepository.deleteConnection(input.projectId),
      LinkedInPageApiRepository.deleteCaches(input.projectId),
    ]);
    if (
      connection &&
      (await LinkedInPageApiRepository.countConnectionsForGrant(
        connection.connectedByUserId,
        connection.linkedinAccountId,
      )) === 0
    )
      await db
        .delete(account)
        .where(
          and(
            eq(account.userId, connection.connectedByUserId),
            eq(account.providerId, LINKEDIN_OAUTH_PROVIDER_ID),
            eq(account.accountId, connection.linkedinAccountId),
          ),
        );
  },
  async overview(input: {
    projectId: string;
    startDate?: string;
    endDate?: string;
  }): Promise<LinkedInApiOverview> {
    const range = linkedInDateRange(input.startDate, input.endDate);
    const key = `${input.projectId}:${range.start}:${range.end}`;
    const existing = inflight.get(key);
    if (existing) return existing;
    const work = (async () => {
      const connection = await LinkedInPageApiRepository.getConnection(
        input.projectId,
      );
      if (!connection) throw new LinkedInApiError("not_connected");
      const priorRange = linkedInPreviousRange(range),
        now = Date.now(),
        retainBefore = new Date(now - LINKEDIN_API_RETENTION_MS).toISOString();
      await LinkedInPageApiRepository.purgeExpiredCaches(retainBefore);
      const [cache, priorCache] = await Promise.all([
        LinkedInPageApiRepository.getCache(
          input.projectId,
          connection.pageId,
          range.start,
          range.end,
        ),
        LinkedInPageApiRepository.getCache(
          input.projectId,
          connection.pageId,
          priorRange.start,
          priorRange.end,
        ),
      ]);
      const valid = (row: LinkedInCacheRow | null): row is LinkedInCacheRow =>
        row !== null &&
        row.apiVersion === LINKEDIN_MARKETING_API_VERSION &&
        Date.parse(row.retrievedAt) >= now - LINKEDIN_API_RETENTION_MS;
      const result = (
        current: LinkedInCacheRow,
        previous: LinkedInCacheRow,
        freshness: "fresh" | "stale",
        warning?: string,
      ): LinkedInApiOverview => ({
        status: "ok",
        projectId: input.projectId,
        source: {
          provider: "linkedin_api",
          page: { id: connection.pageId, name: connection.pageName },
          dateRange: range,
          previousDateRange: priorRange,
          retrievedAt: current.retrievedAt,
          apiVersion: LINKEDIN_MARKETING_API_VERSION,
          freshness,
          retainUntil: new Date(
            Date.parse(current.retrievedAt) + LINKEDIN_API_RETENTION_MS,
          ).toISOString(),
        },
        current: asOverview(cachedMetrics(current)),
        previous: asOverview(cachedMetrics(previous)),
        comparison: asOverview(
          comparison(
            cachedMetrics(current),
            cachedMetrics(previous),
          ) as LinkedInPageMetrics,
        ),
        completeness:
          current.completeness === "partial" ||
          previous.completeness === "partial"
            ? "partial"
            : "complete",
        warnings: warning ? ["api_refresh_failed"] : [],
      });
      if (
        valid(cache) &&
        valid(priorCache) &&
        Date.parse(cache.expiresAt) > now &&
        Date.parse(priorCache.expiresAt) > now
      )
        return result(cache, priorCache, "fresh");
      try {
        const client = createLinkedInClient({
          userId: connection.connectedByUserId,
          linkedinAccountId: connection.linkedinAccountId,
        });
        const org = encodeURIComponent(
          `urn:li:organization:${connection.pageId}`,
        );
        const fetchMetrics = async (target: { start: string; end: string }) => {
          const intervals = linkedInIntervals(target);
          const [followers, page, shares] = await Promise.all([
            client.request(
              `/rest/organizationalEntityFollowerStatistics?q=organizationalEntity&organizationalEntity=${org}&timeIntervals=${encodeURIComponent(intervals.followerAndShare)}`,
            ),
            client.request(
              `/rest/organizationPageStatistics?q=organization&organization=${org}&timeIntervals=${encodeURIComponent(intervals.page)}`,
            ),
            client.request(
              `/rest/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${org}&timeIntervals=${encodeURIComponent(intervals.followerAndShare)}`,
            ),
          ]);
          return normalizeMetrics(followers, page, shares);
        };
        const [metrics, previous] = await Promise.all([
            fetchMetrics(range),
            fetchMetrics(priorRange),
          ]),
          retrievedAt = new Date().toISOString(),
          expiresAt = new Date(now + LINKEDIN_API_CACHE_TTL_MS).toISOString();
        const current = {
          projectId: input.projectId,
          pageId: connection.pageId,
          startDate: range.start,
          endDate: range.end,
          ...metrics,
          retrievedAt,
          expiresAt,
          apiVersion: LINKEDIN_MARKETING_API_VERSION,
          completeness: "complete",
        };
        const prior = {
          projectId: input.projectId,
          pageId: connection.pageId,
          startDate: priorRange.start,
          endDate: priorRange.end,
          ...previous,
          retrievedAt,
          expiresAt,
          apiVersion: LINKEDIN_MARKETING_API_VERSION,
          completeness: "complete",
        };
        await Promise.all([
          LinkedInPageApiRepository.putCache(current),
          LinkedInPageApiRepository.putCache(prior),
        ]);
        return result(current, prior, "fresh");
      } catch (error) {
        if (valid(cache) && valid(priorCache))
          return result(cache, priorCache, "stale", "refresh failed");
        throw error;
      }
    })();
    inflight.set(key, work);
    try {
      return await work;
    } finally {
      inflight.delete(key);
    }
  },
};
