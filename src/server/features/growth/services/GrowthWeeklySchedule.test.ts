import { describe, expect, it } from "vitest";
import {
  advanceGrowthWeeklyReviewAt,
  growthWeeklyReviewCoordinate,
  initialGrowthWeeklyReviewAt,
} from "./GrowthWeeklySchedule";

describe("GrowthWeeklySchedule", () => {
  it.each([
    [1, "2026-09-07T00:00:00.000Z"],
    [2, "2026-09-08T00:00:00.000Z"],
    [3, "2026-09-09T00:00:00.000Z"],
    [4, "2026-09-10T00:00:00.000Z"],
    [5, "2026-09-11T00:00:00.000Z"],
    [6, "2026-09-12T00:00:00.000Z"],
    [7, "2026-09-13T00:00:00.000Z"],
  ])("maps ISO weekday %i to its local boundary", (day, expected) => {
    expect(
      initialGrowthWeeklyReviewAt(
        new Date("2026-09-09T12:00:00.000Z"),
        "UTC",
        day,
      ),
    ).toBe(expected);
  });

  it("keeps today's boundary due after local midnight", () => {
    expect(
      initialGrowthWeeklyReviewAt(
        new Date("2026-09-09T12:00:00.000Z"),
        "UTC",
        3,
      ),
    ).toBe("2026-09-09T00:00:00.000Z");
  });

  it("resolves opposite UTC-side zones from their local calendar", () => {
    expect(
      initialGrowthWeeklyReviewAt(
        new Date("2026-09-06T12:00:00.000Z"),
        "Pacific/Kiritimati",
        7,
      ),
    ).toBe("2026-09-12T10:00:00.000Z");
    expect(
      initialGrowthWeeklyReviewAt(
        new Date("2026-09-07T06:00:00.000Z"),
        "America/Los_Angeles",
        7,
      ),
    ).toBe("2026-09-06T07:00:00.000Z");
  });

  it("advances across a DST change without UTC-hour drift", () => {
    expect(
      advanceGrowthWeeklyReviewAt(
        "2026-10-18T23:00:00.000Z",
        new Date("2026-10-26T12:00:00.000Z"),
        "Europe/London",
      ),
    ).toBe("2026-11-02T00:00:00.000Z");
  });

  it("builds the preceding complete seven-day local coordinate", () => {
    expect(
      growthWeeklyReviewCoordinate(
        "2026-09-07T07:00:00.000Z",
        "America/Los_Angeles",
      ),
    ).toEqual({
      periodStart: "2026-08-31",
      periodEnd: "2026-09-06",
      cadenceSlot: "weekly-review:scheduled:2026-08-31:2026-09-06",
    });
  });
});
