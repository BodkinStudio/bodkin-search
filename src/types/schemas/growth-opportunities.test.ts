import { describe, expect, it } from "vitest";
import {
  growthOpportunitiesRequestSchema,
  growthOpportunityDtoSchema,
} from "./growth-opportunities";

describe("growth opportunities schemas", () => {
  it("keeps the route echo strict", () => {
    expect(() =>
      growthOpportunitiesRequestSchema.parse({
        projectId: "project_1",
        signalId: "not allowed",
      }),
    ).toThrow();
  });

  it("rejects Run and raw relationship fields from the app-only review source", () => {
    const recommendation = {
      id: "recommendation_1",
      title: "Title",
      titleRedacted: false,
      titleTruncated: false,
      rationale: "Rationale",
      rationaleRedacted: false,
      rationaleTruncated: false,
      category: "content",
      categoryRedacted: false,
      categoryTruncated: false,
      impact: 1,
      commercialRelevance: 1,
      effort: 1,
      urgency: 1,
      confidence: 0,
      priorityScore: 0,
      status: "proposed",
      reviewVersion: 0,
      snoozedUntil: null,
      reviewedAt: null,
      createdAt: "2026-09-01T00:00:00.000Z",
      needsAction: false,
      targetCount: 0,
      displayTargets: [],
      displayTargetsOmitted: false,
      displayTargetsWithheld: false,
      stepCount: 0,
      displaySteps: [],
      displayStepsOmitted: false,
    };
    expect(() =>
      growthOpportunityDtoSchema.parse({
        recommendation,
        reviewSource: {
          signalId: "signal_1",
          runId: "internal_run",
          relationship: "controller",
        },
      }),
    ).toThrow();
  });
});
