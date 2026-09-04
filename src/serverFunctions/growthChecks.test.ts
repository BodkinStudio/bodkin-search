import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";

const registration = vi.hoisted(() => ({
  middleware: [] as unknown[],
  handlers: [] as Array<
    (input: {
      data: unknown;
      context: { projectId: string; organizationId: string };
    }) => Promise<unknown>
  >,
}));
const service = vi.hoisted(() => ({
  getOverview: vi.fn(),
  runCheck: vi.fn(),
  getRunDetail: vi.fn(),
  getEvidence: vi.fn(),
}));
const strikingService = vi.hoisted(() => ({ runCheck: vi.fn() }));
const lowCtrService = vi.hoisted(() => ({ runCheck: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware: (value: unknown) => {
      registration.middleware.push(value);
      return {
        validator: (schema: z.ZodType) => ({
          handler:
            (
              handler: (input: {
                data: unknown;
                context: { projectId: string; organizationId: string };
              }) => Promise<unknown>,
            ) =>
            async (input: {
              data: unknown;
              context: { projectId: string; organizationId: string };
            }) => {
              schema.parse(input.data);
              registration.handlers.push(handler);
              return handler(input);
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
  "@/server/features/growth/services/GrowthPriorityPageCheckService",
  () => ({ GrowthPriorityPageCheckService: service }),
);
vi.mock("@/server/features/growth/services/GrowthLowCtrCheckService", () => ({
  GrowthLowCtrCheckService: lowCtrService,
}));
vi.mock(
  "@/server/features/growth/services/GrowthStrikingDistanceCheckService",
  () => ({ GrowthStrikingDistanceCheckService: strikingService }),
);

import {
  getGrowthCheckEvidence,
  getGrowthCheckRun,
  getGrowthChecksOverview,
  runGrowthCheck,
  runGrowthStrikingDistanceCheck,
  runGrowthLowCtrCheck,
} from "./growthChecks";

describe("Growth checks server functions", () => {
  it("uses authorized project and organization scope instead of client fields", async () => {
    service.getOverview.mockResolvedValue({});
    service.runCheck.mockResolvedValue({});
    service.getRunDetail.mockResolvedValue({});
    service.getEvidence.mockResolvedValue({});
    strikingService.runCheck.mockResolvedValue({});
    lowCtrService.runCheck.mockResolvedValue({});
    const context = {
      projectId: "project_authorized",
      organizationId: "organization_authorized",
    };
    const overviewRequest = {
      data: { projectId: "project_client" },
      context,
    };
    const checkRequest = {
      data: { projectId: "project_client", requestKey: "retry_1" },
      context,
    };
    const runRequest = {
      data: { projectId: "project_client", runId: "run_1" },
      context,
    };
    const evidenceRequest = {
      data: { projectId: "project_client", signalId: "signal_1" },
      context,
    };
    await getGrowthChecksOverview(overviewRequest);
    await runGrowthCheck(checkRequest);
    await runGrowthStrikingDistanceCheck(checkRequest);
    await runGrowthLowCtrCheck(checkRequest);
    await getGrowthCheckRun(runRequest);
    await getGrowthCheckEvidence(evidenceRequest);
    expect(service.getOverview).toHaveBeenCalledWith("project_authorized");
    expect(service.runCheck).toHaveBeenCalledWith({
      projectId: "project_authorized",
      requestKey: "retry_1",
    });
    expect(strikingService.runCheck).toHaveBeenCalledWith({
      projectId: "project_authorized",
      requestKey: "retry_1",
    });
    expect(lowCtrService.runCheck).toHaveBeenCalledWith({
      projectId: "project_authorized",
      requestKey: "retry_1",
    });
    expect(service.getRunDetail).toHaveBeenCalledWith(
      "project_authorized",
      "run_1",
    );
    expect(service.getEvidence).toHaveBeenCalledWith({
      projectId: "project_authorized",
      organizationId: "organization_authorized",
      signalId: "signal_1",
    });
  });
});
