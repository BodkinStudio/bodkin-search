import { describe, expect, it } from "vitest";
import { growthPreviewSchema } from "@/types/schemas/growth-preview";
import { buildGrowthPreview } from "./GrowthPreviewService";

describe("GrowthPreviewService", () => {
  it("composes deterministic sample evidence with the existing decline facts", async () => {
    const preview = await buildGrowthPreview();
    expect(await buildGrowthPreview()).toEqual(preview);
    expect(growthPreviewSchema.parse(preview)).toEqual(preview);
    expect(preview.pages).toHaveLength(6);
    const flagged = preview.pages.filter((page) => page.status === "flagged");
    expect(flagged).toHaveLength(1);
    expect(flagged[0]).toMatchObject({
      keyPageId: "key_pricing",
      status: "flagged",
      url: "https://example.com/pricing",
      severity: "critical",
      priority: 504,
      evidence: {
        subject: { commercialWeight: 3, protected: true },
        observation: {
          baselineClicks: 308,
          currentClicks: 140,
          deltaClicks: -168,
          baselinePeriod: preview.baselineWindow,
          currentPeriod: preview.currentWindow,
        },
        source: {
          projectId: "project_fixture",
          organizationId: "organization_fixture",
        },
      },
    });
    expect(flagged[0]?.evidence.observation.deltaPercent).toBeCloseTo(
      -54.54545,
    );
  });

  it("preserves the difference between an absent observation and zero clicks", async () => {
    const { pages } = await buildGrowthPreview();
    expect(
      pages.find((page) => page.keyPageId === "key_incomplete"),
    ).toMatchObject({
      status: "suppressed",
      reason: "missing_observation",
      baselineClicks: null,
      currentClicks: null,
    });
    expect(pages.find((page) => page.keyPageId === "key_new")).toMatchObject({
      reason: "zero_baseline",
      baselineClicks: 0,
      currentClicks: 0,
    });
    expect(pages.find((page) => page.keyPageId === "key_low")).toMatchObject({
      reason: "low_baseline",
      baselineClicks: 56,
      currentClicks: 28,
    });
    for (const id of ["key_stable", "key_growing"]) {
      expect(pages.find((page) => page.keyPageId === id)).toMatchObject({
        reason: "not_material",
      });
    }
  });

  it("returns only a bounded sample projection with partial synthetic history", async () => {
    const preview = await buildGrowthPreview();
    const payload = JSON.stringify(preview);
    expect(payload.length).toBeLessThan(16_384);
    expect(payload).not.toContain('"observations"');
    expect(payload).not.toContain('"rawUrl"');
    expect(payload).not.toContain("example.test");
    expect(preview).toMatchObject({ mode: "sample", site: "example.com" });
    const page = preview.pages.find((item) => item.status === "flagged");
    expect(page?.evidence.selectedChangeEvents).toMatchObject({
      coverage: "caller_selected",
      selectedCount: 1,
      includedCount: 1,
    });
    expect(page?.evidence.currentCommercialContext.currentNotHistorical).toBe(
      true,
    );
    expect(page?.evidence.trust.modelEgress).toBe("not_enabled_in_this_slice");
    expect(page?.evidence.limitations).toHaveLength(5);
  });
});
