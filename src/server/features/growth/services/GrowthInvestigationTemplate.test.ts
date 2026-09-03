import { describe, expect, it } from "vitest";
import { priorityPageInvestigationTemplate } from "./GrowthInvestigationTemplate";
import {
  investigationKeysForDescriptor,
  strikingDistanceInvestigationDescriptor,
} from "./GrowthInvestigationTemplateDescriptor";

describe("priorityPageInvestigationTemplate", () => {
  it("maps the striking descriptor to the exact controller and Work key family", () => {
    expect(strikingDistanceInvestigationDescriptor).toMatchObject({
      templateVersion: "striking-distance-investigation-v1",
      run: {
        cadenceSlotPrefix: "striking-distance-check:",
        detectorVersions: ["striking-distance-query-v1"],
      },
      controller: {
        signalType: "striking_distance_query",
        entityType: "search_query",
        metric: "gsc_impressions",
        evidenceKind: "gsc_period",
      },
      companionMetrics: ["gsc_clicks", "gsc_average_position"],
    });
    expect(
      investigationKeysForDescriptor(
        strikingDistanceInvestigationDescriptor,
        "signal_1",
      ).action,
    ).toBe("striking-distance-investigation-v1:action:signal_1");
  });
  it("keeps deterministic investigation text bounded and preserves the URL only as a target", () => {
    const url = `https://example.com/${"a".repeat(2_000)}`;
    const template = priorityPageInvestigationTemplate({
      projectId: "project_1",
      runId: "run_1",
      signal: {
        id: "signal_1",
        projectId: "project_1",
        runId: "run_1",
        signalType: "priority_page_click_decline",
        entityType: "key_page",
        entityRef: "page_1",
        metric: "gsc_clicks",
        severity: "warning",
        confidence: 0,
        periodStart: "2026-08-01",
        periodEnd: "2026-08-28",
        baselineValue: 100,
        currentValue: 40,
        deltaValue: -60,
        evidenceKind: "gsc_period",
        evidenceRef: "saved",
        capturedAt: "2026-08-30T10:00:00.000Z",
      },
      keyPage: { url, commercialWeight: 3 },
    });
    expect(template.insight.title).toHaveLength(
      "Observed priority-page click decline".length,
    );
    expect(template.recommendation.title.length).toBeLessThanOrEqual(300);
    expect(template.recommendation.targets).toEqual([
      { type: "url", value: url },
    ]);
    expect(template.insight.explanation).toContain("Baseline clicks: 100");
    expect(template.insight.explanation).toContain("Current clicks for");
    expect(template.recommendation.steps).toHaveLength(3);
  });
});
