import { describe, expect, it } from "vitest";
import {
  getGrowthWorkChangesSchema,
  getGrowthWorkHistorySchema,
  getGrowthWorkMeasurementSchema,
  linkGrowthWorkChangeSchema,
  startGrowthWorkMeasurementSchema,
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

  it.each([
    ["approved", 0],
    ["ready", 1],
  ] as const)(
    "accepts direct Done from %s",
    (expectedStatus, expectedVersion) => {
      expect(
        updateGrowthWorkStatusSchema.parse({
          ...input,
          expectedStatus,
          expectedVersion,
          status: "implemented",
        }),
      ).toMatchObject({
        expectedStatus,
        expectedVersion,
        status: "implemented",
      });
    },
  );

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

  it("accepts only strict scoped inputs for related manual changes", () => {
    const scoped = { projectId: "project_1", actionId: "action_1" };
    expect(getGrowthWorkChangesSchema.parse(scoped)).toEqual(scoped);
    expect(
      linkGrowthWorkChangeSchema.parse({
        ...scoped,
        changeEventId: "change_1",
      }),
    ).toMatchObject({ changeEventId: "change_1" });
    expect(() =>
      linkGrowthWorkChangeSchema.parse({
        ...scoped,
        changeEventId: "change_1",
        actorId: "forged",
      }),
    ).toThrow();
  });

  it("accepts only strict scoped measurement reads and starts", () => {
    const scoped = { projectId: "project_1", actionId: "action_1" };
    expect(getGrowthWorkMeasurementSchema.parse(scoped)).toEqual(scoped);
    expect(
      startGrowthWorkMeasurementSchema.parse({
        ...scoped,
        expectedActionVersion: 3,
        implementationChangeEventId: "change_1",
      }),
    ).toMatchObject({
      expectedActionVersion: 3,
      implementationChangeEventId: "change_1",
    });
    expect(() =>
      startGrowthWorkMeasurementSchema.parse({
        ...scoped,
        expectedActionVersion: 0,
        implementationChangeEventId: "change_1",
      }),
    ).toThrow();
    expect(() =>
      startGrowthWorkMeasurementSchema.parse({
        ...scoped,
        expectedActionVersion: 3,
        implementationChangeEventId: "change_1",
        actorId: "forged",
      }),
    ).toThrow();
  });
});
