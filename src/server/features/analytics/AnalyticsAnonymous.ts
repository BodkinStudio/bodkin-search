import { eq } from "drizzle-orm";
import { db } from "@/db";
import { analyticsContexts, type analyticsSources } from "@/db/schema";
import type { JourneyEvent } from "@/types/schemas/analytics";
import { AnalyticsRepository as repo } from "./AnalyticsRepository";
import { anonymousContextKey, isAnonymousContextKey } from "./crypto";

type Visitor = {
  source: typeof analyticsSources.$inferSelect;
  observedIp: string | null;
  userAgent?: string | null;
  networkSecret?: string;
  now: Date;
};

/** Today's key for this IP and browser, when the project has opted in. */
async function dayKey(visitor: Visitor) {
  const { source, observedIp, networkSecret } = visitor;
  if (!observedIp || !networkSecret) return undefined;
  const settings = await repo.settings(source.projectId);
  if (!settings.anonymousCollection) return undefined;
  return anonymousContextKey(
    networkSecret,
    {
      projectId: source.projectId,
      sourceId: source.id,
      ip: observedIp,
      userAgent: visitor.userAgent ?? "",
    },
    visitor.now,
  );
}

/**
 * The event with its context key: the browser's own ID when consented, or for
 * a storage-free event a key derived on the server from IP and browser, which
 * is collected under legitimate interest rather than consent. Undefined when
 * the project has not opted in to anonymous events or the edge sent no IP.
 */
export async function keyedEvent(raw: JourneyEvent, visitor: Visitor) {
  if (raw.mode !== "anonymous")
    return raw.contextId ? { ...raw, contextId: raw.contextId } : undefined;
  const key = await dayKey(visitor);
  if (!key) return undefined;
  return {
    ...raw,
    contextId: key,
    consent: {
      analytics: true,
      attribution: true,
      identity: true,
      policyVersion: `li:${raw.consent.policyVersion}`.slice(0, 100),
    },
  };
}

/**
 * Consent granted mid-visit: re-key today's anonymous context to the browser's
 * ID so its history carries over and the visitor is counted once.
 */
export async function adoptAnonymousContext(
  contextKey: string,
  policyVersion: string,
  visitor: Visitor,
) {
  if (isAnonymousContextKey(contextKey)) return undefined;
  const key = await dayKey(visitor);
  const { projectId, id: sourceId } = visitor.source;
  const anonymous = key && (await repo.context(projectId, sourceId, key));
  if (!anonymous) return undefined;
  await db
    .update(analyticsContexts)
    .set({ contextKey, policyVersion })
    .where(eq(analyticsContexts.id, anonymous.id));
  return repo.context(projectId, sourceId, contextKey);
}
