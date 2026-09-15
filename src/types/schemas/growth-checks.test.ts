import { describe, expect, it } from "vitest";
import {
  getGrowthCheckEvidenceSchema,
  runGrowthCheckSchema,
} from "./growth-checks";

describe("Growth check request schemas", () => {
  it("accepts bounded retry identities and rejects untrusted fields", () => {
    expect(
      runGrowthCheckSchema.safeParse({
        projectId: "project_1",
        requestKey: "retry_123",
      }).success,
    ).toBe(true);
    expect(
      runGrowthCheckSchema.safeParse({
        projectId: "project_1",
        requestKey: "retry key",
      }).success,
    ).toBe(false);
    expect(
      getGrowthCheckEvidenceSchema.safeParse({
        projectId: "project_1",
        signalId: "signal_1",
        organizationId: "foreign",
      }).success,
    ).toBe(false);
  });
});
