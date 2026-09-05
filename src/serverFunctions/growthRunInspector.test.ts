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
const service = vi.hoisted(() => ({ getRunInspector: vi.fn() }));

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
vi.mock("@/server/features/growth/services/GrowthRunInspectorService", () => ({
  GrowthRunInspectorService: service,
}));

import { getGrowthRunInspector } from "./growthRunInspector";

describe("Growth run inspector server function", () => {
  it("uses the authorized project instead of the submitted route echo", async () => {
    service.getRunInspector.mockResolvedValue({ runs: [] });
    expect(getGrowthRunInspector).toBeTypeOf("function");
    await registration.handler!({
      data: { projectId: "project_forged" },
      context: { projectId: "project_authorized" },
    });
    expect(registration.middleware).toEqual([["project middleware"]]);
    expect(service.getRunInspector).toHaveBeenCalledWith("project_authorized");
  });
});
