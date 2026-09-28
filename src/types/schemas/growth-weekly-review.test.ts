import { describe, expect, it } from "vitest";
import {
  growthWeeklyReviewResponseSchema,
  scheduledGrowthWeeklyReviewInputSchema,
} from "./growth-weekly-review";

const payload = {
  projectId: "project_1",
  cadenceSlot: "weekly-review:scheduled:2026-08-31:2026-09-06",
  periodStart: "2026-08-31",
  periodEnd: "2026-09-06",
  reportTimezone: "UTC",
  scheduledAt: "2026-09-07T00:00:00.000Z",
  settingsRevision: 3,
};

describe("scheduledGrowthWeeklyReviewInputSchema", () => {
  it("accepts one frozen weekly coordinate", () => {
    expect(scheduledGrowthWeeklyReviewInputSchema.parse(payload)).toEqual(
      payload,
    );
  });

  it.each([
    { cadenceSlot: "weekly-review:scheduled:other" },
    { periodEnd: "2026-08-30" },
    { reportTimezone: "Not/A_Zone" },
    { scheduledAt: "next week" },
    { settingsRevision: 0 },
  ])("rejects payload drift (%o)", (drift) => {
    expect(
      scheduledGrowthWeeklyReviewInputSchema.safeParse({
        ...payload,
        ...drift,
      }).success,
    ).toBe(false);
  });
});

describe("growthWeeklyReviewResponseSchema", () => {
  it("accepts the compact six-section result", () => {
    expect(
      growthWeeklyReviewResponseSchema.parse({
        replayed: false,
        consistency: "current_not_snapshot",
        run: {
          id: "run_1",
          status: "completed",
          periodStart: payload.periodStart,
          periodEnd: payload.periodEnd,
          startedAt: payload.scheduledAt,
          completedAt: "2026-09-07T00:00:01.000Z",
          failureCode: null,
          failureMessage: null,
        },
        sections: {
          materialGains: 1,
          materialLosses: 2,
          newStrikingDistanceOpportunities: 3,
          actionsAtRisk: 4,
          actionsReadyForMeasurement: 5,
          recommendedFocus: "measurement_review",
        },
        warnings: [],
      }),
    ).toMatchObject({ replayed: false });
  });
});
