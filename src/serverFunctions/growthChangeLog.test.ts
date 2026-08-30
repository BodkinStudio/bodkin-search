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
  getGrowthChangeLog: vi.fn(),
  recordGrowthPageChange: vi.fn(),
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
vi.mock("@/server/features/growth/services/GrowthChangeLogService", () => ({
  GrowthChangeLogService: service,
}));

import * as growthChangeLogServerFunctions from "./growthChangeLog";

describe("Growth change log server functions", () => {
  it("uses the authenticated project and actor", async () => {
    expect(growthChangeLogServerFunctions.getGrowthChangeLog).toBeTypeOf(
      "function",
    );
    service.getGrowthChangeLog.mockResolvedValue({});
    service.recordGrowthPageChange.mockResolvedValue({});
    const context = {
      projectId: "project_authorized",
      userId: "user_authorized",
    };
    await registration.handlers[0]({
      data: { projectId: "project_forged" },
      context,
    });
    await registration.handlers[1]({
      data: {
        projectId: "project_forged",
        requestKey: "c6d24ae8-da66-45c3-9057-11e76520a34f",
        keyPageId: "page_1",
        happenedOn: "2026-08-29",
        changeType: "content_updated",
        description: "Updated copy",
      },
      context,
    });
    expect(service.getGrowthChangeLog).toHaveBeenCalledWith(
      "project_authorized",
    );
    expect(registration.middleware).toEqual([
      ["project middleware"],
      ["project middleware"],
    ]);
    expect(service.recordGrowthPageChange).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project_authorized",
        actorId: "user_authorized",
      }),
    );
  });
});
