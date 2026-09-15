import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";

const registration = vi.hoisted(() => ({
  method: "",
  middleware: undefined as unknown,
  composer: vi.fn(() => Promise.resolve({ mode: "sample" })),
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: (options: { method: string }) => {
    registration.method = options.method;
    return {
      middleware: (middleware: unknown) => {
        registration.middleware = middleware;
        return {
          validator: (schema: z.ZodType) => ({
            handler:
              (handler: () => Promise<unknown>) =>
              async (input: { data: unknown }) => {
                schema.parse(input.data);
                return handler();
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
vi.mock("@/server/features/growth/services/GrowthPreviewService", () => ({
  buildGrowthPreview: registration.composer,
}));

import { getGrowthPreview } from "./growthPreview";
import { requireProjectContext } from "./middleware";
import { getGrowthPreviewSchema } from "@/types/schemas/growth-preview";

describe("GrowthPreview server-function registration", () => {
  it("registers the existing project authorization middleware", () => {
    expect(registration.method).toBe("POST");
    expect(registration.middleware).toBe(requireProjectContext);
  });

  it("passes no real project identity or content into sample composition", async () => {
    await getGrowthPreview({ data: { projectId: "real_project_one" } });
    await getGrowthPreview({ data: { projectId: "real_project_two" } });
    expect(registration.composer.mock.calls).toEqual([[], []]);
  });

  it.each([
    {},
    { projectId: " " },
    { projectId: "x".repeat(101) },
    { projectId: "p", content: "private" },
  ])("rejects invalid routing payload %j", (value) => {
    expect(getGrowthPreviewSchema.safeParse(value).success).toBe(false);
  });
});
