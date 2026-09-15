import {
  growthPreviewSchema,
  type GrowthPreview,
} from "@/types/schemas/growth-preview";
import { DEFAULT_PRIORITY_PAGE_CLICK_DECLINE_THRESHOLDS } from "@/types/schemas/growth-search-performance";
import { buildGrowthEvidencePacket } from "./GrowthEvidencePacket";
import {
  createGrowthSearchPerformanceFixture,
  GROWTH_SEARCH_PERFORMANCE_FIXTURE_WINDOWS,
} from "./GrowthSearchPerformanceFixture";
import {
  detectPriorityPageClickDeclines,
  PRIORITY_PAGE_CLICK_DECLINE_DETECTOR_VERSION,
} from "./PriorityPageClickDeclineDetector";

const PAGE_LABELS: Record<string, string> = {
  key_pricing: "Pricing",
  key_stable: "Stable page",
  key_growing: "Growing page",
  key_low: "Low-volume page",
  key_new: "New page",
  key_incomplete: "Incomplete data",
};
const CONTEXT_UPDATED_AT = "2026-08-01T12:00:00.000Z";

function sampleUrl(value: string) {
  return value.replace("example.test", "example.com");
}

/** Fixed sample only. Never reads the authorized project's content or storage. */
export async function buildGrowthPreview(): Promise<GrowthPreview> {
  const fixture = createGrowthSearchPerformanceFixture();
  // The packet's existing URL policy requires a public suffix. Keep the
  // fixture's observations intact and use the reserved example.com domain.
  const snapshot = {
    ...fixture,
    property: "sc-domain:example.com",
    keyPages: fixture.keyPages.map((page) => ({
      ...page,
      url: sampleUrl(page.url),
    })),
    observations: fixture.observations.map((row) => ({
      ...row,
      rawUrl: sampleUrl(row.rawUrl),
    })),
  };
  const runId = "run_fixture_preview";
  const outcomes = await detectPriorityPageClickDeclines({
    projectId: snapshot.projectId,
    runId,
    snapshot,
    ...GROWTH_SEARCH_PERFORMANCE_FIXTURE_WINDOWS,
  });
  const context = {
    sections: [
      {
        key: "business_overview",
        content:
          "Sample business selling booking software to independent restaurants.",
        updatedAt: CONTEXT_UPDATED_AT,
      },
      {
        key: "current_goal",
        content:
          "Help organic visitors compare plans before requesting a demo.",
        updatedAt: CONTEXT_UPDATED_AT,
      },
      {
        key: "positioning",
        content:
          "A simple booking tool for small teams. Fictional context only.",
        updatedAt: CONTEXT_UPDATED_AT,
      },
    ],
    keyPages: snapshot.keyPages.map((page) => ({
      ...page,
      role: page.id === "key_pricing" ? ("money" as const) : ("other" as const),
      topic: PAGE_LABELS[page.id] ?? page.id,
      notes:
        page.id === "key_pricing"
          ? "Sample priority page for visitors comparing plans. Review evidence before changing it."
          : null,
      protected: page.id === "key_pricing",
      activelyOptimized: false,
      updatedAt: CONTEXT_UPDATED_AT,
    })),
  };
  const pages = await Promise.all(
    outcomes.map(async (outcome) => {
      const keyPage = snapshot.keyPages.find(
        (item) => item.id === outcome.keyPageId,
      )!;
      const identity = {
        keyPageId: keyPage.id,
        label: PAGE_LABELS[keyPage.id] ?? keyPage.id,
        url: keyPage.url,
      };
      if (outcome.status !== "signal" || !outcome.signal) {
        return {
          ...identity,
          status: "suppressed" as const,
          reason: outcome.suppressionReason,
          baselineClicks: outcome.baselineClicks ?? null,
          currentClicks: outcome.currentClicks ?? null,
        };
      }
      const evidence = await buildGrowthEvidencePacket({
        organizationId: "organization_fixture",
        project: { id: snapshot.projectId, name: "Example business (sample)" },
        signal: {
          ...outcome.signal,
          id: `signal_fixture_${keyPage.id}`,
          deltaPercent: outcome.signal.deltaPercent ?? null,
        },
        run: {
          id: runId,
          projectId: snapshot.projectId,
          detectorVersion: PRIORITY_PAGE_CLICK_DECLINE_DETECTOR_VERSION,
        },
        context,
        assembledAt: snapshot.capturedAt,
        selectedEventIds: ["change_fixture_pricing_copy"],
        selectionProvided: true,
        events: [
          {
            event: {
              id: "change_fixture_pricing_copy",
              projectId: snapshot.projectId,
              changeType: "content_updated",
              source: "manual",
              description:
                "Sample change: the pricing page introduction was rewritten. No effect has been established.",
              happenedAt: "2026-07-11T16:00:00.000Z",
            },
            urls: ["https://example.com/pricing"],
          },
        ],
      });
      return {
        ...identity,
        status: "flagged" as const,
        severity: outcome.signal.severity,
        priority: outcome.priority,
        evidence,
      };
    }),
  );
  return growthPreviewSchema.parse({
    mode: "sample",
    fixtureVersion: "growth-preview-v1",
    site: "example.com",
    sourceWindow: snapshot.sourceWindow,
    ...GROWTH_SEARCH_PERFORMANCE_FIXTURE_WINDOWS,
    capturedAt: snapshot.capturedAt,
    calendar: snapshot.source.calendar,
    thresholds: DEFAULT_PRIORITY_PAGE_CLICK_DECLINE_THRESHOLDS,
    pages,
  });
}
