import type { WorkflowStep } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runScheduledMonthlyReview: vi.fn(),
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
vi.mock("@/server/features/growth/services/GrowthMonthlyReviewService", () => ({
  GrowthMonthlyReviewService: {
    runScheduledMonthlyReview: mocks.runScheduledMonthlyReview,
  },
}));
vi.mock("./pgStep", () => ({ pgStep: mocks.pgStep }));

import { GrowthMonthlyReviewWorkflow } from "./GrowthMonthlyReviewWorkflow";

const payload = {
  projectId: "project_1",
  cadenceSlot: "monthly-review:scheduled:2026-08-01:2026-08-31",
  periodStart: "2026-08-01",
  periodEnd: "2026-08-31",
  reportTimezone: "Europe/London",
  scheduledAt: "2026-09-01T00:00:00.000Z",
  settingsRevision: 1,
};

describe("GrowthMonthlyReviewWorkflow", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.runScheduledMonthlyReview.mockResolvedValue({ replayed: false });
  });

  it("runs the frozen payload in a retryable Postgres-scoped step", async () => {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the mocked base class does not inspect Worker constructor context
    const context = {} as ExecutionContext;
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the Workflow under test does not read env directly
    const env = {} as Env;
    const workflow = new GrowthMonthlyReviewWorkflow(context, env);
    await workflow.run(
      { instanceId: "workflow_1", timestamp: new Date(), payload },
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- pgStep is mocked and does not inspect the opaque WorkflowStep
      {} as WorkflowStep,
    );

    expect(mocks.pgStep).toHaveBeenCalledWith(
      expect.anything(),
      "run-monthly-review",
      {
        retries: { limit: 2, delay: "30 seconds" },
        timeout: "15 minutes",
      },
      expect.any(Function),
    );
    expect(mocks.runScheduledMonthlyReview).toHaveBeenCalledWith(payload);
  });
});
