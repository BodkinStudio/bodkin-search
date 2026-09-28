import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";

const registration = vi.hoisted(() => ({
  handlers: [] as Array<
    (input: {
      data: unknown;
      context: { projectId: string; userId: string };
    }) => Promise<unknown>
  >,
}));
const service = vi.hoisted(() => ({
  getGrowthMonthlyReport: vi.fn(),
  buildGrowthMonthlyReport: vi.fn(),
  getGrowthMonthlyPublicationStatus: vi.fn(),
  publishGrowthMonthlyReport: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware: () => ({
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
    }),
  }),
}));
vi.mock("./middleware", () => ({
  requireProjectContext: ["project middleware"],
}));
vi.mock(
  "@/server/features/growth/services/GrowthMonthlyReportsService",
  () => ({
    GrowthMonthlyReportsService: service,
  }),
);

import {
  buildGrowthMonthlyReport,
  getGrowthMonthlyPublicationStatus,
  getGrowthMonthlyReport,
  publishGrowthMonthlyReport,
} from "./growthReports";
import {
  getGrowthMonthlyReportRequestSchema,
  publishGrowthMonthlyReportRequestSchema,
} from "@/types/schemas/growth-monthly-reports";

describe("monthly report server functions", () => {
  it("uses authorized project and actor rather than forged request fields", async () => {
    service.getGrowthMonthlyReport.mockResolvedValue({});
    service.buildGrowthMonthlyReport.mockResolvedValue({});
    const context = {
      projectId: "project_authorized",
      userId: "user_authorized",
    };
    const data = {
      projectId: "project_forged",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      reportTimezone: "Europe/London",
    };
    expect(getGrowthMonthlyReport).toBeTypeOf("function");
    expect(buildGrowthMonthlyReport).toBeTypeOf("function");
    await registration.handlers[0]?.({ data, context });
    await registration.handlers[1]?.({ data, context });
    expect(service.getGrowthMonthlyReport).toHaveBeenCalledWith(
      "project_authorized",
      data,
    );
    expect(service.buildGrowthMonthlyReport).toHaveBeenCalledWith(
      "project_authorized",
      "user_authorized",
      data,
    );
  });

  it.each([
    { projectId: "p", periodStart: "2026-08-01" },
    { projectId: "p", periodStart: "2026-08-01", periodEnd: "2026-08-31" },
    { projectId: "p", periodStart: "2026-08-01", reportTimezone: "UTC" },
  ])("rejects partial echoed recovery fields", async (data) => {
    expect(() => getGrowthMonthlyReportRequestSchema.parse(data)).toThrow();
  });

  it("uses the authorized project and actor for exact publication", async () => {
    const context = {
      projectId: "project_authorized",
      userId: "user_authorized",
    };
    const data = {
      projectId: "project_forged",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      reportTimezone: "Europe/London",
      version: 1,
    };
    await registration.handlers[2]?.({ data, context });
    await registration.handlers[3]?.({ data, context });
    expect(service.getGrowthMonthlyPublicationStatus).toHaveBeenCalledWith(
      "project_authorized",
      data,
    );
    expect(service.publishGrowthMonthlyReport).toHaveBeenCalledWith(
      "project_authorized",
      "user_authorized",
      data,
    );
    expect(getGrowthMonthlyPublicationStatus).toBeTypeOf("function");
    expect(publishGrowthMonthlyReport).toBeTypeOf("function");
  });

  it("rejects privileged publication fields before handler work", async () => {
    const input = {
      data: {
        projectId: "p",
        periodStart: "2026-08-01",
        periodEnd: "2026-08-31",
        reportTimezone: "UTC",
        version: 1 as const,
        actorId: "forged",
      },
      context: { projectId: "p", userId: "user_authorized" },
    };
    expect(() =>
      publishGrowthMonthlyReportRequestSchema.parse(input.data),
    ).toThrow();
    service.publishGrowthMonthlyReport.mockClear();
    await expect(publishGrowthMonthlyReport(input)).rejects.toThrow();
    expect(service.publishGrowthMonthlyReport).not.toHaveBeenCalled();
  });
});
