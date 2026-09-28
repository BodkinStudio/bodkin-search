import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";

const registration = vi.hoisted(() => ({
  middleware: [] as unknown[],
  methods: [] as string[],
  handler: null as
    | null
    | ((input: {
        data: unknown;
        context: { projectId: string };
      }) => Promise<unknown>),
}));
const service = vi.hoisted(() => ({ listOpportunities: vi.fn() }));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: (options: { method: string }) => {
    registration.methods.push(options.method);
    return {
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
    };
  },
}));
vi.mock("./middleware", () => ({
  requireProjectContext: ["project middleware"],
}));
vi.mock("@/server/features/growth/services/GrowthOpportunitiesService", () => ({
  GrowthOpportunitiesService: service,
}));

import { getGrowthOpportunities } from "./growthOpportunities";

describe("Growth opportunities server function", () => {
  it("uses project context rather than the submitted route echo", async () => {
    service.listOpportunities.mockResolvedValue({ recommendations: [] });
    expect(getGrowthOpportunities).toBeTypeOf("function");
    await registration.handler!({
      data: { projectId: "project_forged" },
      context: { projectId: "project_authorized" },
    });
    expect(registration.middleware).toEqual([["project middleware"]]);
    expect(registration.methods).toEqual(["POST"]);
    expect(service.listOpportunities).toHaveBeenCalledWith(
      "project_authorized",
    );
  });
});
