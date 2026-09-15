import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRunBySlot: vi.fn(),
  claim: vi.fn(),
  listSignals: vi.fn(),
  recordMeasurementDueSignal: vi.fn(),
  complete: vi.fn(),
  completeErrors: vi.fn(),
  fail: vi.fn(),
  candidates: vi.fn(),
}));

vi.mock("../repositories/GrowthProjectSummaryRepository", () => ({
  GrowthProjectSummaryRepository: {
    listActiveMeasurementCandidates: mocks.candidates,
  },
}));
vi.mock("./GrowthRunsService", () => ({
  GrowthRunsService: {
    getRunBySlot: mocks.getRunBySlot,
    claimManualRun: mocks.claim,
    listSignals: mocks.listSignals,
    recordMeasurementDueSignal: mocks.recordMeasurementDueSignal,
    completeRun: mocks.complete,
    completeRunWithErrors: mocks.completeErrors,
    failRun: mocks.fail,
  },
}));

import { GrowthMeasurementDueCheckService } from "./GrowthMeasurementDueCheckService";

const now = new Date("2026-09-04T07:00:00.000Z");
const running = {
  id: "run_1",
  projectId: "project_1",
  runType: "measurement_review",
  trigger: "manual",
  status: "running",
  cadenceSlot: "measurement-due-check:key_1",
  periodStart: "2026-09-04",
  periodEnd: "2026-09-04",
  startedAt: now.toISOString(),
  completedAt: null,
  detectorVersion: "measurement-due-v1",
  analysisVersion: null,
  model: null,
  promptVersion: null,
  providerCostMinor: null,
  failureCode: null,
  failureMessage: null,
};
const terminal = (
  status: "completed" | "completed_with_errors" | "failed",
  failureCode: string | null = null,
) => ({
  ...running,
  status,
  completedAt: "2026-09-04T07:00:01.000Z",
  failureCode,
  failureMessage: failureCode ? "Safe message" : null,
});
function candidate(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    actionId: `action_${id}`,
    actionVersion: 1,
    reportTimezone: "UTC",
    measurementEnd: "2026-09-01",
    longMeasurementEnd: null,
    actionStatus: "measuring",
    actionStateVersion: 1,
    actionTitle: `Action ${id}`,
    ...overrides,
  };
}
const savedSignal = {
  signalType: "action_measurement_due",
  entityType: "growth_action",
  metric: "measurement_review_due",
  evidenceKind: "manual_observation",
};

