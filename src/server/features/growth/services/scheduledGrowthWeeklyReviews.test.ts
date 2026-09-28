import { beforeEach, describe, expect, it, vi } from "vitest";

const settings = vi.hoisted(() => ({
  listDueWeeklyReviews: vi.fn(),
  claimWeeklyReviewSchedule: vi.fn(),
}));
const runs = vi.hoisted(() => ({ getRunBySlot: vi.fn() }));

vi.mock("../repositories/GrowthSettingsRepository", () => ({
  GrowthSettingsRepository: settings,
}));
vi.mock("./GrowthRunsService", () => ({ GrowthRunsService: runs }));

import { runScheduledGrowthWeeklyReviews } from "./scheduledGrowthWeeklyReviews";

const create = vi.fn();
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- only the weekly Workflow binding is read
const env = { GROWTH_WEEKLY_REVIEW_WORKFLOW: { create } } as unknown as Env;
const now = new Date("2026-09-07T12:00:00.000Z");

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    projectId: "project_1",
    reportTimezone: "UTC",
    reportDay: 1,
    nextWeeklyReviewAt: "2026-09-07T00:00:00.000Z",
    settingsRevision: 3,
    ...overrides,
  };
}

describe("runScheduledGrowthWeeklyReviews", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    settings.listDueWeeklyReviews.mockResolvedValue([candidate()]);
    settings.claimWeeklyReviewSchedule.mockResolvedValue(true);
    runs.getRunBySlot.mockResolvedValue(null);
    create.mockResolvedValue({ id: "workflow_1" });
  });

  it("claims and dispatches the previous completed local week", async () => {
    const result = await runScheduledGrowthWeeklyReviews(env, now);

    expect(settings.claimWeeklyReviewSchedule).toHaveBeenCalledWith({
      projectId: "project_1",
      settingsRevision: 3,
      observedAt: "2026-09-07T00:00:00.000Z",
      nextAt: "2026-09-14T00:00:00.000Z",
    });
    expect(create).toHaveBeenCalledWith({
      // oxlint-disable-next-line typescript/no-unsafe-assignment -- Vitest matcher intentionally occupies the id
      id: expect.stringMatching(/^growth-weekly-[a-f0-9]{40}$/),
      params: {
        projectId: "project_1",
        periodStart: "2026-08-31",
        periodEnd: "2026-09-06",
        cadenceSlot: "weekly-review:scheduled:2026-08-31:2026-09-06",
        reportTimezone: "UTC",
        scheduledAt: "2026-09-07T00:00:00.000Z",
        settingsRevision: 3,
      },
    });
    expect(result).toMatchObject({ claimed: 1, started: 1, startErrors: 0 });
  });

  it("initialises a future legacy cursor without dispatching", async () => {
    settings.listDueWeeklyReviews.mockResolvedValue([
      candidate({ nextWeeklyReviewAt: null, reportDay: 3 }),
    ]);
    const result = await runScheduledGrowthWeeklyReviews(env, now);
    expect(settings.claimWeeklyReviewSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        observedAt: null,
        nextAt: "2026-09-09T00:00:00.000Z",
      }),
    );
    expect(create).not.toHaveBeenCalled();
    expect(result.initialized).toBe(1);
  });

  it("restores the cursor when Workflow creation fails", async () => {
    create.mockRejectedValue(new Error("workflow unavailable"));
    settings.claimWeeklyReviewSchedule
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true);
    const result = await runScheduledGrowthWeeklyReviews(env, now);
    expect(settings.claimWeeklyReviewSchedule).toHaveBeenNthCalledWith(2, {
      projectId: "project_1",
      settingsRevision: 3,
      observedAt: "2026-09-14T00:00:00.000Z",
      nextAt: "2026-09-07T00:00:00.000Z",
    });
    expect(result).toMatchObject({ startErrors: 1, started: 0 });
  });

  it("does not dispatch when a concurrent claim loses", async () => {
    settings.claimWeeklyReviewSchedule.mockResolvedValue(false);
    const result = await runScheduledGrowthWeeklyReviews(env, now);
    expect(create).not.toHaveBeenCalled();
    expect(result.concurrentChangeSkips).toBe(1);
  });

  it("does not redispatch an already recorded weekly period", async () => {
    runs.getRunBySlot.mockResolvedValue({ id: "existing" });
    const result = await runScheduledGrowthWeeklyReviews(env, now);
    expect(create).not.toHaveBeenCalled();
    expect(result.alreadyRecorded).toBe(1);
  });

  it("caps one tick at fifty projects and reports overflow", async () => {
    settings.listDueWeeklyReviews.mockResolvedValue(
      Array.from({ length: 51 }, (_, index) =>
        candidate({ projectId: `project_${String(index).padStart(2, "0")}` }),
      ),
    );
    const result = await runScheduledGrowthWeeklyReviews(env, now);
    expect(create).toHaveBeenCalledTimes(50);
    expect(result).toMatchObject({ overflow: true, limit: 50, started: 50 });
  });
});
