import { describe, expect, it } from "vitest";
import {
  growthMeasurementsPageDtoSchema,
  growthMeasurementsRequestSchema,
} from "./growth-measurements-list";

describe("growthMeasurementsRequestSchema", () => {
  it("defaults the limit and canonicalizes status filters and cursors", () => {
    expect(
      growthMeasurementsRequestSchema.parse({
        projectId: "project_1",
        statuses: ["completed", "active"],
        cursor: { createdAt: "2026-01-01T01:00:00+01:00", id: "plan_1" },
      }),
    ).toEqual({
      projectId: "project_1",
      statuses: ["active", "completed"],
      limit: 20,
      cursor: { createdAt: "2026-01-01T00:00:00.000Z", id: "plan_1" },
    });
  });

  it("rejects empty statuses and unknown output fields", () => {
    expect(
      growthMeasurementsRequestSchema.parse({
        projectId: "project_1",
        statuses: ["active", "active"],
      }).statuses,
    ).toEqual(["active"]);
    expect(
      growthMeasurementsRequestSchema.safeParse({
        projectId: "project_1",
        statuses: [],
      }).success,
    ).toBe(false);
    expect(
      growthMeasurementsRequestSchema.safeParse({
        projectId: "project_1",
        statuses: ["active", "completed", "active"],
      }).success,
    ).toBe(false);
    expect(
      growthMeasurementsPageDtoSchema.safeParse({
        measurements: [],
        limit: 20,
        hasMore: false,
        nextCursor: null,
        provider: "not public",
      }).success,
    ).toBe(false);
  });
});
