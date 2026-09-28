import { describe, expect, it } from "vitest";
import {
  growthRecentChangesPageDtoSchema,
  growthRecentChangesRequestSchema,
} from "./growth-recent-changes";

describe("growth recent changes schema", () => {
  it("is strict, defaults the page size, and canonicalizes cursor offsets", () => {
    expect(
      growthRecentChangesRequestSchema.parse({
        projectId: " project_1 ",
        cursor: {
          happenedAt: "2026-09-01T10:00:00+01:00",
          id: " event_1 ",
        },
      }),
    ).toEqual({
      projectId: "project_1",
      limit: 20,
      cursor: {
        happenedAt: "2026-09-01T09:00:00.000Z",
        id: "event_1",
      },
    });
    expect(
      growthRecentChangesRequestSchema.safeParse({
        projectId: "project_1",
        unknown: true,
      }).success,
    ).toBe(false);
    expect(
      growthRecentChangesRequestSchema.safeParse({
        projectId: "project_1",
        limit: 51,
      }).success,
    ).toBe(false);
  });

  it("keeps the public page contract strict and bounded", () => {
    expect(
      growthRecentChangesPageDtoSchema.safeParse({
        changes: [],
        limit: 20,
        hasMore: false,
        nextCursor: null,
        actorId: "must-not-cross-the-boundary",
      }).success,
    ).toBe(false);
  });
});
