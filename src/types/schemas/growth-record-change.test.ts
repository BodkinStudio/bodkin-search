import { describe, expect, it } from "vitest";
import { growthRecordChangeRequestSchema } from "./growth-record-change";

describe("growth record change schema", () => {
  it("is strict and accepts only model-safe input", () => {
    const value = {
      projectId: "project_1",
      requestKey: "11111111-1111-4111-8111-111111111111",
      changeType: "content_updated",
      description: "Changed page",
      happenedAt: "2026-01-01T00:00:00.000Z",
      urls: ["https://example.com/page"],
    };
    expect(growthRecordChangeRequestSchema.parse(value)).toEqual(value);
    expect(
      growthRecordChangeRequestSchema.safeParse({ ...value, actorId: "forged" })
        .success,
    ).toBe(false);
  });

  it("enforces UUID, offset timestamp, and URL cardinality bounds", () => {
    const value = {
      projectId: "project_1",
      requestKey: "11111111-1111-4111-8111-111111111111",
      changeType: "content_updated",
      description: "Changed page",
      happenedAt: "2026-01-01T00:00:00.000Z",
      urls: ["https://example.com/page"],
    };

    expect(
      growthRecordChangeRequestSchema.safeParse({
        ...value,
        requestKey: "retry",
      }).success,
    ).toBe(false);
    expect(
      growthRecordChangeRequestSchema.safeParse({
        ...value,
        happenedAt: "2026-01-01 00:00:00",
      }).success,
    ).toBe(false);
    expect(
      growthRecordChangeRequestSchema.safeParse({ ...value, urls: [] }).success,
    ).toBe(false);
    expect(
      growthRecordChangeRequestSchema.safeParse({
        ...value,
        urls: Array.from(
          { length: 101 },
          (_, index) => `https://example.com/${index}`,
        ),
      }).success,
    ).toBe(false);
  });
});
