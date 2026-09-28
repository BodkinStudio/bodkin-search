import { describe, expect, it } from "vitest";
import {
  growthPriorityRecommendationsPageDtoSchema,
  growthPriorityRecommendationsRequestSchema,
} from "./growth-priority-recommendations";

describe("growthPriorityRecommendationsRequestSchema", () => {
  it("defaults and canonicalizes only unresolved statuses", () => {
    expect(
      growthPriorityRecommendationsRequestSchema.parse({
        projectId: "project_1",
        statuses: ["accepted", "proposed", "accepted"],
      }),
    ).toEqual({
      projectId: "project_1",
      statuses: ["proposed", "accepted"],
      limit: 20,
    });
  });

  it("rejects terminal statuses and malformed cursors", () => {
    expect(() =>
      growthPriorityRecommendationsRequestSchema.parse({
        projectId: "project_1",
        statuses: ["dismissed"],
      }),
    ).toThrow();
    expect(() =>
      growthPriorityRecommendationsRequestSchema.parse({
        projectId: "project_1",
        cursor: {
          priorityScore: 1,
          createdAt: "2026-08-20",
          id: "recommendation_1",
        },
      }),
    ).toThrow();
  });

  it("canonicalizes an equivalent offset cursor before repository comparison", () => {
    expect(
      growthPriorityRecommendationsRequestSchema.parse({
        projectId: "project_1",
        cursor: {
          priorityScore: 10,
          createdAt: "2026-08-20T10:00:00+01:00",
          id: "recommendation_1",
        },
      }).cursor,
    ).toEqual({
      priorityScore: 10,
      createdAt: "2026-08-20T09:00:00.000Z",
      id: "recommendation_1",
    });
  });

  it("keeps the request and public page contracts strict and bounded", () => {
    expect(
      growthPriorityRecommendationsRequestSchema.safeParse({
        projectId: "project_1",
        limit: 51,
      }).success,
    ).toBe(false);
    expect(
      growthPriorityRecommendationsRequestSchema.safeParse({
        projectId: "project_1",
        unexpected: true,
      }).success,
    ).toBe(false);
    expect(
      growthPriorityRecommendationsPageDtoSchema.safeParse({
        recommendations: [],
        limit: 20,
        hasMore: false,
        nextCursor: null,
        internalRunId: "must-not-cross-the-boundary",
      }).success,
    ).toBe(false);
  });
});
