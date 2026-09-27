import { and, count, eq, gte, isNotNull, isNull, max, gt } from "drizzle-orm";
import { db } from "@/db";
import {
  analyticsCustomers,
  analyticsEvents,
  analyticsOutbox,
  analyticsOutcomes,
  analyticsSettings,
  analyticsSources,
} from "@/db/schema";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export type TrackingCheckState = "pass" | "warn" | "fail" | "not_applicable";
export type TrackingStatus = "not_installed" | "live" | "quiet" | "silent";

// Plain-language reasons a new customer could not be tied to a visit.
const UNMATCHED_REASONS: Record<string, string> = {
  no_candidate: "no tracked click from the same network within the window",
  ambiguous: "several visitors shared the same network",
  window_expired: "they registered too long after clicking",
  permission_unavailable: "the visitor did not allow attribution",
  client_observation_missing: "no registration was seen from their browser",
};

function statusFor(lastEventAt: string | null, now: number): TrackingStatus {
  if (!lastEventAt) return "not_installed";
  const age = now - Date.parse(lastEventAt);
  return age < DAY ? "live" : age < 7 * DAY ? "quiet" : "silent";
}

// Whether journey tracking is arriving, and whether it carries what IP
// matching needs (a tracked click, a browser registration, a backend outcome).
// Aggregates only: safe to show to anyone who can read the project.
export async function trackingHealth(
  projectId: string,
  environment: "production" | "test",
  now = Date.now(),
) {
  const since = (ms: number) => new Date(now - ms).toISOString();
  const inEnvironment = and(
    eq(analyticsEvents.projectId, projectId),
    eq(analyticsEvents.environment, environment),
  );
  const [sources, bySource, byName, outcomes, customers, deliveries, settings] =
    await Promise.all([
      db
        .select()
        .from(analyticsSources)
        .where(
          and(
            eq(analyticsSources.projectId, projectId),
            eq(analyticsSources.environment, environment),
          ),
        ),
      db
        .select({
          sourceId: analyticsEvents.sourceId,
          lastEventAt: max(analyticsEvents.receivedAt),
        })
        .from(analyticsEvents)
        .where(inEnvironment)
        .groupBy(analyticsEvents.sourceId),
      db
        .select({
          name: analyticsEvents.name,
          events: count(),
          lastAt: max(analyticsEvents.receivedAt),
        })
        .from(analyticsEvents)
        .where(
          and(inEnvironment, gte(analyticsEvents.receivedAt, since(7 * DAY))),
        )
        .groupBy(analyticsEvents.name),
      db
        .select({ outcomes: count() })
        .from(analyticsOutcomes)
        .where(
          and(
            eq(analyticsOutcomes.projectId, projectId),
            eq(analyticsOutcomes.environment, environment),
            gte(analyticsOutcomes.occurredAt, since(7 * DAY)),
          ),
        ),
      db
        .select({
          method: analyticsCustomers.method,
          reason: analyticsCustomers.reason,
          customers: count(),
        })
        .from(analyticsCustomers)
        .where(
          and(
            eq(analyticsCustomers.projectId, projectId),
            eq(analyticsCustomers.environment, environment),
            isNotNull(analyticsCustomers.acquiredAt),
            gte(analyticsCustomers.acquiredAt, since(30 * DAY)),
          ),
        )
        .groupBy(analyticsCustomers.method, analyticsCustomers.reason),
      db
        .select({ failed: count() })
        .from(analyticsOutbox)
        .where(
          and(
            eq(analyticsOutbox.projectId, projectId),
            isNull(analyticsOutbox.deliveredAt),
            gt(analyticsOutbox.attempts, 0),
          ),
        ),
      db
        .select({ webhookUrl: analyticsSettings.webhookUrl })
        .from(analyticsSettings)
        .where(eq(analyticsSettings.projectId, projectId))
        .limit(1),
    ]);

  const lastBySource = new Map(
    bySource.map((row) => [row.sourceId, row.lastEventAt]),
  );
  const lastEventAt =
    bySource
      .map((row) => row.lastEventAt)
      .filter((value): value is string => Boolean(value))
      .toSorted()
      .at(-1) ?? null;
  const named = (name: string) => byName.find((row) => row.name === name);
  const pageViews = named("page_view");
  const clicks = named("acquisition_clicked");
  const registrations = named("identity_known");
  const outcomeCount = outcomes[0]?.outcomes ?? 0;
  const newCustomers = customers.reduce((sum, row) => sum + row.customers, 0);
  const matched = customers
    .filter((row) => row.method !== "unattributed")
    .reduce((sum, row) => sum + row.customers, 0);
  const topMiss = customers
    .filter((row) => row.method === "unattributed")
    .toSorted((a, b) => b.customers - a.customers)[0];
  const failedDeliveries = deliveries[0]?.failed ?? 0;
  const pageViewsToday =
    pageViews?.lastAt && Date.parse(pageViews.lastAt) > now - DAY;

  const checks: {
    key: string;
    label: string;
    state: TrackingCheckState;
    detail: string;
  }[] = [
    {
      key: "page_views",
      label: "Page views are arriving",
      state: pageViewsToday ? "pass" : pageViews ? "warn" : "fail",
      detail: pageViewsToday
        ? `${pageViews.events.toLocaleString("en-GB")} in the last 7 days.`
        : pageViews
          ? "None in the last 24 hours. Check the tracker is still on the site and consent is being granted."
          : "No page views in the last 7 days. Install the snippet on your site and allow analytics in a browser to test.",
    },
    {
      key: "clicks",
      label: "Sign-up clicks are tracked",
      state: clicks ? "pass" : "warn",
      detail: clicks
        ? `${clicks.events.toLocaleString("en-GB")} tracked clicks to your app in the last 7 days.`
        : 'No tracked clicks to your app in 7 days. Matching a sign-up to a visit needs the links into your app marked with data-bodkin-event="acquisition_clicked".',
    },
    {
      key: "registrations",
      label: "Registrations are seen from the browser",
      state: registrations ? "pass" : "warn",
      detail: registrations
        ? `${registrations.events.toLocaleString("en-GB")} in the last 7 days.`
        : "No registration events from a browser in 7 days. Fire identity_known from the page where people finish signing up, so the visit and the new customer can be connected.",
    },
    {
      key: "outcomes",
      label: "Your backend reports outcomes",
      state: outcomeCount > 0 ? "pass" : "warn",
      detail:
        outcomeCount > 0
          ? `${outcomeCount.toLocaleString("en-GB")} outcomes (trials, sign-ups, payments) in the last 7 days.`
          : "No outcomes from your backend in 7 days. Trials, sign-ups and payments only count once your server sends them.",
    },
    {
      key: "matching",
      label: "New customers are matched to visits",
      state:
        newCustomers === 0
          ? "not_applicable"
          : matched / newCustomers >= 0.5
            ? "pass"
            : matched / newCustomers >= 0.2
              ? "warn"
              : "fail",
      detail:
        newCustomers === 0
          ? "No new customers in the last 30 days yet."
          : `${matched} of ${newCustomers} new customers in 30 days were matched to a visit.${
              topMiss
                ? ` Most unmatched ones: ${UNMATCHED_REASONS[topMiss.reason] ?? topMiss.reason}.`
                : ""
            }`,
    },
    {
      key: "deliveries",
      label: "Webhook deliveries succeed",
      state: !settings[0]?.webhookUrl
        ? "not_applicable"
        : failedDeliveries > 0
          ? "fail"
          : "pass",
      detail: !settings[0]?.webhookUrl
        ? "No webhook configured."
        : failedDeliveries > 0
          ? `${failedDeliveries} deliveries are failing and will be retried.`
          : "Deliveries are going through.",
    },
  ];

  return {
    environment,
    status: statusFor(lastEventAt, now),
    lastEventAt,
    sources: sources.map((source) => ({
      id: source.id,
      hostname: source.hostname,
      kind: source.kind,
      lastEventAt: lastBySource.get(source.id) ?? null,
    })),
    checks,
  };
}
