import { beforeEach, describe, expect, it, vi } from "vitest";

const work = vi.hoisted(() => ({ getQualifiedWork: vi.fn() }));
const repository = vi.hoisted(() => ({
  getMeasurementPlanByAction: vi.fn(),
}));
const measurements = vi.hoisted(() => ({
  getMeasurement: vi.fn(),
  recordObservations: vi.fn(),
}));
const source = vi.hoisted(() => ({ collect: vi.fn() }));

vi.mock("./GrowthInvestigationsService", () => work);
vi.mock("../repositories/GrowthMeasurementsRepository", () => ({
  GrowthMeasurementsRepository: repository,
}));
vi.mock("./GrowthMeasurementsService", () => ({
  GrowthMeasurementsService: measurements,
}));
vi.mock("./GrowthSearchPerformanceAdapter", () => ({
  collectFrozenGrowthSearchPerformance: source.collect,
  GROWTH_SEARCH_PERFORMANCE_MAX_PAGE_REQUESTS: 25,
}));

import { sha256Hex } from "@/server/lib/audit/ids";
import { collectGrowthWorkMeasurementEvidence } from "./GrowthWorkMeasurementCollectionService";

const projectId = "project_1";
const actionId = "action_1";
const plan = {
  id: "plan_1",
  projectId,
  actionId,
  status: "active" as const,
  actionVersion: 3,
  baselineStart: "2026-05-01",
  baselineEnd: "2026-05-01",
  measurementStart: "2026-05-03",
  measurementEnd: "2026-05-03",
  longMeasurementEnd: null,
};
const metrics = [
  {
    id: "metric_clicks",
    metricType: "search_clicks" as const,
    entityType: "url" as const,
    entityKey: "https://example.test/pricing",
  },
  {
    id: "metric_impressions",
    metricType: "search_impressions" as const,
    entityType: "url" as const,
    entityKey: "https://example.test/pricing",
  },
];

function graph(observations: Array<Record<string, unknown>> = []) {
  return { plan, metrics, observations };
}

function snapshot(
  startDate: string,
  endDate: string,
  property = "sc-domain:example.test",
) {
  return {
    projectId,
    property,
    capturedAt: "2026-05-06T12:00:00.000Z",
    sourceWindow: { startDate, endDate },
    retrievalStatus: "exhausted" as const,
    requestsUsed: 1,
    observations: [
      {
        rawUrl: "https://example.test/pricing",
        date: startDate,
        clicks: startDate === "2026-05-01" ? 10 : 12,
        impressions: startDate === "2026-05-01" ? 100 : 130,
      },
    ],
  };
}

const input = {
  projectId,
  actionId,
  expectedActionVersion: 3,
};

