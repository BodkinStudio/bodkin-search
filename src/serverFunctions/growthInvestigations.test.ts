import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";

const registration = vi.hoisted(() => ({
  middleware: [] as unknown[],
  handlers: [] as Array<
    (input: {
      data: unknown;
      context: { projectId: string; userId: string };
    }) => Promise<unknown>
  >,
}));
const service = vi.hoisted(() => ({
  getInvestigation: vi.fn(),
  approveInvestigation: vi.fn(),
  reviewInvestigation: vi.fn(),
  getWork: vi.fn(),
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
            return async (input: {
              data: unknown;
              context: { projectId: string; userId: string };
            }) => {
              schema.parse(input.data);
              return handler(input);
            };
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

import {
  approveGrowthInvestigation,
  getGrowthInvestigation,
  getGrowthWork,
  reviewGrowthInvestigation,
} from "./growthInvestigations";
import {
  approveGrowthInvestigationSchema,
  reviewGrowthInvestigationSchema,
} from "@/types/schemas/growth-investigations";

describe("Growth investigation server functions", () => {
  it("uses only the authorized project and user", async () => {
    expect(getGrowthInvestigation).toBeTypeOf("function");
    expect(approveGrowthInvestigation).toBeTypeOf("function");
    expect(getGrowthWork).toBeTypeOf("function");
    expect(reviewGrowthInvestigation).toBeTypeOf("function");
    service.getInvestigation.mockResolvedValue(null);
    service.approveInvestigation.mockResolvedValue({ id: "action_1" });
    service.reviewInvestigation.mockResolvedValue({ status: "dismissed" });
    service.getWork.mockResolvedValue({ actions: [], limit: 50 });
    const context = {
      projectId: "project_authorized",
      userId: "user_authorized",
    };
    await registration.handlers[0]({
      data: { projectId: "project_forged", signalId: "signal_1" },
      context,
    });
    await registration.handlers[1]({
      data: {
        projectId: "project_forged",
        signalId: "signal_1",
        dueOn: "2026-09-01",
      },
      context,
    });
    await registration.handlers[2]({
      data: {
        projectId: "project_forged",
        signalId: "signal_1",
        expectedVersion: 3,
        decision: "dismiss",
        dismissalReason: "irrelevant",
      },
      context,
    });
    await registration.handlers[3]({
      data: { projectId: "project_forged" },
      context,
    });
    expect(registration.middleware).toEqual([
      ["project middleware"],
      ["project middleware"],
      ["project middleware"],
      ["project middleware"],
    ]);
    expect(service.getInvestigation).toHaveBeenCalledWith(
      "project_authorized",
      "signal_1",
    );
    expect(service.approveInvestigation).toHaveBeenCalledWith({
      projectId: "project_authorized",
      signalId: "signal_1",
      dueOn: "2026-09-01",
      actorId: "user_authorized",
    });
    expect(service.reviewInvestigation).toHaveBeenCalledWith({
      projectId: "project_authorized",
      signalId: "signal_1",
      expectedVersion: 3,
      decision: "dismiss",
      dismissalReason: "irrelevant",
    });
    expect(service.getWork).toHaveBeenCalledWith("project_authorized");
  });

  it("rejects malformed calendar due dates", async () => {
    expect(() =>
      approveGrowthInvestigationSchema.parse({
        projectId: "project_1",
        signalId: "signal_1",
        dueOn: "2026-02-30",
      }),
    ).toThrow("valid calendar date");
  });

  it("rejects arbitrary review states and unknown review fields", () => {
    for (const value of [
      {
        projectId: "project_1",
        signalId: "signal_1",
        expectedVersion: 0,
        decision: "review_now",
        status: "accepted",
      },
      {
        projectId: "project_1",
        signalId: "signal_1",
        expectedVersion: 0,
        decision: "snooze",
        snoozeUntil: "2026-02-30",
      },
    ]) {
      expect(() => reviewGrowthInvestigationSchema.parse(value)).toThrow();
    }
  });
});
