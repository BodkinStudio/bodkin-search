import { describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  projectExists: vi.fn(),
  getRun: vi.fn(),
  getRunBySlot: vi.fn(),
  listRuns: vi.fn(),
  listRecentRuns: vi.fn(),
  tryCreateManualRun: vi.fn(),
  tryCreateScheduledRun: vi.fn(),
  transitionRunningRun: vi.fn(),
  getSignal: vi.fn(),
  listSignals: vi.fn(),
  tryRecordSignalWhileRunIsRunning: vi.fn(),
  tryRecordMeasurementDueSignalWhileEligible: vi.fn(),
}));

vi.mock("../repositories/GrowthRunsRepository", () => ({
  GrowthRunsRepository: repository,
}));

import { GrowthRunsService } from "./GrowthRunsService";

const creation = {
  projectId: "project_1",
  runType: "daily_monitor" as const,
  cadenceSlot: "2026-08-29",
  periodStart: "2026-08-01",
  periodEnd: "2026-08-29",
  detectorVersion: "v1",
};

const runningRun = {
  id: "run_1",
  ...creation,
  trigger: "manual" as const,
  status: "running" as const,
  startedAt: "2026-08-29T10:00:00.000Z",
  completedAt: null,
  analysisVersion: null,
  model: null,
  promptVersion: null,
  providerCostMinor: null,
  failureCode: null,
  failureMessage: null,
};

