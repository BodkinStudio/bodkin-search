import { db } from "@/db";
import { analyticsEvents } from "@/db/schema";
import { and, eq, lte, gte, asc } from "drizzle-orm";
export async function touchEvidence(projectId: string, clickId: string | null) {
  const empty = {
    sourceHost: null,
    pagePath: null,
    referrerHost: null,
    campaignSource: null,
    campaignMedium: null,
    campaignName: null,
    action: null,
    destination: null,
    firstTouchAt: null,
    firstPagePath: null,
    firstSource: null,
  };
  if (!clickId) return empty;
  const [click] = await db
    .select()
    .from(analyticsEvents)
    .where(
      and(
        eq(analyticsEvents.projectId, projectId),
        eq(analyticsEvents.id, clickId),
      ),
    )
    .limit(1);
  if (!click) return empty;
  const history = await db
    .select()
    .from(analyticsEvents)
    .where(
      and(
        eq(analyticsEvents.projectId, projectId),
        eq(analyticsEvents.contextId, click.contextId),
        lte(analyticsEvents.receivedAt, click.receivedAt),
        gte(
          analyticsEvents.receivedAt,
          new Date(Date.parse(click.receivedAt) - 30 * 86400_000).toISOString(),
        ),
      ),
    )
    .orderBy(asc(analyticsEvents.receivedAt), asc(analyticsEvents.sequence))
    .limit(20000);
  const first = history[0];
  const campaign =
    history.findLast((e) => e.campaignSource || e.referrerHost) ?? click;
  return {
    sourceHost: click.pageHost,
    pagePath: click.pagePath,
    referrerHost: campaign.referrerHost,
    campaignSource: campaign.campaignSource,
    campaignMedium: campaign.campaignMedium,
    campaignName: campaign.campaignName,
    action: click.action,
    destination: click.destination,
    firstTouchAt: first?.receivedAt ?? click.receivedAt,
    firstPagePath: first?.pagePath ?? null,
    firstSource:
      first?.campaignSource ?? first?.referrerHost ?? "Direct / unknown",
  };
}
