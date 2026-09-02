import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  listActiveMeasurementCandidates: vi.fn(),
}));
vi.mock("../repositories/GrowthProjectSummaryRepository", () => ({
  GrowthProjectSummaryRepository: repository,
}));

import { GrowthDueMeasurementsService } from "./GrowthDueMeasurementsService";

const now = new Date("2026-09-01T00:30:00.000Z");

function candidate(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    actionId: `action_${id}`,
    actionVersion: 1,
    reportTimezone: "UTC",
    measurementEnd: "2026-08-01",
    longMeasurementEnd: null,
    actionStatus: "measuring",
    actionStateVersion: 1,
    actionTitle: `Action ${id}`,
    ...overrides,
  };
}

describe("GrowthDueMeasurementsService", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    repository.listActiveMeasurementCandidates.mockResolvedValue([]);
  });

  it("uses each Plan's frozen timezone and the next date after its inclusive final window", async () => {
    repository.listActiveMeasurementCandidates.mockResolvedValue([
      candidate("tokyo", {
        reportTimezone: "Asia/Tokyo",
        measurementEnd: "2026-08-31",
      }),
      candidate("los_angeles", {
        reportTimezone: "America/Los_Angeles",
        measurementEnd: "2026-08-31",
      }),
      candidate("long_window", {
        measurementEnd: "2026-08-01",
        longMeasurementEnd: "2026-09-01",
      }),
    ]);

    await expect(
      GrowthDueMeasurementsService.getDueMeasurements("project_1", { now }),
    ).resolves.toEqual({
      scanState: "complete",
      items: [
        expect.objectContaining({
          id: "tokyo",
          availableOn: "2026-09-01",
          reportTimezone: "Asia/Tokyo",
        }),
      ],
      hasMore: false,
    });
  });

  it("classifies integrity, orders stably, caps output and reports hidden due rows", async () => {
    repository.listActiveMeasurementCandidates.mockResolvedValue([
      candidate("z_missing", {
        actionStatus: null,
        actionStateVersion: null,
        actionTitle: null,
      }),
      candidate("b_state", { actionStatus: "ready" }),
      candidate("a_version", { actionStateVersion: 2 }),
      candidate("c_consistent"),
      candidate("later", { measurementEnd: "2026-08-31" }),
      candidate("middle", { measurementEnd: "2026-08-15" }),
    ]);

    const result = await GrowthDueMeasurementsService.getDueMeasurements(
      "project_1",
      { now: new Date("2026-09-02T00:00:00.000Z") },
    );

    expect(repository.listActiveMeasurementCandidates).toHaveBeenCalledWith(
      "project_1",
      51,
    );
    expect(result).toMatchObject({ scanState: "complete", hasMore: true });
    if (result.scanState !== "complete") throw new Error("Expected complete");
    expect(result.items.map(({ id }) => id)).toEqual([
      "a_version",
      "b_state",
      "c_consistent",
      "z_missing",
      "middle",
    ]);
    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "a_version",
          integrity: "action_version_mismatch",
        }),
        expect.objectContaining({
          id: "b_state",
          integrity: "action_state_mismatch",
        }),
        expect.objectContaining({
          id: "c_consistent",
          integrity: "consistent",
        }),
        expect.objectContaining({
          id: "z_missing",
          integrity: "action_missing",
          actionTitle: null,
        }),
      ]),
    );
    expect(JSON.stringify(result)).not.toContain("actionVersion");
  });

  it("withholds an overflowed 51-row scan rather than returning a partial list", async () => {
    repository.listActiveMeasurementCandidates.mockResolvedValue(
      Array.from({ length: 51 }, (_, index) => candidate(String(index))),
    );

    await expect(
      GrowthDueMeasurementsService.getDueMeasurements("project_1", { now }),
    ).resolves.toEqual({
      scanState: "overflow",
      items: [],
      hasMore: true,
    });
  });

  it("fails closed on invalid clocks and frozen timezones", async () => {
    await expect(
      GrowthDueMeasurementsService.getDueMeasurements("project_1", {
        now: new Date("invalid"),
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(repository.listActiveMeasurementCandidates).not.toHaveBeenCalled();

    repository.listActiveMeasurementCandidates.mockResolvedValue([
      candidate("invalid_timezone", {
        reportTimezone: "Mars/Olympus_Mons",
      }),
    ]);
    await expect(
      GrowthDueMeasurementsService.getDueMeasurements("project_1", { now }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