describe("GrowthRunsService", () => {
  it("returns the original manual run for an exact cadence retry", async () => {
    repository.projectExists.mockResolvedValue(true);
    repository.tryCreateManualRun.mockResolvedValue(false);
    repository.getRunBySlot.mockResolvedValue(runningRun);

    await expect(GrowthRunsService.createManualRun(creation)).resolves.toEqual(
      runningRun,
    );
  });

  it("reads one exact project, type and cadence slot without inventing absence", async () => {
    repository.getRunBySlot.mockResolvedValueOnce(runningRun);
    await expect(
      GrowthRunsService.getRunBySlot(
        "project_1",
        "daily_monitor",
        "2026-08-29",
      ),
    ).resolves.toEqual(runningRun);
    expect(repository.getRunBySlot).toHaveBeenCalledWith(
      "project_1",
      "daily_monitor",
      "2026-08-29",
    );

    repository.getRunBySlot.mockResolvedValueOnce(null);
    await expect(
      GrowthRunsService.getRunBySlot(
        "project_2",
        "monthly_review",
        "monthly-review:retry_1",
      ),
    ).resolves.toBeNull();
  });

  it("replays a claimed request identity without recollecting across a later date boundary", async () => {
    repository.projectExists.mockResolvedValue(true);
    repository.tryCreateManualRun.mockResolvedValue(false);
    repository.getRunBySlot.mockResolvedValue(runningRun);

    await expect(
      GrowthRunsService.claimManualRun({
        ...creation,
        periodStart: "2026-08-02",
        periodEnd: "2026-08-30",
      }),
    ).resolves.toEqual({ run: runningRun, claimed: false });
  });

  it("claims a scheduled identity only while its settings version remains eligible", async () => {
    repository.projectExists.mockResolvedValue(true);
    repository.tryCreateScheduledRun.mockResolvedValue(true);
    repository.getRunBySlot.mockResolvedValue({
      ...runningRun,
      trigger: "scheduled",
    });

    await expect(
      GrowthRunsService.claimScheduledRun({
        ...creation,
        settingsRevision: 1,
        reportCadence: "monthly",
      }),
    ).resolves.toMatchObject({ claimed: true });
    expect(repository.tryCreateScheduledRun).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "project_1" }),
      expect.any(String),
      1,
      "monthly",
    );

    repository.tryCreateScheduledRun.mockResolvedValue(false);
    repository.getRunBySlot.mockResolvedValue(null);
    await expect(
      GrowthRunsService.claimScheduledRun({
        ...creation,
        settingsRevision: 2,
        reportCadence: "monthly",
      }),
    ).resolves.toEqual({ run: null, claimed: false });
  });

  it("rejects immutable cadence-slot drift", async () => {
    repository.projectExists.mockResolvedValue(true);
    repository.tryCreateManualRun.mockResolvedValue(false);
    repository.getRunBySlot.mockResolvedValue(runningRun);

    await expect(
      GrowthRunsService.createManualRun({ ...creation, detectorVersion: "v2" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("returns NOT_FOUND for a foreign or missing terminal transition", async () => {
    repository.transitionRunningRun.mockResolvedValue(null);
    repository.getRun.mockResolvedValue(null);

    await expect(
      GrowthRunsService.completeRun({ projectId: "project_2", runId: "run_1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("persists exact terminal outcomes, including zero cost and bounded failures", async () => {
    repository.transitionRunningRun
      .mockResolvedValueOnce({
        ...runningRun,
        status: "completed",
        completedAt: "2026-08-29T10:01:00.000Z",
        providerCostMinor: 0,
      })
      .mockResolvedValueOnce({
        ...runningRun,
        status: "completed_with_errors",
        completedAt: "2026-08-29T10:02:00.000Z",
        failureCode: "provider_partial",
        failureMessage: "One source was unavailable",
      })
      .mockResolvedValueOnce({
        ...runningRun,
        status: "failed",
        completedAt: "2026-08-29T10:03:00.000Z",
        failureCode: "provider_failed",
        failureMessage: "All sources were unavailable",
      });

    await expect(
      GrowthRunsService.completeRun({
        projectId: "project_1",
        runId: "run_1",
        providerCostMinor: 0,
      }),
    ).resolves.toMatchObject({ status: "completed", providerCostMinor: 0 });
    expect(repository.transitionRunningRun).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ status: "completed", providerCostMinor: 0 }),
    );

    const partial = {
      projectId: "project_1",
      runId: "run_1",
      failureCode: "provider_partial",
      failureMessage: "One source was unavailable",
    };
    await expect(
      GrowthRunsService.completeRunWithErrors(partial),
    ).resolves.toMatchObject({
      status: "completed_with_errors",
      failureCode: "provider_partial",
    });
    expect(repository.transitionRunningRun).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ status: "completed_with_errors", ...partial }),
    );

    const failure = {
      projectId: "project_1",
      runId: "run_1",
      failureCode: "provider_failed",
      failureMessage: "All sources were unavailable",
    };
    await expect(GrowthRunsService.failRun(failure)).resolves.toMatchObject({
      status: "failed",
      failureCode: "provider_failed",
    });
    expect(repository.transitionRunningRun).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ status: "failed", ...failure }),
    );
  });

  it("returns CONFLICT when another terminal transition wins the race", async () => {
    repository.transitionRunningRun.mockResolvedValue(null);
    repository.getRun.mockResolvedValue({
      ...runningRun,
      status: "completed",
      completedAt: "2026-08-29T10:01:00.000Z",
    });

    await expect(
      GrowthRunsService.completeRun({ projectId: "project_1", runId: "run_1" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("scopes run and Signal reads and hides foreign runs as NOT_FOUND", async () => {
    repository.getRun.mockResolvedValue(null);
    await expect(
      GrowthRunsService.getRun("project_2", "run_1"),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      GrowthRunsService.listSignals("project_2", "run_1"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    repository.getRun.mockResolvedValue(runningRun);
    repository.listSignals.mockResolvedValue([
      { id: "signal_1", runId: "run_1" },
    ]);
    repository.listRuns.mockResolvedValue([runningRun]);
    await expect(
      GrowthRunsService.listSignals("project_1", "run_1"),
    ).resolves.toEqual([{ id: "signal_1", runId: "run_1" }]);
    await expect(GrowthRunsService.listRuns("project_1")).resolves.toEqual([
      runningRun,
    ]);
  });

  it("makes exact Signals idempotent and fact drift a conflict", async () => {
    const signal = {
      projectId: "project_1",
      runId: "run_1",
      signalType: "page_clicks_down",
      entityType: "page",
      entityRef: "https://example.test/pricing",
      metric: "clicks",
      severity: "warning" as const,
      confidence: 0.8,
      periodStart: "2026-08-01",
      periodEnd: "2026-08-29",
      baselineValue: 20,
      currentValue: 10,
      deltaValue: -10,
      deltaPercent: -50,
      evidenceKind: "gsc_period" as const,
      evidenceRef: "gsc:august",
      capturedAt: "2026-08-29T10:00:00.000Z",
    };
    repository.getSignal.mockResolvedValue({ id: "signal_1", ...signal });
    await expect(GrowthRunsService.recordSignal(signal)).resolves.toMatchObject(
      signal,
    );
    repository.getSignal.mockResolvedValue({
      id: "signal_1",
      ...signal,
      currentValue: 11,
    });
    await expect(GrowthRunsService.recordSignal(signal)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("uses unambiguous semantic coordinates for Signal identity", async () => {
    const first = {
      projectId: "project_1",
      runId: "run_1",
      signalType: "page_clicks_down",
      entityType: "page",
      entityRef: "a|b",
      metric: "c",
      severity: "warning" as const,
      confidence: 0.8,
      periodStart: "2026-08-01",
      periodEnd: "2026-08-29",
      baselineValue: 20,
      currentValue: 10,
      deltaValue: -10,
      deltaPercent: null,
      evidenceKind: "manual_observation" as const,
      evidenceRef: "one",
      capturedAt: "2026-08-29T10:00:00.000Z",
    };
    const second = {
      ...first,
      entityRef: "a",
      metric: "b|c",
      evidenceRef: "two",
    };
    const ids: string[] = [];
    repository.tryRecordSignalWhileRunIsRunning.mockImplementation(
      async (_input: unknown, id: string) => ids.push(id),
    );
    repository.getSignal.mockResolvedValue({ id: "signal_1", ...first });
    await GrowthRunsService.recordSignal(first);
    repository.getSignal.mockResolvedValue({ id: "signal_2", ...second });
    await GrowthRunsService.recordSignal(second);
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it("returns null when write-time Measurement eligibility no longer matches", async () => {
    const signal = {
      projectId: "project_1",
      runId: "run_1",
      signalType: "action_measurement_due",
      entityType: "growth_action",
      entityRef: "action_1",
      metric: "measurement_review_due",
      severity: "info" as const,
      confidence: 1,
      periodStart: "2026-09-01",
      periodEnd: "2026-09-01",
      baselineValue: 0,
      currentValue: 1,
      deltaValue: 1,
      deltaPercent: null,
      evidenceKind: "manual_observation" as const,
      evidenceRef: "manual_observation:v1:measurement_due:plan_1:1:2026-09-04",
      capturedAt: "2026-09-04T07:00:00.000Z",
    };
    repository.getSignal.mockResolvedValue(null);
    repository.getRun.mockResolvedValue(runningRun);

    await expect(
      GrowthRunsService.recordMeasurementDueSignal(signal, {
        measurementPlanId: "plan_1",
        actionId: "action_1",
        actionVersion: 1,
      }),
    ).resolves.toBeNull();
    expect(
      repository.tryRecordMeasurementDueSignalWhileEligible,
    ).toHaveBeenCalledWith(signal, expect.any(String), {
      measurementPlanId: "plan_1",
      actionId: "action_1",
      actionVersion: 1,
    });
  });
});
