import { describe, expect, it } from "vitest";
import { GROWTH_DISMISSAL_REASONS } from "./growth";
import {
  growthInvestigationViewSchema,
  reviewGrowthInvestigationSchema,
} from "./growth-investigations";

const request = {
  projectId: "project_1",
  signalId: "signal_1",
  expectedVersion: 2,
};

const view = {
  relationship: "controller" as const,
  recommendationId: "recommendation_1",
  title: "Investigate declining clicks",
  rationale: "The saved evidence shows a decline, but not its cause.",
  steps: ["Review the saved evidence."],
  displayUrls: ["https://example.com/pricing", null],
  status: "proposed" as const,
  reviewVersion: 2,
  dismissalReason: null,
  snoozedUntil: null,
  actionId: null,
  dueOn: null,
  templateVersion: "priority-page-investigation-v1",
};

describe("Growth investigation schemas", () => {
  it("accepts every shared dismissal reason", () => {
    for (const dismissalReason of GROWTH_DISMISSAL_REASONS) {
      expect(
        reviewGrowthInvestigationSchema.parse({
          ...request,
          decision: "dismiss",
          dismissalReason,
        }),
      ).toEqual({ ...request, decision: "dismiss", dismissalReason });
    }
  });

  it("keeps review decisions strict and rejects cross-decision metadata", () => {
    expect(
      reviewGrowthInvestigationSchema.parse({
        ...request,
        decision: "snooze",
        snoozeUntil: "2026-09-04",
      }),
    ).toEqual({ ...request, decision: "snooze", snoozeUntil: "2026-09-04" });
    expect(
      reviewGrowthInvestigationSchema.parse({
        ...request,
        decision: "review_now",
      }),
    ).toEqual({ ...request, decision: "review_now" });

    for (const value of [
      { ...request, decision: "dismiss", dismissalReason: "not_now" },
      {
        ...request,
        decision: "dismiss",
        dismissalReason: "duplicate",
        snoozeUntil: "2026-09-04",
      },
      {
        ...request,
        decision: "snooze",
        snoozeUntil: "2026-09-04",
        dismissalReason: "duplicate",
      },
      { ...request, decision: "review_now", status: "proposed" },
      { ...request, decision: "review_now", actorId: "user_1" },
    ]) {
      expect(() => reviewGrowthInvestigationSchema.parse(value)).toThrow();
    }
  });

  it("rejects malformed and impossible calendar dates", () => {
    for (const snoozeUntil of ["", "2026-9-4", "2026-02-30", "tomorrow"]) {
      expect(() =>
        reviewGrowthInvestigationSchema.parse({
          ...request,
          decision: "snooze",
          snoozeUntil,
        }),
      ).toThrow();
    }
  });

  it("parses only the documented safe investigation view", () => {
    expect(growthInvestigationViewSchema.parse(view)).toEqual(view);
    for (const internalField of [
      "runId",
      "resolutionRecommendationId",
      "actorId",
      "factHash",
      "unknownFutureColumn",
    ]) {
      expect(() =>
        growthInvestigationViewSchema.parse({
          ...view,
          [internalField]: "must_not_escape",
        }),
      ).toThrow();
    }
  });

  it("keeps a covered view strict and excludes the controller's old evidence", () => {
    const covered = {
      relationship: "suppressed" as const,
      recommendationId: "recommendation_1",
      title: "Investigate declining clicks",
      status: "accepted" as const,
      suppressionReason: "existing_action" as const,
      policyVersion: "priority-page-repeat-suppression-v1",
      actionId: "action_1",
      dueOn: "2026-09-04",
    };
    expect(growthInvestigationViewSchema.parse(covered)).toEqual(covered);
    for (const staleField of ["rationale", "steps", "displayUrls"]) {
      expect(() =>
        growthInvestigationViewSchema.parse({
          ...covered,
          [staleField]: staleField === "steps" ? ["Old step"] : "Old fact",
        }),
      ).toThrow();
    }
    expect(() =>
      growthInvestigationViewSchema.parse({
        ...covered,
        suppressionReason: "future_reason",
      }),
    ).toThrow();
  });

  it("requires CTR for low-CTR evidence and excludes it from striking evidence", () => {
    const sharedEvidence = {
      query: "pricing software",
      page: "https://example.com/pricing",
      site: "sc-domain:example.com",
      baselinePeriod: { start: "2026-07-01", end: "2026-07-28" },
      currentPeriod: { start: "2026-07-29", end: "2026-08-25" },
    };
    const lowCtrEvidence = {
      ...sharedEvidence,
      kind: "high_impression_low_ctr_query" as const,
      baseline: {
        position: 3.8,
        impressions: 800,
        clicks: 100,
        ctr: 0.125,
      },
      current: {
        position: 3.4,
        impressions: 1_000,
        clicks: 75,
        ctr: 0.075,
      },
    };
    expect(
      growthInvestigationViewSchema.parse({
        ...view,
        templateVersion: "high-impression-low-ctr-investigation-v1",
        evidenceSummary: lowCtrEvidence,
      }),
    ).toMatchObject({ evidenceSummary: lowCtrEvidence });
    expect(() =>
      growthInvestigationViewSchema.parse({
        ...view,
        templateVersion: "high-impression-low-ctr-investigation-v1",
        evidenceSummary: {
          ...lowCtrEvidence,
          current: { position: 3.4, impressions: 1_000, clicks: 75 },
        },
      }),
    ).toThrow();

    const strikingEvidence = {
      ...sharedEvidence,
      kind: "striking_distance_query" as const,
      baseline: { position: 14.2, impressions: 86, clicks: 3 },
      current: { position: 8.4, impressions: 1_250, clicks: 27 },
    };
    expect(
      growthInvestigationViewSchema.parse({
        ...view,
        templateVersion: "striking-distance-investigation-v1",
        evidenceSummary: strikingEvidence,
      }),
    ).toMatchObject({ evidenceSummary: strikingEvidence });
    expect(() =>
      growthInvestigationViewSchema.parse({
        ...view,
        templateVersion: "striking-distance-investigation-v1",
        evidenceSummary: {
          ...strikingEvidence,
          baseline: { ...strikingEvidence.baseline, ctr: 0.03 },
        },
      }),
    ).toThrow();
  });

  it("requires canonical review metadata only for its matching status", () => {
    expect(
      growthInvestigationViewSchema.parse({
        ...view,
        status: "dismissed",
        reviewVersion: 3,
        dismissalReason: "wrong_diagnosis",
      }),
    ).toMatchObject({
      status: "dismissed",
      dismissalReason: "wrong_diagnosis",
    });
    expect(
      growthInvestigationViewSchema.parse({
        ...view,
        status: "snoozed",
        reviewVersion: 3,
        snoozedUntil: "2026-09-04T00:00:00.000Z",
      }),
    ).toMatchObject({
      status: "snoozed",
      snoozedUntil: "2026-09-04T00:00:00.000Z",
    });
    expect(() =>
      growthInvestigationViewSchema.parse({
        ...view,
        status: "dismissed",
      }),
    ).toThrow("dismissal reason");
    expect(() =>
      growthInvestigationViewSchema.parse({
        ...view,
        snoozedUntil: "2026-09-04T00:00:00.000Z",
      }),
    ).toThrow("Snooze metadata only applies");
    expect(() =>
      growthInvestigationViewSchema.parse({
        ...view,
        status: "snoozed",
        snoozedUntil: "2026-09-04 00:00:00",
      }),
    ).toThrow();
  });
});
