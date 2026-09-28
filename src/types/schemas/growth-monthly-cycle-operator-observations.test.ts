import { describe, expect, it } from "vitest";
import {
  appendGrowthMonthlyCycleOperatorObservationSchema,
  growthMonthlyCycleOperatorObservationDtoSchema,
} from "./growth-monthly-cycle-operator-observations";

const request = {
  runId: "monthly_run_1",
  requestKey: "11111111-1111-4111-8111-111111111111",
  preparation: "minor",
  failure: "explained",
  duplicateSpam: "not_observed",
  note: "Operator checked the saved inputs.",
} as const;

describe("monthly-cycle operator-observation schemas", () => {
  it("accepts and trims the bounded strict request", () => {
    expect(
      appendGrowthMonthlyCycleOperatorObservationSchema.parse({
        ...request,
        note: "  Operator checked the saved inputs.  ",
      }),
    ).toEqual(request);
  });

  it("rejects forged identities, invalid observations and unbounded notes", () => {
    expect(
      appendGrowthMonthlyCycleOperatorObservationSchema.safeParse({
        ...request,
        projectId: "forged",
        actorId: "forged",
      }).success,
    ).toBe(false);
    expect(
      appendGrowthMonthlyCycleOperatorObservationSchema.safeParse({
        ...request,
        preparation: "acceptable",
      }).success,
    ).toBe(false);
    expect(
      appendGrowthMonthlyCycleOperatorObservationSchema.safeParse({
        ...request,
        note: "x".repeat(2001),
      }).success,
    ).toBe(false);
    expect(
      appendGrowthMonthlyCycleOperatorObservationSchema.safeParse({
        ...request,
        note: "   ",
      }).success,
    ).toBe(false);
  });

  it("requires a strict saved response with an offset timestamp", () => {
    const response = {
      id: "observation_1",
      runId: request.runId,
      preparation: request.preparation,
      failure: request.failure,
      duplicateSpam: request.duplicateSpam,
      note: request.note,
      createdAt: "2026-09-05T12:00:00.000Z",
    };
    expect(
      growthMonthlyCycleOperatorObservationDtoSchema.parse(response),
    ).toEqual(response);
    expect(
      growthMonthlyCycleOperatorObservationDtoSchema.safeParse({
        ...response,
        reviewerId: "secret-user-id",
      }).success,
    ).toBe(false);
  });
});
