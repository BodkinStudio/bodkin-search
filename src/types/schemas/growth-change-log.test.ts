import { describe, expect, it } from "vitest";
import {
  getGrowthChangeLogSchema,
  recordGrowthPageChangeSchema,
} from "./growth-change-log";

describe("Growth change log schemas", () => {
  it("accepts the bounded manual change contract", () => {
    expect(
      recordGrowthPageChangeSchema.safeParse({
        projectId: "project_1",
        requestKey: "c6d24ae8-da66-45c3-9057-11e76520a34f",
        keyPageId: "page_1",
        happenedOn: new Date().toISOString().slice(0, 10),
        changeType: "content_updated",
        description: "  Updated the pricing copy.  ",
      }).success,
    ).toBe(true);
  });

  it("rejects malformed, future, and authority-bearing input", () => {
    const value = {
      projectId: "project_1",
      requestKey: "c6d24ae8-da66-45c3-9057-11e76520a34f",
      keyPageId: "page_1",
      happenedOn: "2026-02-30",
      changeType: "content_updated",
      description: "Updated the pricing copy.",
    };
    expect(recordGrowthPageChangeSchema.safeParse(value).success).toBe(false);
    expect(
      recordGrowthPageChangeSchema.safeParse({
        ...value,
        happenedOn: "2999-01-01",
      }).success,
    ).toBe(false);
    expect(
      recordGrowthPageChangeSchema.safeParse({
        ...value,
        happenedOn: new Date().toISOString().slice(0, 10),
        actorId: "forged",
      }).success,
    ).toBe(false);
    expect(
      getGrowthChangeLogSchema.safeParse({
        projectId: "project_1",
        organizationId: "forged",
      }).success,
    ).toBe(false);
  });
});
