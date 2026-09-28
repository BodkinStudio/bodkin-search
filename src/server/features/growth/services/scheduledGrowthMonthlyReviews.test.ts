import { beforeEach, describe, expect, it, vi } from "vitest";

const settings = vi.hoisted(() => ({
  listDueMonthlyReviews: vi.fn(),
  claimMonthlyReviewSchedule: vi.fn(),
}));
const runs = vi.hoisted(() => ({ getRunBySlot: vi.fn() }));

vi.mock("../repositories/GrowthSettingsRepository", () => ({
  GrowthSettingsRepository: settings,
}));
vi.mock("./GrowthRunsService", () => ({ GrowthRunsService: runs }));

import { runScheduledGrowthMonthlyReviews } from "./scheduledGrowthMonthlyReviews";

const create = vi.fn();
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- only the scheduler binding is read by this test
const env = {
  GROWTH_MONTHLY_REVIEW_WORKFLOW: { create },
} as unknown as Env;
const now = new Date("2026-09-05T12:00:00.000Z");

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    projectId: "project_1",
    reportTimezone: "UTC",
    reportDay: 5,
    nextMonthlyReviewAt: "2026-09-05T00:00:00.000Z",
    settingsRevision: 1,
    ...overrides,
  };
}

describe("runScheduledGrowthMonthlyReviews", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    settings.listDueMonthlyReviews.mockResolvedValue([candidate()]);
    settings.claimMonthlyReviewSchedule.mockResolvedValue(true);
    runs.getRunBySlot.mockResolvedValue(null);
    create.mockResolvedValue({ id: "workflow_1" });
  });

  it("claims a due cursor and dispatches the frozen previous-month coordinate", async () => {
    const result = await runScheduledGrowthMonthlyReviews(env, now);

    expect(settings.claimMonthlyReviewSchedule).toHaveBeenCalledWith({
      projectId: "project_1",
      settingsRevision: 1,
      observedAt: "2026-09-05T00:00:00.000Z",
      nextAt: "2026-10-05T00:00:00.000Z",
    });
    expect(create).toHaveBeenCalledWith({
      // oxlint-disable-next-line typescript/no-unsafe-assignment -- Vitest's asymmetric matcher intentionally occupies this string field
      id: expect.stringMatching(/^growth-monthly-[a-f0-9]{40}$/),
      params: {
        projectId: "project_1",
        periodStart: "2026-08-01",
        periodEnd: "2026-08-31",
        cadenceSlot: "monthly-review:scheduled:2026-08-01:2026-08-31",
        reportTimezone: "UTC",
        scheduledAt: "2026-09-05T00:00:00.000Z",
        settingsRevision: 1,
      },
    });
    expect(result).toMatchObject({ claimed: 1, started: 1, startErrors: 0 });
  });

  it("initialises a legacy null cursor without dispatching before its day", async () => {
    settings.listDueMonthlyReviews.mockResolvedValue([
      candidate({ nextMonthlyReviewAt: null, reportDay: 10 }),
    ]);

    const result = await runScheduledGrowthMonthlyReviews(env, now);

    expect(settings.claimMonthlyReviewSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        observedAt: null,
        nextAt: "2026-09-10T00:00:00.000Z",
      }),
    );
    expect(create).not.toHaveBeenCalled();
    expect(result.initialized).toBe(1);
  });

  it("restores the due cursor when Workflow creation fails", async () => {
    create.mockRejectedValue(new Error("workflow unavailable"));
    settings.claimMonthlyReviewSchedule
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true);

    const result = await runScheduledGrowthMonthlyReviews(env, now);

    expect(settings.claimMonthlyReviewSchedule).toHaveBeenNthCalledWith(2, {
      projectId: "project_1",
      settingsRevision: 1,
      observedAt: "2026-10-05T00:00:00.000Z",
      nextAt: "2026-09-05T00:00:00.000Z",
    });
    expect(result).toMatchObject({ startErrors: 1, started: 0 });
  });

  it("does not dispatch after a concurrent settings change wins the CAS", async () => {
    settings.claimMonthlyReviewSchedule.mockResolvedValue(false);

    const result = await runScheduledGrowthMonthlyReviews(env, now);

    expect(create).not.toHaveBeenCalled();
    expect(result.concurrentChangeSkips).toBe(1);
  });

  it("advances but does not redispatch an already recorded period", async () => {
    runs.getRunBySlot.mockResolvedValue({ id: "terminal_run" });

    const result = await runScheduledGrowthMonthlyReviews(env, now);

    expect(create).not.toHaveBeenCalled();
    expect(result.alreadyRecorded).toBe(1);
  });

  it("caps each tick and reports overflow without consuming later rows", async () => {
    settings.listDueMonthlyReviews.mockResolvedValue(
      Array.from({ length: 51 }, (_, index) =>
        candidate({ projectId: `project_${String(index).padStart(2, "0")}` }),
      ),
    );

    const result = await runScheduledGrowthMonthlyReviews(env, now);

    expect(create).toHaveBeenCalledTimes(50);
    expect(result).toMatchObject({ overflow: true, limit: 50, started: 50 });
  });
});
