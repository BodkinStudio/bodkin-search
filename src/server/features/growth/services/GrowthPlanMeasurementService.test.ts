import { beforeEach, describe, expect, it, vi } from "vitest";
import { GrowthPlanMeasurementService } from "./GrowthPlanMeasurementService";

const deps = vi.hoisted(() => ({
  getActionGraph: vi.fn(),
  getPlanByAction: vi.fn(),
  gsc: vi.fn(),
  recordManualEvent: vi.fn(),
  linkAction: vi.fn(),
  startMeasurement: vi.fn(),
}));
vi.mock("../repositories/GrowthActionsRepository", () => ({
  GrowthActionsRepository: { getActionGraph: deps.getActionGraph },
}));
vi.mock("../repositories/GrowthMeasurementsRepository", () => ({
  GrowthMeasurementsRepository: {
    getMeasurementPlanByAction: deps.getPlanByAction,
    listActivePlans: vi.fn(),
  },
}));
vi.mock("../repositories/GrowthPageMonitorRepository", () => ({
  GrowthPageMonitorRepository: { projectDomain: async () => "site.test" },
}));
vi.mock("@/server/features/gsc/repositories/GscConnectionRepository", () => ({
  GscConnectionRepository: { getByProjectId: deps.gsc },
}));
vi.mock("./GrowthChangeEventsService", () => ({
  GrowthChangeEventsService: {
    recordManualEvent: deps.recordManualEvent,
    linkAction: deps.linkAction,
  },
}));
vi.mock("./GrowthMeasurementsService", () => ({
  GrowthMeasurementsService: { startMeasurement: deps.startMeasurement },
}));
vi.mock("./GrowthSettingsService", () => ({
  GrowthSettingsService: {
    getSettings: async () => ({
      reportTimezone: "UTC",
      defaultBaselineDays: 28,
      defaultCooldownDays: 7,
      defaultPrimaryWindowDays: 28,
      defaultLongWindowDays: null,
    }),
  },
}));
vi.mock("./GrowthWorkMeasurementProjection", () => ({
  growthWorkMeasurementSchedule: () => ({
    baselineStart: "2026-08-13",
    baselineEnd: "2026-09-09",
    cooldownEnd: "2026-09-17",
    measurementStart: "2026-09-18",
    measurementEnd: "2026-10-15",
    longMeasurementEnd: null,
  }),
}));
vi.mock("./GrowthWorkMeasurementCollectionService", () => ({
  collectGrowthWorkMeasurementEvidence: vi.fn(),
}));

const shipped = (targets: { targetType: string; targetValue: string }[]) => ({
  action: {
    status: "implemented",
    stateVersion: 3,
    title: "Rewrite the Teams page",
    implementedAt: "2026-09-10T12:00:00.000Z",
  },
  targets,
});
const input = { projectId: "p", actionId: "a", actorId: "u" };

describe("measuring plan actions when they ship", () => {
  beforeEach(() => {
    deps.getPlanByAction.mockResolvedValue(null);
    deps.gsc.mockResolvedValue({ siteUrl: "https://site.test/" });
    deps.recordManualEvent.mockResolvedValue({ event: { id: "change" } });
  });

  it("starts nothing when the action names no pages", async () => {
    deps.getActionGraph.mockResolvedValue(
      shipped([{ targetType: "keyword", targetValue: "teams sms" }]),
    );
    await expect(
      GrowthPlanMeasurementService.startOnShipped(input),
    ).resolves.toEqual({ started: false, reason: "no_page_targets" });
    expect(deps.startMeasurement).not.toHaveBeenCalled();
  });

  it("logs the ship as the person's change and measures its pages from then", async () => {
    deps.getActionGraph.mockResolvedValue(
      shipped([{ targetType: "url", targetValue: "/teams" }]),
    );
    await GrowthPlanMeasurementService.startOnShipped(input);
    expect(deps.recordManualEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: "user",
        actorId: "u",
        happenedAt: "2026-09-10T12:00:00.000Z",
        urls: ["https://site.test/teams"],
      }),
    );
    expect(deps.linkAction).toHaveBeenCalledWith({
      projectId: "p",
      actionId: "a",
      changeEventId: "change",
    });
    expect(deps.startMeasurement).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedActionVersion: 3,
        implementationChangeEventId: "change",
        metrics: expect.arrayContaining([
          expect.objectContaining({
            metricType: "search_clicks",
            entityKey: "https://site.test/teams",
            isPrimary: true,
          }),
        ]),
      }),
    );
  });
});
