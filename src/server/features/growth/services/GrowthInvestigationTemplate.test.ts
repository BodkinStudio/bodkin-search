import { describe, expect, it } from "vitest";
import {
  lowCtrInvestigationTemplate,
  priorityPageInvestigationTemplate,
} from "./GrowthInvestigationTemplate";
import {
  investigationKeysForDescriptor,
  strikingDistanceInvestigationDescriptor,
  lowCtrInvestigationDescriptor,
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
  it("maps low CTR to its four-fact controller template", () => {
    expect(lowCtrInvestigationDescriptor).toMatchObject({
      controller: { signalType: "ctr_below_expected", metric: "gsc_ctr" },
      companionMetrics: [
        "gsc_clicks",
        "gsc_impressions",
        "gsc_average_position",
      ],
    });
    const signal = {
      id: "ctr",
      projectId: "project",
      runId: "run",
      signalType: "ctr_below_expected",
      entityType: "search_query",
      entityRef: "query",
      metric: "gsc_ctr",
      severity: "info",
      confidence: 0,
      periodStart: "2026-08-01",
      periodEnd: "2026-08-28",
      baselineValue: 0.04,
      currentValue: 0.03,
      deltaValue: -0.01,
      deltaPercent: -25,
      evidenceKind: "gsc_period",
      evidenceRef: "evidence",
      capturedAt: "2026-08-29T00:00:00.000Z",
    } as const;
    const template = lowCtrInvestigationTemplate({
      projectId: "project",
      runId: "run",
      query: "query",
      page: "https://example.com/page",
      site: "example.com",
      commercialWeight: 1,
      signals: {
        ctr: signal,
        clicks: {
          ...signal,
          id: "clicks",
          metric: "gsc_clicks",
          baselineValue: 4,
          currentValue: 3,
        },
        impressions: {
          ...signal,
          id: "impressions",
          metric: "gsc_impressions",
          baselineValue: 100,
          currentValue: 100,
        },
        averagePosition: {
          ...signal,
          id: "position",
          metric: "gsc_average_position",
          baselineValue: 2,
          currentValue: 2,
        },
      },
    });
    expect(template.insight.signalIds).toHaveLength(4);
    expect(template.insight.explanation).toContain("CTR 4.0%");
    expect(template.insight.explanation).toContain("and 3.0%");
    expect(template.insight.explanation).toContain(
      "3 clicks from 100 impressions",
    );
    expect(template.insight.explanation).toContain("average position 2.0");
    expect(template.recommendation.rationale).toContain("4.0%");
    expect(template.recommendation.rationale).toContain("3.0%");
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
