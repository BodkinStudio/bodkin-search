import { describe, expect, it } from "vitest";
import {
  getGrowthWorkHistorySchema,
  updateGrowthWorkStatusSchema,
} from "./growth-work";

const input = {
  projectId: "project_1",
  actionId: "action_1",
  expectedStatus: "approved" as const,
  expectedVersion: 0,
  status: "ready" as const,
};

describe("Growth Work schemas", () => {
  it("accepts direct transitions and trims an optional bounded note", () => {
    expect(
      updateGrowthWorkStatusSchema.parse({ ...input, note: "  Ready  " }),
    ).toMatchObject({ note: "Ready" });
    expect(updateGrowthWorkStatusSchema.parse(input)).not.toHaveProperty(
      "note",
    );
  });

  it("rejects caller actor metadata, illegal transitions and malformed notes", () => {
    expect(() =>
      updateGrowthWorkStatusSchema.parse({ ...input, actorId: "forged" }),
    ).toThrow();
    expect(() =>
      updateGrowthWorkStatusSchema.parse({ ...input, status: "measuring" }),
    ).toThrow("Growth Action transition is not allowed");
    expect(() =>
      updateGrowthWorkStatusSchema.parse({ ...input, note: "   " }),
    ).toThrow();
    expect(() =>
      updateGrowthWorkStatusSchema.parse({ ...input, note: "x".repeat(5001) }),
    ).toThrow();
  });

  it("requires a scoped action ID for history", () => {
    expect(
      getGrowthWorkHistorySchema.parse({
        projectId: input.projectId,
        actionId: input.actionId,
      }),
    ).toMatchObject({
      projectId: "project_1",
      actionId: "action_1",
    });
    expect(() =>
      getGrowthWorkHistorySchema.parse({ projectId: "project_1" }),
    ).toThrow();
  });
});