describe("GrowthMeasurementDueCheckService", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getRunBySlot.mockResolvedValue(null);
    mocks.claim.mockResolvedValue({ run: running, claimed: true });
    mocks.candidates.mockResolvedValue([]);
    mocks.listSignals.mockResolvedValue([]);
    mocks.recordMeasurementDueSignal.mockResolvedValue({ id: "signal_1" });
    mocks.complete.mockResolvedValue(terminal("completed"));
    mocks.completeErrors.mockResolvedValue(
      terminal("completed_with_errors", "SAFE_PARTIAL"),
    );
    mocks.fail.mockResolvedValue(terminal("failed", "SAFE_FAILED"));
  });

  it("records source-ready due Signals and completes the bounded check", async () => {
    mocks.candidates.mockResolvedValue([candidate("due")]);
    mocks.listSignals.mockResolvedValue([savedSignal]);

    await expect(
      GrowthMeasurementDueCheckService.runCheck(
        { projectId: "project_1", requestKey: "key_1" },
        now,
      ),
    ).resolves.toMatchObject({
      replayed: false,
      dueCount: 1,
      run: { status: "completed" },
    });
    expect(mocks.claim).toHaveBeenCalledWith({
      projectId: "project_1",
      runType: "measurement_review",
      cadenceSlot: "measurement-due-check:key_1",
      periodStart: "2026-09-04",
      periodEnd: "2026-09-04",
      detectorVersion: "measurement-due-v1",
    });
    expect(mocks.candidates).toHaveBeenCalledWith("project_1", 51);
    expect(mocks.recordMeasurementDueSignal).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project_1",
        runId: "run_1",
        signalType: "action_measurement_due",
        entityRef: "action_due",
        capturedAt: now.toISOString(),
      }),
      {
        measurementPlanId: "due",
        actionId: "action_due",
        actionVersion: 1,
      },
    );
    expect(mocks.complete).toHaveBeenCalledWith({
      projectId: "project_1",
      runId: "run_1",
    });
  });

  it("replays the exact slot from saved Signals without rescanning Plans", async () => {
    mocks.getRunBySlot.mockResolvedValue(terminal("completed"));
    mocks.listSignals.mockResolvedValue([savedSignal]);

    await expect(
      GrowthMeasurementDueCheckService.runCheck(
        { projectId: "project_1", requestKey: "key_1" },
        now,
      ),
    ).resolves.toMatchObject({ replayed: true, dueCount: 1 });
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.candidates).not.toHaveBeenCalled();
    expect(mocks.recordMeasurementDueSignal).not.toHaveBeenCalled();
  });

  it("withholds all Signals when the bounded scan overflows", async () => {
    mocks.candidates.mockResolvedValue(
      Array.from({ length: 51 }, (_, index) => candidate(String(index))),
    );

    await expect(
      GrowthMeasurementDueCheckService.runCheck(
        { projectId: "project_1", requestKey: "key_1" },
        now,
      ),
    ).resolves.toMatchObject({
      replayed: false,
      dueCount: 0,
      run: { status: "completed_with_errors" },
    });
    expect(mocks.recordMeasurementDueSignal).not.toHaveBeenCalled();
    expect(mocks.completeErrors).toHaveBeenCalledWith(
      expect.objectContaining({ failureCode: "MEASUREMENT_SCAN_OVERFLOW" }),
    );
  });

  it("terminalizes the claimed Run when the active-Plan read fails", async () => {
    mocks.candidates.mockRejectedValue(new Error("RAW_DATABASE_SECRET"));

    await expect(
      GrowthMeasurementDueCheckService.runCheck(
        { projectId: "project_1", requestKey: "key_1" },
        now,
      ),
    ).resolves.toMatchObject({
      replayed: false,
      dueCount: 0,
      run: { status: "failed" },
    });
    expect(mocks.fail).toHaveBeenCalledWith({
      projectId: "project_1",
      runId: "run_1",
      failureCode: "MEASUREMENT_SCAN_FAILED",
      failureMessage: "Active Measurements could not be read.",
    });
    expect(JSON.stringify(mocks.fail.mock.calls)).not.toContain(
      "RAW_DATABASE_SECRET",
    );
  });

  it("marks inconsistent Action graphs partial without recording them", async () => {
    mocks.candidates.mockResolvedValue([
      candidate("wrong", { actionStateVersion: 2 }),
    ]);

    await GrowthMeasurementDueCheckService.runCheck(
      { projectId: "project_1", requestKey: "key_1" },
      now,
    );
    expect(mocks.recordMeasurementDueSignal).not.toHaveBeenCalled();
    expect(mocks.completeErrors).toHaveBeenCalledWith(
      expect.objectContaining({ failureCode: "INCONSISTENT_MEASUREMENTS" }),
    );
  });

  it("fails closed when saved Measurement windows are invalid", async () => {
    mocks.candidates.mockResolvedValue([
      candidate("bad", { longMeasurementEnd: "2026-08-31" }),
    ]);

    await GrowthMeasurementDueCheckService.runCheck(
      { projectId: "project_1", requestKey: "key_1" },
      now,
    );
    expect(mocks.recordMeasurementDueSignal).not.toHaveBeenCalled();
    expect(mocks.fail).toHaveBeenCalledWith(
      expect.objectContaining({ failureCode: "MEASUREMENT_EVIDENCE_INVALID" }),
    );
  });

  it("marks a candidate partial when its Action changes before persistence", async () => {
    mocks.candidates.mockResolvedValue([candidate("changed")]);
    mocks.recordMeasurementDueSignal.mockResolvedValue(null);

    await GrowthMeasurementDueCheckService.runCheck(
      { projectId: "project_1", requestKey: "key_1" },
      now,
    );
    expect(mocks.completeErrors).toHaveBeenCalledWith(
      expect.objectContaining({ failureCode: "INCONSISTENT_MEASUREMENTS" }),
    );
    expect(mocks.complete).not.toHaveBeenCalled();
  });
});
