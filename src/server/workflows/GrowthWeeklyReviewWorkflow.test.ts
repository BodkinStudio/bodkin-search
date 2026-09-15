import type { WorkflowStep } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runScheduledWeeklyReview: vi.fn(),
  pgStep: vi.fn(
    async (
      _step: WorkflowStep,
      _name: string,
      _config: unknown,
      fn: () => Promise<unknown>,
    ) => fn(),
  ),
}));

vi.mock("cloudflare:workers", () => ({ WorkflowEntrypoint: vi.fn() }));
vi.mock("@/db", () => ({ withPgClient: (fn: () => unknown) => fn() }));
vi.mock("@/server/features/growth/services/GrowthWeeklyReviewService", () => ({
  GrowthWeeklyReviewService: {
    runScheduledWeeklyReview: mocks.runScheduledWeeklyReview,
  },
}));
vi.mock("./pgStep", () => ({ pgStep: mocks.pgStep }));

import { GrowthWeeklyReviewWorkflow } from "./GrowthWeeklyReviewWorkflow";

const payload = {
  projectId: "project_1",
  cadenceSlot: "weekly-review:scheduled:2026-08-31:2026-09-06",
  periodStart: "2026-08-31",
  periodEnd: "2026-09-06",
  reportTimezone: "UTC",
  scheduledAt: "2026-09-07T00:00:00.000Z",
  settingsRevision: 3,
};

describe("GrowthWeeklyReviewWorkflow", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.runScheduledWeeklyReview.mockResolvedValue({ replayed: false });
  });

  it("runs the strict payload in a retryable Postgres-scoped step", async () => {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- mocked base class does not inspect constructor context
    const context = {} as ExecutionContext;
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the Workflow does not read env directly
    const env = {} as Env;
    const workflow = new GrowthWeeklyReviewWorkflow(context, env);
    await workflow.run(
      { instanceId: "workflow_1", timestamp: new Date(), payload },
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- pgStep is mocked
      {} as WorkflowStep,
    );
    expect(mocks.pgStep).toHaveBeenCalledWith(
      expect.anything(),
      "run-weekly-review",
      {
        retries: { limit: 2, delay: "30 seconds" },
        timeout: "5 minutes",
      },
      expect.any(Function),
    );
    expect(mocks.runScheduledWeeklyReview).toHaveBeenCalledWith(payload);
  });
});
