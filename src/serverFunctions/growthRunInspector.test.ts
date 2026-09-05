import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";

type Handler = (input: {
  data: unknown;
  context: { projectId: string; userId: string };
}) => Promise<unknown>;
type Registration = { middleware: unknown[]; handler: Handler | null };
const registrations = vi.hoisted(() => [] as Registration[]);
const inspector = vi.hoisted(() => ({ getRunInspector: vi.fn() }));
const observations = vi.hoisted(() => ({ appendObservation: vi.fn() }));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const registration: Registration = { middleware: [], handler: null };
    registrations.push(registration);
    return {
      middleware: (value: unknown) => {
        registration.middleware.push(value);
        return {
          validator: (_schema: z.ZodType) => ({
            handler: (handler: Handler) => {
              registration.handler = handler;
              return handler;
            },
          }),
        };
      },
    };
  },
}));
vi.mock("./middleware", () => ({
  requireProjectContext: ["project middleware"],
}));
vi.mock("@/server/features/growth/services/GrowthRunInspectorService", () => ({
  GrowthRunInspectorService: inspector,
}));
vi.mock(
  "@/server/features/growth/services/GrowthMonthlyCycleOperatorObservationsService",
  () => ({ GrowthMonthlyCycleOperatorObservationsService: observations }),
);

import {
  appendGrowthMonthlyCycleOperatorObservation,
  getGrowthRunInspector,
} from "./growthRunInspector";

describe("Growth run inspector server functions", () => {
  it("uses the authorized project for the read", async () => {
    inspector.getRunInspector.mockResolvedValue({ runs: [] });
    expect(getGrowthRunInspector).toBeTypeOf("function");
    await registrations[0].handler!({
      data: { projectId: "forged" },
      context: { projectId: "authorized", userId: "user" },
    });
    expect(registrations[0].middleware).toEqual([["project middleware"]]);
    expect(inspector.getRunInspector).toHaveBeenCalledWith("authorized");
  });

  it("uses middleware project and actor for an append", async () => {
    observations.appendObservation.mockResolvedValue({ id: "observation_1" });
    expect(appendGrowthMonthlyCycleOperatorObservation).toBeTypeOf("function");
    await registrations[1].handler!({
      data: {
        runId: "run_1",
        requestKey: "11111111-1111-4111-8111-111111111111",
        preparation: "none",
        failure: "none_observed",
        duplicateSpam: "not_observed",
        note: null,
        projectId: "forged",
        actorId: "forged",
      },
      context: { projectId: "authorized", userId: "user_authorized" },
    });
    expect(registrations[1].middleware).toEqual([["project middleware"]]);
    expect(observations.appendObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "authorized",
        actorId: "user_authorized",
        runId: "run_1",
      }),
    );
  });
});
