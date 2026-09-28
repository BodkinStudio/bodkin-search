import { Ga4MeasurementHealthService } from "@/server/features/ga4/services/Ga4MeasurementHealthService";
import { Ga4ReportingService } from "@/server/features/ga4/services/Ga4ReportingService";

const TIMEOUT_MS = 60_000;

function analyticsPropertyUrl(propertyId: string, section: string) {
  return `https://analytics.google.com/analytics/web/#/p${propertyId.replace(/^properties\//, "")}/${section}`;
}

export type AssessmentFinding = {
  title: string;
  whyItMatters: string;
  evidence: string;
  sourceUrl: string;
  observedAt: string;
  recommendedNextStep: string;
  unverified: string;
};

function withTimeout<T>(promise: Promise<T>) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Analytics check timed out.")),
      TIMEOUT_MS,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function checkGrowthAssessmentAnalytics(input: {
  projectId: string;
  pageUrl: string;
  observedAt: string;
}) {
  const [healthResult, reportResult] = await Promise.allSettled([
    withTimeout(
      Ga4MeasurementHealthService.getMeasurementHealth(input.projectId),
    ),
    withTimeout(
      Ga4ReportingService.runReport({
        projectId: input.projectId,
        kind: "page_performance",
        channel: "all",
        limit: 1_000,
      }),
    ),
  ]);
  const findings: AssessmentFinding[] = [];
  if (healthResult.status === "fulfilled") {
    const health = healthResult.value;
    const eventNames =
      health.keyEvents.map((event) => event.eventName).join(", ") || "none";
    findings.push({
      title: "Google Analytics property configuration was checked.",
      whyItMatters:
        "Configured key events and web streams are useful context before validating the selected page's measurement path.",
      evidence: `Property “${health.source.propertyDisplayName}” reported ${health.summary.webStreamCount} web stream(s); configured key event names: ${eventNames}.`,
      sourceUrl: analyticsPropertyUrl(
        health.source.propertyId,
        "admin/key-events",
      ),
      observedAt: input.observedAt,
      recommendedNextStep:
        "Use a controlled test or a page-specific Analytics report to verify the selected page's intended action and completion path.",
      unverified:
        "Property-level configuration does not prove that this page emits an event or that a configured key event records a conversion from it.",
    });
  } else {
    findings.push(
      unavailableFinding(
        "Google Analytics property configuration",
        "Configured web streams and key events could not be checked for this run.",
      ),
    );
  }
  if (reportResult.status === "fulfilled") {
    const report = reportResult.value;
    const expectedUrl = new URL(input.pageUrl);
    const expectedPath = expectedUrl.pathname.replace(/\/$/, "") || "/";
    const reportRow = report.rows.find((row) => {
      const path = String(row.pagePath ?? "").replace(/\/$/, "") || "/";
      return (
        path === expectedPath &&
        String(row.hostName ?? "").toLowerCase() ===
          expectedUrl.hostname.toLowerCase()
      );
    });
    const sourceUrl = analyticsPropertyUrl(
      report.source.propertyId,
      "reports/explorer",
    );
    findings.push(
      reportRow
        ? {
            title:
              "Google Analytics returned page-level activity for the selected path.",
            whyItMatters:
              "This gives a dated baseline for page views and reported key events before a follow-up measurement check.",
            evidence: `For ${expectedPath}, the ${report.request.resolvedDateRange.startDate}–${report.request.resolvedDateRange.endDate} report returned ${reportRow.screenPageViews} page view(s), ${reportRow.activeUsers} active user(s), and ${reportRow.keyEvents} key event(s).`,
            sourceUrl,
            observedAt: input.observedAt,
            recommendedNextStep:
              "Compare the same page-level report if a change is later approved, or after a controlled test.",
            unverified:
              "These aggregate metrics do not identify which action produced a key event or establish a conversion path from this page.",
          }
        : {
            title:
              "The selected page was not found in the returned Google Analytics page report.",
            whyItMatters:
              "A page-specific baseline was not available from this bounded report window and row limit.",
            evidence: `The ${report.request.resolvedDateRange.startDate}–${report.request.resolvedDateRange.endDate} page-performance report returned ${report.totalRowCount} row(s), limited to ${report.request.limit}; none matched ${expectedUrl.hostname}${expectedPath}.`,
            sourceUrl,
            observedAt: input.observedAt,
            recommendedNextStep:
              "Use an Analytics exploration with this exact host and path before treating page activity as measured.",
            unverified:
              "A missing row in this bounded report does not establish that the page lacks traffic, tags, events, or conversion measurement.",
          },
    );
  } else {
    findings.push(
      unavailableFinding(
        "Google Analytics page-level report",
        "The selected page's bounded activity report could not be checked for this run.",
      ),
    );
  }
  return {
    status:
      healthResult.status === "fulfilled" && reportResult.status === "fulfilled"
        ? ("completed" as const)
        : ("limited" as const),
    findings,
  };
}

function unavailableFinding(
  title: string,
  evidence: string,
): AssessmentFinding {
  return {
    title: `${title} was unavailable.`,
    whyItMatters: "This leaves part of the investigation evidence incomplete.",
    evidence,
    sourceUrl: "https://analytics.google.com/",
    observedAt: new Date().toISOString(),
    recommendedNextStep:
      "Retry the unavailable Analytics check after confirming the project connection is available.",
    unverified:
      "This unavailable check does not establish whether the page has traffic, tags, events, or conversion measurement.",
  };
}
