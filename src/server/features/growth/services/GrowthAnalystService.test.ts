import { beforeEach, describe, expect, it, vi } from "vitest";
import { GrowthAnalystRepository } from "../repositories/GrowthAnalystRepository";
import { GrowthInvestigationsService } from "./GrowthInvestigationsService";
import { GrowthPlanService } from "./GrowthPlanService";
import { AppError } from "@/server/lib/errors";
import { generateGrowthAiBrief } from "./GrowthAiBriefService";
import { GrowthAnalystService } from "./GrowthAnalystService";

vi.mock("../repositories/GrowthAnalystRepository", () => ({
  GrowthAnalystRepository: {
    signalFamilies: vi.fn(),
    lastWatchAt: vi.fn(),
    activeMeasurements: vi.fn(),
    briefedSignalIds: vi.fn(),
    autoBriefSettings: vi.fn(),
  },
}));
vi.mock("./GrowthAiBriefService", () => ({ generateGrowthAiBrief: vi.fn() }));
// Only the fields the service reads; the real DTOs are much larger.
const { listOpportunities, getInvestigation } = vi.hoisted(() => ({
  listOpportunities: vi.fn<() => Promise<unknown>>(),
  getInvestigation: vi.fn<() => Promise<unknown>>(),
}));
vi.mock("./GrowthOpportunitiesService", () => ({
  GrowthOpportunitiesService: { listOpportunities },
}));
vi.mock("./GrowthInvestigationsService", () => ({
  GrowthInvestigationsService: {
    getInvestigation,
    reviewInvestigation: vi.fn(),
  },
}));
vi.mock("./GrowthPlanService", () => ({
  GrowthPlanService: { createPlanAction: vi.fn() },
}));

const row = (entityRef: string, before: number, after: number) => ({
  runId: "run_1",
  signalType: "striking_distance_query",
  entityRef,
  metric: "gsc_average_position",
  before,
  after,
});

beforeEach(() => {
  listOpportunities.mockResolvedValue({
    recommendations: [{ reviewSource: { signalId: "sig_1" } }],
  });
  vi.mocked(GrowthAnalystRepository.signalFamilies).mockResolvedValue({
    heads: [
      {
        id: "sig_1",
        runId: "run_1",
        signalType: "striking_distance_query",
        entityRef: "web chat",
        periodEnd: "2026-09-20",
      },
    ],
    rows: [row("web chat", 5, 9), row("sms api", 3, 4)],
  });
  vi.mocked(GrowthAnalystRepository.activeMeasurements).mockResolvedValue([]);
  vi.mocked(GrowthAnalystRepository.lastWatchAt).mockResolvedValue(null);
  vi.mocked(GrowthAnalystRepository.briefedSignalIds).mockResolvedValue(
    new Set(),
  );
  vi.mocked(GrowthAnalystRepository.autoBriefSettings).mockResolvedValue({
    organizationId: "org_1",
    enabled: true,
  });
  getInvestigation.mockResolvedValue({
    relationship: "controller",
    reviewVersion: 3,
  });
});

describe("GrowthAnalystService", () => {
  it("reads a finding from its own query's metrics, not a neighbour's in the same run", async () => {
    const digest = await GrowthAnalystService.getDigest("project_1");
    expect(digest.findings[0]?.headline).toMatch(/position 5\.0 to 9\.0/);
  });

  it("closes a finding as planned once it is added to the plan", async () => {
    await GrowthAnalystService.addFindingToPlan({
      projectId: "project_1",
      signalId: "sig_1",
      workstreamId: "ws_1",
      dueOn: "2026-10-31",
      actorId: "user_1",
    });
    expect(GrowthPlanService.createPlanAction).toHaveBeenCalledWith(
      expect.objectContaining({
        workstreamId: "ws_1",
        targets: [{ targetType: "keyword", targetValue: "web chat" }],
      }),
    );
    expect(
      GrowthInvestigationsService.reviewInvestigation,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedVersion: 3,
        decision: "dismiss",
        dismissalReason: "already_planned",
      }),
    );
  });

  it("drafts no briefs for a project that switched them off", async () => {
    vi.mocked(GrowthAnalystRepository.autoBriefSettings).mockResolvedValue({
      organizationId: "org_1",
      enabled: false,
    });
    await GrowthAnalystService.briefTopFindings({ projectId: "project_1" });
    expect(generateGrowthAiBrief).not.toHaveBeenCalled();
  });

  it("stops briefing once the organisation is out of credits", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.mocked(GrowthAnalystRepository.signalFamilies).mockResolvedValue({
      heads: ["sig_1", "sig_2"].map((id) => ({
        id,
        runId: "run_1",
        signalType: "striking_distance_query",
        entityRef: id,
        periodEnd: "2026-09-20",
      })),
      rows: [],
    });
    vi.mocked(generateGrowthAiBrief).mockRejectedValue(
      new AppError("INSUFFICIENT_CREDITS"),
    );
    await GrowthAnalystService.briefTopFindings({ projectId: "project_1" });
    expect(generateGrowthAiBrief).toHaveBeenCalledTimes(1);
  });
});
