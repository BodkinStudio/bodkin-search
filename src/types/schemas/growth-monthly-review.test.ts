import { describe, expect, it } from "vitest";
import {
  growthMonthlyReviewResponseSchema,
  runGrowthMonthlyReviewRequestSchema,
  scheduledGrowthMonthlyReviewInputSchema,
} from "./growth-monthly-review";

const timestamp = "2026-09-01T08:00:00.000Z";

function completedRun() {
  return {
    id: "run_monthly_review_1",
    status: "completed" as const,
    periodStart: "2026-08-01",
    periodEnd: "2026-08-31",
    startedAt: timestamp,
    completedAt: "2026-09-01T08:01:00.000Z",
    failureCode: null,
    failureMessage: null,
  };
}

function initialResponse() {
  return {
    replayed: false as const,
    consistency: "current_not_snapshot" as const,
    run: completedRun(),
    check: {
      replayed: false,
      run: {
        id: "run_priority_check_1",
        status: "completed" as const,
        periodStart: "2026-07-05",
        periodEnd: "2026-08-29",
        startedAt: timestamp,
        completedAt: "2026-09-01T08:00:30.000Z",
      },
    },
    dueMeasurements: {
      scanState: "complete" as const,
      items: [],
      hasMore: false,
    },
    report: {
      state: "no_activity" as const,
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      reportTimezone: "Europe/London",
      message: "No eligible saved activity was available when the build ran.",
    },
    warnings: [] as string[],
  };
}

describe("runGrowthMonthlyReviewRequestSchema", () => {
  it("accepts only a bounded route echo and caller-stable request key", () => {
    expect(
      runGrowthMonthlyReviewRequestSchema.parse({
        projectId: " project_1 ",
        requestKey: " monthly_2026_08 ",
      }),
    ).toEqual({
      projectId: "project_1",
      requestKey: "monthly_2026_08",
    });

    for (const request of [
      { projectId: "", requestKey: "monthly_2026_08" },
      { projectId: "p".repeat(101), requestKey: "monthly_2026_08" },
      { projectId: "project_1", requestKey: "" },
      { projectId: "project_1", requestKey: "month/2026" },
      { projectId: "project_1", requestKey: "month 2026" },
      { projectId: "project_1", requestKey: "r".repeat(121) },
      {
        projectId: "project_1",
        requestKey: "monthly_2026_08",
        actorId: "forged",
      },
      {
        projectId: "project_1",
        requestKey: "monthly_2026_08",
        now: timestamp,
      },
    ])
      expect(
        runGrowthMonthlyReviewRequestSchema.safeParse(request).success,
      ).toBe(false);
  });
});

describe("scheduledGrowthMonthlyReviewInputSchema", () => {
  const scheduled = {
    projectId: "project_1",
    cadenceSlot: "monthly-review:scheduled:2026-08-01:2026-08-31",
    periodStart: "2026-08-01",
    periodEnd: "2026-08-31",
    reportTimezone: "Europe/London",
    scheduledAt: "2026-09-01T00:00:00.000Z",
    settingsRevision: 1,
  };

  it("accepts one exact frozen schedule coordinate", () => {
    expect(scheduledGrowthMonthlyReviewInputSchema.parse(scheduled)).toEqual(
      scheduled,
    );
  });

  it.each([
    { cadenceSlot: "monthly-review:scheduled:other" },
    { periodEnd: "2026-07-31" },
    { reportTimezone: "Not/A_Zone" },
    { scheduledAt: "tomorrow" },
    { settingsRevision: 0 },
  ])("rejects invalid Workflow payload drift (%o)", (drift) => {
    expect(
      scheduledGrowthMonthlyReviewInputSchema.safeParse({
        ...scheduled,
        ...drift,
      }).success,
    ).toBe(false);
  });
});

describe("growthMonthlyReviewResponseSchema", () => {
  it("accepts strict replay and initial response variants", () => {
    expect(
      growthMonthlyReviewResponseSchema.parse({
        replayed: true,
        run: {
          ...completedRun(),
          status: "running",
          completedAt: null,
        },
      }),
    ).toMatchObject({ replayed: true, run: { status: "running" } });
    expect(growthMonthlyReviewResponseSchema.parse(initialResponse())).toEqual(
      initialResponse(),
    );
  });

  it("keeps replay responses to the stored run and initial runs terminal", () => {
    expect(
      growthMonthlyReviewResponseSchema.safeParse({
        replayed: true,
        run: completedRun(),
        warnings: [],
      }).success,
    ).toBe(false);
    expect(
      growthMonthlyReviewResponseSchema.safeParse({
        ...initialResponse(),
        run: {
          ...completedRun(),
          status: "running",
          completedAt: null,
        },
      }).success,
    ).toBe(false);
  });

  it("requires the coordinator's closed safe terminal failures", () => {
    const partial = {
      ...initialResponse(),
      run: {
        ...completedRun(),
        status: "completed_with_errors" as const,
        failureCode: "MONTHLY_REVIEW_PARTIAL",
        failureMessage:
          "Monthly review completed with one or more incomplete phases.",
      },
    };
    expect(growthMonthlyReviewResponseSchema.safeParse(partial).success).toBe(
      true,
    );
    expect(
      growthMonthlyReviewResponseSchema.safeParse({
        ...partial,
        run: {
          ...partial.run,
          failureCode: "RAW_DATABASE_ERROR",
          failureMessage: "connection string leaked",
        },
      }).success,
    ).toBe(false);
  });

  it("accepts warning subsets only once and in phase order", () => {
    expect(
      growthMonthlyReviewResponseSchema.safeParse({
        ...initialResponse(),
        warnings: [
          "PRIORITY_PAGE_CHECK_PARTIAL",
          "DUE_MEASUREMENTS_OVERFLOW",
          "MONTHLY_REPORT_DRIFT",
        ],
      }).success,
    ).toBe(true);
    for (const warnings of [
      ["MONTHLY_REPORT_FAILED", "PRIORITY_PAGE_CHECK_FAILED"],
      ["DUE_MEASUREMENTS_FAILED", "DUE_MEASUREMENTS_FAILED"],
      ["RAW_PROVIDER_FAILURE"],
    ])
      expect(
        growthMonthlyReviewResponseSchema.safeParse({
          ...initialResponse(),
          warnings,
        }).success,
      ).toBe(false);
  });

  it("rejects unknown, raw error-shaped and overlong nested output", () => {
    const rawAtRoot = { ...initialResponse(), error: new Error("raw") };
    const rawInCheck = initialResponse();
    Object.assign(rawInCheck.check, {
      error: { name: "Error", message: "raw", stack: "private" },
    });
    const childFailureText = {
      ...initialResponse(),
      check: {
        replayed: false,
        run: {
          id: "run_priority_check_1",
          periodStart: "2026-07-05",
          periodEnd: "2026-08-29",
          startedAt: timestamp,
          completedAt: "2026-09-01T08:00:30.000Z",
          status: "failed",
          failureCode: "RAW_PROVIDER_FAILURE",
          failureMessage: "connection string leaked",
        },
      },
    };
    const overlongReportMessage = {
      ...initialResponse(),
      report: {
        ...initialResponse().report,
        message: "x".repeat(501),
      },
    };

    for (const candidate of [
      rawAtRoot,
      rawInCheck,
      childFailureText,
      overlongReportMessage,
      {
        ...initialResponse(),
        run: { ...completedRun(), id: "r".repeat(101) },
      },
    ])
      expect(
        growthMonthlyReviewResponseSchema.safeParse(candidate).success,
      ).toBe(false);
  });
});
