import { describe, expect, it } from "vitest";
import {
  advanceGrowthMonthlyReviewAt,
  growthMonthlyReviewCoordinate,
  initialGrowthMonthlyReviewAt,
} from "./GrowthMonthlySchedule";

describe("GrowthMonthlySchedule", () => {
  it.each([
    {
      timezone: "Europe/London",
      now: "2026-03-01T00:30:00.000Z",
      day: 1,
      expected: "2026-03-01T00:00:00.000Z",
    },
    {
      timezone: "America/Los_Angeles",
      now: "2026-03-01T07:30:00.000Z",
      day: 1,
      expected: "2026-02-01T08:00:00.000Z",
    },
    {
      timezone: "Pacific/Kiritimati",
      now: "2026-03-01T10:30:00.000Z",
      day: 8,
      expected: "2026-03-07T10:00:00.000Z",
    },
  ])(
    "initialises the local report day in $timezone",
    ({ timezone, now, day, expected }) => {
      expect(initialGrowthMonthlyReviewAt(new Date(now), timezone, day)).toBe(
        expected,
      );
    },
  );

  it("advances an overdue DST-crossing anchor until it is in the future", () => {
    expect(
      advanceGrowthMonthlyReviewAt(
        "2026-02-01T08:00:00.000Z",
        new Date("2026-04-15T12:00:00.000Z"),
        "America/Los_Angeles",
        1,
      ),
    ).toBe("2026-05-01T07:00:00.000Z");
  });

  it("freezes the previous complete local month into the cadence slot", () => {
    expect(
      growthMonthlyReviewCoordinate(
        "2026-03-01T08:00:00.000Z",
        "America/Los_Angeles",
      ),
    ).toEqual({
      periodStart: "2026-02-01",
      periodEnd: "2026-02-28",
      cadenceSlot: "monthly-review:scheduled:2026-02-01:2026-02-28",
    });
  });
});
