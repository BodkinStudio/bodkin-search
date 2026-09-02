import { beforeEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";

type TestServerFunctionInput = {
  data: unknown;
  context: { projectId: string; userId: string };
};

const registration = vi.hoisted(() => ({
  middleware: [] as unknown[],
  invokers: [] as Array<(input: TestServerFunctionInput) => Promise<unknown>>,
}));
const service = vi.hoisted(() => ({
  runMonthlyReview: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware: (middleware: unknown) => {
      registration.middleware.push(middleware);
      return {
        validator: (schema: z.ZodType) => ({
          handler: (
            handler: (input: TestServerFunctionInput) => Promise<unknown>,
          ) => {
            const invoke = async (input: TestServerFunctionInput) => {
              const data = schema.parse(input.data);
              return handler({ ...input, data });
            };
            registration.invokers.push(invoke);
            return invoke;
          },
        }),
      };
    },
  }),
}));
vi.mock("./middleware", () => ({
  requireProjectContext: ["project middleware"],
}));
vi.mock("@/server/features/growth/services/GrowthMonthlyReviewService", () => ({
  GrowthMonthlyReviewService: service,
}));

import { runGrowthMonthlyReview } from "./growthMonthlyReview";

function invokeRunGrowthMonthlyReview(input: TestServerFunctionInput) {
  const invoke = registration.invokers[0];
  if (!invoke)
    throw new Error("Monthly review server function was not registered");
  return invoke(input);
}

describe("runGrowthMonthlyReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses project middleware and passes authorized project and actor", async () => {
    service.runMonthlyReview.mockResolvedValue({ replayed: true });
    const data = {
      projectId: "project_forged",
      requestKey: "monthly_2026_08",
    };

    expect(runGrowthMonthlyReview).toBeTypeOf("function");
    expect(registration.middleware).toEqual([["project middleware"]]);
    await expect(
      invokeRunGrowthMonthlyReview({
        data,
        context: {
          projectId: "project_authorized",
          userId: "user_authorized",
        },
      }),
    ).resolves.toEqual({ replayed: true });
    expect(service.runMonthlyReview).toHaveBeenCalledOnce();
    expect(service.runMonthlyReview).toHaveBeenCalledWith(
      "project_authorized",
      "user_authorized",
      data,
    );
  });

  it.each([
    {
      projectId: "project_client",
      requestKey: "monthly_2026_08",
      actorId: "forged",
    },
    { projectId: "project_client", requestKey: "month/2026" },
    { projectId: "project_client", requestKey: "r".repeat(121) },
  ])(
    "rejects invalid or privileged fields before service work",
    async (data) => {
      await expect(
        invokeRunGrowthMonthlyReview({
          data,
          context: {
            projectId: "project_authorized",
            userId: "user_authorized",
          },
        }),
      ).rejects.toThrow();
      expect(service.runMonthlyReview).not.toHaveBeenCalled();
    },
  );
});
