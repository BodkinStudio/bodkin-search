import { beforeEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";

const registration = vi.hoisted(() => ({
  middleware: [] as unknown[],
  handlers: [] as Array<
    (input: {
      data: unknown;
      context: { projectId: string; userId: string };
    }) => Promise<unknown>
  >,
  callers: [] as Array<
    (input: {
      data: unknown;
      context: { projectId: string; userId: string };
    }) => Promise<unknown>
  >,
}));
const service = vi.hoisted(() => ({
  updateWorkStatus: vi.fn(),
  getWorkHistory: vi.fn(),
}));
const changesService = vi.hoisted(() => ({
  getGrowthWorkChanges: vi.fn(),
  linkGrowthWorkChange: vi.fn(),
}));
const measurementService = vi.hoisted(() => ({
  getGrowthWorkMeasurement: vi.fn(),
  startGrowthWorkMeasurement: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware: (value: unknown) => {
      registration.middleware.push(value);
      return {
        validator: (schema: z.ZodType) => ({
          handler: (
            handler: (input: {
              data: unknown;
              context: { projectId: string; userId: string };
            }) => Promise<unknown>,
          ) => {
            registration.handlers.push(handler);
            const caller = async (input: {
              data: unknown;
              context: { projectId: string; userId: string };
            }) => {
              schema.parse(input.data);
              return handler(input);
            };
            registration.callers.push(caller);
            return caller;
          },
        }),
      };
    },
  }),
}));
vi.mock("./middleware", () => ({
  requireProjectContext: ["project middleware"],
}));
vi.mock(
  "@/server/features/growth/services/GrowthInvestigationsService",
  () => ({ GrowthInvestigationsService: service }),
);
vi.mock("@/server/features/growth/services/GrowthWorkChangesService", () => ({
  GrowthWorkChangesService: changesService,
}));
vi.mock(
  "@/server/features/growth/services/GrowthWorkMeasurementService",
  () => ({ GrowthWorkMeasurementService: measurementService }),
);

import {
  getGrowthWorkChanges,
  getGrowthWorkHistory,
  getGrowthWorkMeasurement,
  linkGrowthWorkChange,
  startGrowthWorkMeasurement,
  updateGrowthWorkStatus,
} from "./growthWork";

describe("Growth Work server functions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("derives project and actor identity from authorized context", async () => {
    expect(updateGrowthWorkStatus).toBeTypeOf("function");
    expect(getGrowthWorkHistory).toBeTypeOf("function");
    expect(getGrowthWorkChanges).toBeTypeOf("function");
    expect(linkGrowthWorkChange).toBeTypeOf("function");
    expect(getGrowthWorkMeasurement).toBeTypeOf("function");
    expect(startGrowthWorkMeasurement).toBeTypeOf("function");
    const context = {
      projectId: "project_authorized",
      userId: "user_authorized",
    };
    await registration.handlers[0]({
      data: {
        projectId: "project_forged",
        actionId: "action_1",
        expectedStatus: "approved",
        expectedVersion: 0,
        status: "ready",
      },
      context,
    });
    await registration.handlers[1]({
      data: { projectId: "project_forged", actionId: "action_1" },
      context,
    });
    await registration.handlers[2]({
      data: { projectId: "project_forged", actionId: "action_1" },
      context,
    });
    await registration.handlers[3]({
      data: {
        projectId: "project_forged",
        actionId: "action_1",
        changeEventId: "change_1",
      },
      context,
    });
    await registration.handlers[4]({
      data: { projectId: "project_forged", actionId: "action_1" },
      context,
    });
    await registration.handlers[5]({
      data: {
        projectId: "project_forged",
        actionId: "action_1",
        expectedActionVersion: 4,
        implementationChangeEventId: "change_1",
      },
      context,
    });
    expect(service.updateWorkStatus).toHaveBeenCalledWith({
      projectId: "project_authorized",
      actionId: "action_1",
      expectedStatus: "approved",
      expectedVersion: 0,
      status: "ready",
      actorId: "user_authorized",
    });
    expect(service.getWorkHistory).toHaveBeenCalledWith(
      "project_authorized",
      "action_1",
    );
    expect(changesService.getGrowthWorkChanges).toHaveBeenCalledWith(
      "project_authorized",
      "action_1",
    );
    expect(changesService.linkGrowthWorkChange).toHaveBeenCalledWith({
      projectId: "project_authorized",
      actionId: "action_1",
      changeEventId: "change_1",
    });
    expect(measurementService.getGrowthWorkMeasurement).toHaveBeenCalledWith(
      "project_authorized",
      "action_1",
    );
    expect(measurementService.startGrowthWorkMeasurement).toHaveBeenCalledWith({
      projectId: "project_authorized",
      actionId: "action_1",
      expectedActionVersion: 4,
      implementationChangeEventId: "change_1",
      actorId: "user_authorized",
    });
  });

  it("rejects browser-supplied measurement authority and plan fields", async () => {
    const context = {
      projectId: "project_authorized",
      userId: "user_authorized",
    };
    await expect(
      registration.callers[4]({
        data: {
          projectId: "project_forged",
          actionId: "action_1",
          actorId: "user_forged",
        },
        context,
      }),
    ).rejects.toThrow();
    for (const extra of [
      { actorId: "user_forged" },
      { domain: "attacker.example" },
      { baselineStart: "2026-01-01", measurementEnd: "2026-01-31" },
      { metrics: [] },
    ]) {
      await expect(
        registration.callers[5]({
          data: {
            projectId: "project_forged",
            actionId: "action_1",
            expectedActionVersion: 4,
            implementationChangeEventId: "change_1",
            ...extra,
          },
          context,
        }),
      ).rejects.toThrow();
    }
    expect(measurementService.getGrowthWorkMeasurement).not.toHaveBeenCalled();
    expect(measurementService.startGrowthWorkMeasurement).toHaveBeenCalledTimes(
      0,
    );
  });
});
