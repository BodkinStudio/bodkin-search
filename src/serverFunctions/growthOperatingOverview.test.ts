import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";

const registration = vi.hoisted(() => ({
  middleware: [] as unknown[],
  handler: null as
    | null
    | ((input: {
        data: unknown;
        context: { projectId: string };
      }) => Promise<unknown>),
}));
const service = vi.hoisted(() => ({ getOperatingOverview: vi.fn() }));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware: (value: unknown) => {
      registration.middleware.push(value);
      return {
        validator: (_schema: z.ZodType) => ({
          handler: (handler: typeof registration.handler) => {
            registration.handler = handler;
            return handler;
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
  "@/server/features/growth/services/GrowthOperatingOverviewService",
  () => ({ GrowthOperatingOverviewService: service }),
);

import { getGrowthOperatingOverview } from "./growthOperatingOverview";

describe("Growth operating overview server function", () => {
  it("uses the authorized project rather than the submitted route echo", async () => {
    service.getOperatingOverview.mockResolvedValue({ asOf: "now" });
    expect(getGrowthOperatingOverview).toBeTypeOf("function");

    await registration.handler!({
      data: { projectId: "project_forged" },
      context: { projectId: "project_authorized" },
    });

    expect(registration.middleware).toEqual([["project middleware"]]);
    expect(service.getOperatingOverview).toHaveBeenCalledWith(
      "project_authorized",
    );
  });
});