describe("collectGrowthWorkMeasurementEvidence", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    work.getQualifiedWork.mockResolvedValue({
      id: actionId,
      status: "measuring",
      stateVersion: 3,
    });
    repository.getMeasurementPlanByAction.mockResolvedValue(plan);
    measurements.getMeasurement.mockResolvedValue(graph());
    measurements.recordObservations.mockResolvedValue([]);
    source.collect.mockImplementation(
      ({ startDate, endDate }: { startDate: string; endDate: string }) =>
        snapshot(startDate, endDate),
    );
  });

  it("collects every mature missing period before one atomic fact write", async () => {
    await collectGrowthWorkMeasurementEvidence(input, {
      now: new Date("2026-05-06T12:00:00.000Z"),
    });

    expect(source.collect).toHaveBeenCalledTimes(2);
    expect(source.collect).toHaveBeenNthCalledWith(1, {
      projectId,
      startDate: "2026-05-01",
      endDate: "2026-05-01",
      capturedAt: "2026-05-06T12:00:00.000Z",
      targetUrls: ["https://example.test/pricing"],
      maxPageRequests: 25,
    });
    expect(source.collect).toHaveBeenNthCalledWith(2, {
      projectId,
      startDate: "2026-05-03",
      endDate: "2026-05-03",
      capturedAt: "2026-05-06T12:00:00.000Z",
      targetUrls: ["https://example.test/pricing"],
      maxPageRequests: 24,
    });
    expect(measurements.recordObservations).toHaveBeenCalledOnce();
    const facts: unknown = measurements.recordObservations.mock.calls[0]?.[0];
    expect(facts).toHaveLength(4);
    expect(facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          projectId,
          measurementPlanId: plan.id,
          metricId: "metric_clicks",
          periodType: "baseline",
          value: 10,
          completeness: 1,
          evidenceKind: "gsc_period",
        }),
        expect.objectContaining({
          metricId: "metric_impressions",
          periodType: "measurement",
          value: 130,
        }),
      ]),
    );
  });

  it("does not read the provider before a period reaches the source lag", async () => {
    await expect(
      collectGrowthWorkMeasurementEvidence(input, {
        now: new Date("2026-05-03T12:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(source.collect).not.toHaveBeenCalled();
    expect(measurements.recordObservations).not.toHaveBeenCalled();
  });

  it("stops before a later ready period when the attempt-wide request allowance is exhausted", async () => {
    source.collect.mockImplementationOnce(
      ({ startDate, endDate }: { startDate: string; endDate: string }) => ({
        ...snapshot(startDate, endDate),
        requestsUsed: 25,
      }),
    );

    await expect(
      collectGrowthWorkMeasurementEvidence(input, {
        now: new Date("2026-05-06T12:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(source.collect).toHaveBeenCalledOnce();
    expect(measurements.recordObservations).not.toHaveBeenCalled();
  });

  it("rejects partial saved periods and incomplete provider rows without writing", async () => {
    measurements.getMeasurement.mockResolvedValueOnce(
      graph([
        {
          metricId: "metric_clicks",
          periodType: "baseline",
          completeness: 1,
          evidenceKind: "gsc_period",
          evidenceRef: `gsc:measurement:v1:${"a".repeat(64)}:${"b".repeat(64)}`,
        },
      ]),
    );
    await expect(
      collectGrowthWorkMeasurementEvidence(input, {
        now: new Date("2026-05-06T12:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(source.collect).not.toHaveBeenCalled();

    measurements.getMeasurement.mockResolvedValue(graph());
    source.collect.mockResolvedValueOnce({
      ...snapshot("2026-05-01", "2026-05-01"),
      observations: [],
    });
    await expect(
      collectGrowthWorkMeasurementEvidence(input, {
        now: new Date("2026-05-06T12:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(measurements.recordObservations).not.toHaveBeenCalled();
  });

  it("continues only with the same hashed Search Console property", async () => {
    const propertyHash = await sha256Hex("sc-domain:example.test");
    measurements.getMeasurement.mockResolvedValue(
      graph(
        metrics.map((metric) => ({
          metricId: metric.id,
          periodType: "baseline",
          completeness: 1,
          evidenceKind: "gsc_period",
          evidenceRef: `gsc:measurement:v1:${propertyHash}:${"b".repeat(64)}`,
        })),
      ),
    );
    source.collect.mockImplementation(
      ({ startDate, endDate }: { startDate: string; endDate: string }) =>
        snapshot(startDate, endDate, "sc-domain:other.test"),
    );

    await expect(
      collectGrowthWorkMeasurementEvidence(input, {
        now: new Date("2026-05-06T12:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(source.collect).toHaveBeenCalledOnce();
    expect(measurements.recordObservations).not.toHaveBeenCalled();
  });

  it("treats a fully collected plan as an idempotent no-op", async () => {
    const propertyHash = await sha256Hex("sc-domain:example.test");
    measurements.getMeasurement.mockResolvedValue(
      graph(
        ["baseline", "measurement"].flatMap((periodType) =>
          metrics.map((metric) => ({
            metricId: metric.id,
            periodType,
            completeness: 1,
            evidenceKind: "gsc_period",
            evidenceRef: `gsc:measurement:v1:${propertyHash}:${"b".repeat(64)}`,
          })),
        ),
      ),
    );

    await expect(
      collectGrowthWorkMeasurementEvidence(input, {
        now: new Date("2026-05-06T12:00:00.000Z"),
      }),
    ).resolves.toMatchObject({ plan: { id: plan.id } });
    expect(source.collect).not.toHaveBeenCalled();
    expect(measurements.recordObservations).not.toHaveBeenCalled();
  });

  it("rejects mixed provenance within a stored period before provider access", async () => {
    const propertyHash = await sha256Hex("sc-domain:example.test");
    measurements.getMeasurement.mockResolvedValue(
      graph(
        metrics.map((metric, index) => ({
          metricId: metric.id,
          periodType: "baseline",
          completeness: 1,
          capturedAt: `2026-05-06T12:00:0${index}.000Z`,
          evidenceKind: "gsc_period",
          evidenceRef: `gsc:measurement:v1:${propertyHash}:${(index === 0
            ? "b"
            : "c"
          ).repeat(64)}`,
        })),
      ),
    );

    await expect(
      collectGrowthWorkMeasurementEvidence(input, {
        now: new Date("2026-05-06T12:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(source.collect).not.toHaveBeenCalled();
    expect(measurements.recordObservations).not.toHaveBeenCalled();
  });

  it("rejects stale Work and unsupported metrics before provider access", async () => {
    work.getQualifiedWork.mockResolvedValueOnce({
      id: actionId,
      status: "evaluated",
      stateVersion: 4,
    });
    await expect(
      collectGrowthWorkMeasurementEvidence(input),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    work.getQualifiedWork.mockResolvedValue({
      id: actionId,
      status: "measuring",
      stateVersion: 3,
    });
    measurements.getMeasurement.mockResolvedValue({
      ...graph(),
      metrics: [
        {
          ...metrics[0],
          metricType: "organic_sessions",
        },
      ],
    });
    await expect(
      collectGrowthWorkMeasurementEvidence(input),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(source.collect).not.toHaveBeenCalled();
    expect(measurements.recordObservations).not.toHaveBeenCalled();
  });
});
