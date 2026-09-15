import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/lib/errors";
import { createGrowthPlanActionInputSchema } from "@/types/schemas/growth-plan";

const repository = vi.hoisted(() => ({
  projectDomain: vi.fn(),
  listWorkstreams: vi.fn(),
  listPlanActions: vi.fn(),
  listActionTargets: vi.fn(),
  listActionEvidence: vi.fn(),
  listEvidenceSeries: vi.fn(),
  listEvidencePoints: vi.fn(),
  getWorkstream: vi.fn(),
  getWorkstreamByCreationKey: vi.fn(),
  insertWorkstream: vi.fn(),
  updateWorkstream: vi.fn(),
  countWorkstreamActions: vi.fn(),
  deleteWorkstream: vi.fn(),
  reorderWorkstreams: vi.fn(),
  getAction: vi.fn(),
  getActionByCreationKey: vi.fn(),
  createPlanActionGraph: vi.fn(),
  updatePlanAction: vi.fn(),
  insertEvidence: vi.fn(),
  deleteEvidence: vi.fn(),
}));

const actions = vi.hoisted(() => ({ transitionAction: vi.fn() }));
const projectContext = vi.hoisted(() => ({ getProjectContext: vi.fn() }));

vi.mock(
  "@/server/features/project-context/services/ProjectContextService",
  () => ({
    ProjectContextService: {
      getProjectContext: projectContext.getProjectContext,
    },
  }),
);

vi.mock("../repositories/GrowthPlanRepository", () => ({
  GrowthPlanRepository: repository,
}));
vi.mock("./GrowthActionsService", () => ({
  GrowthActionsService: { transitionAction: actions.transitionAction },
}));

import { GrowthPlanService } from "./GrowthPlanService";

const workstream = {
  id: "ws_1",
  projectId: "project_1",
  creationKey: null,
  position: 1,
  title: "Win Teams comparison searches",
  commercialReason: "These searches are how buyers shortlist us.",
  status: "active" as const,
  targetLabel: null,
  targetBaseline: null,
  targetValue: null,
  targetDueOn: null,
  updatedBy: "user" as const,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

const createInput = createGrowthPlanActionInputSchema.parse({
  projectId: "project_1",
  requestKey: "11111111-1111-4111-8111-111111111111",
  workstreamId: "ws_1",
  title: "Rewrite the Teams comparison page",
  rationale: "Buyers land here and leave without seeing the pricing proof.",
  dueOn: "2026-10-01",
});

const savedAction = {
  id: "action_1",
  title: createInput.title,
  description: createInput.rationale,
  status: "approved",
  stateVersion: 0,
  rationale: createInput.rationale,
  successMeasure: null,
  dueAt: "2026-10-01T00:00:00.000Z",
  recommendationId: null,
  workstreamPosition: 1,
  createdAt: "2026-09-02T00:00:00.000Z",
  updatedAt: "2026-09-02T00:00:00.000Z",
};

const evidenceInput = {
  kind: "measured" as const,
  statement: "Clicks rose from 10 to 14 across January and February.",
  sourceLabel: "Search Console",
};

beforeEach(() => {
  repository.projectDomain.mockResolvedValue("example.com");
  projectContext.getProjectContext.mockResolvedValue({ customSections: [] });
  repository.listWorkstreams.mockResolvedValue([]);
  repository.listPlanActions.mockResolvedValue([]);
  repository.getWorkstream.mockResolvedValue(workstream);
  repository.getActionByCreationKey.mockResolvedValue(null);
  repository.listActionTargets.mockResolvedValue([]);
  repository.listActionEvidence.mockResolvedValue([]);
  repository.listEvidenceSeries.mockResolvedValue([]);
  repository.listEvidencePoints.mockResolvedValue([]);
});

describe("GrowthPlanService.createPlanAction", () => {
  it("writes a Workstream-owned Action without reading any Recommendation", async () => {
    // The write is what makes the Action readable back under its creation key.
    repository.createPlanActionGraph.mockImplementation(
      ({ factHash }: { factHash: string }) => {
        repository.getActionByCreationKey.mockResolvedValue({
          id: "action_1",
          factHash,
        });
        repository.getAction.mockResolvedValue({
          id: "action_1",
          title: createInput.title,
          description: createInput.rationale,
          status: "approved",
          stateVersion: 0,
          rationale: createInput.rationale,
          successMeasure: null,
          dueAt: "2026-10-01T00:00:00.000Z",
          recommendationId: null,
          workstreamPosition: 1,
          createdAt: "2026-09-02T00:00:00.000Z",
          updatedAt: "2026-09-02T00:00:00.000Z",
        });
        return Promise.resolve();
      },
    );

    const action = await GrowthPlanService.createPlanAction({
      ...createInput,
      actorType: "user",
      actorId: "user_1",
    });

    expect(repository.createPlanActionGraph).toHaveBeenCalledWith(
      expect.objectContaining({
        workstreamId: "ws_1",
        creationKey: createInput.requestKey,
        rationale: createInput.rationale,
        dueAt: "2026-10-01T00:00:00.000Z",
      }),
    );
    expect(action.isPlanAction).toBe(true);
  });

  it("creates a keyword-only Action for a project with no domain set", async () => {
    repository.projectDomain.mockResolvedValue(null);
    repository.createPlanActionGraph.mockImplementation(
      ({ factHash }: { factHash: string }) => {
        repository.getActionByCreationKey.mockResolvedValue({
          id: "action_1",
          factHash,
        });
        return Promise.resolve();
      },
    );
    repository.getAction.mockResolvedValue({
      id: "action_1",
      title: createInput.title,
      description: createInput.rationale,
      status: "approved",
      stateVersion: 0,
      rationale: createInput.rationale,
      successMeasure: null,
      dueAt: "2026-10-01T00:00:00.000Z",
      recommendationId: null,
      workstreamPosition: 1,
      createdAt: "2026-09-02T00:00:00.000Z",
      updatedAt: "2026-09-02T00:00:00.000Z",
    });

    await GrowthPlanService.createPlanAction({
      ...createInput,
      targets: [{ targetType: "keyword", targetValue: "  Teams Comparison " }],
      actorType: "user",
      actorId: "user_1",
    });

    expect(repository.createPlanActionGraph).toHaveBeenCalledWith(
      expect.objectContaining({
        targets: [{ targetType: "keyword", targetValue: "teams comparison" }],
      }),
    );
  });

  it("writes a monthly series in point order and rejects a bad month label", async () => {
    const series = {
      kind: "monthly" as const,
      title: "Clicks on the Teams page",
      unit: "clicks",
      points: [
        { label: "2026-01", value: 10 },
        { label: "2026-02", value: 14 },
      ],
    };
    repository.createPlanActionGraph.mockImplementation(
      ({ factHash }: { factHash: string }) => {
        repository.getActionByCreationKey.mockResolvedValue({
          id: "action_1",
          factHash,
        });
        return Promise.resolve();
      },
    );
    repository.getAction.mockResolvedValue({ ...savedAction });

    await GrowthPlanService.createPlanAction({
      ...createInput,
      evidence: [{ ...evidenceInput, series }],
      actorType: "user",
      actorId: "user_1",
    });

    expect(repository.createPlanActionGraph.mock.lastCall?.[0]).toMatchObject({
      evidence: [
        {
          series: {
            kind: "monthly",
            title: series.title,
            unit: series.unit,
            points: [
              { label: "2026-01", value: 10 },
              { label: "2026-02", value: 14 },
            ],
          },
        },
      ],
    });

    await expect(
      GrowthPlanService.createPlanAction({
        ...createInput,
        evidence: [
          {
            ...evidenceInput,
            series: { ...series, points: [{ label: "Jan", value: 1 }] },
          },
        ],
        actorType: "user",
        actorId: "user_1",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    await expect(
      GrowthPlanService.createPlanAction({
        ...createInput,
        evidence: [
          {
            ...evidenceInput,
            series: {
              ...series,
              points: [
                { label: "2026-02", value: 14 },
                { label: "2026-01", value: 10 },
              ],
            },
          },
        ],
        actorType: "user",
        actorId: "user_1",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("replays addActionEvidence under the same request key with the same ids", async () => {
    const input = {
      projectId: "project_1",
      requestKey: "33333333-3333-4333-8333-333333333333",
      actionId: "action_1",
      evidence: {
        ...evidenceInput,
        series: {
          kind: "monthly" as const,
          title: "Clicks",
          unit: "clicks",
          points: [{ label: "2026-01", value: 10 }],
        },
      },
      actorType: "user" as const,
      actorId: "user_1",
    };
    repository.getAction.mockResolvedValue({ ...savedAction });

    await GrowthPlanService.addActionEvidence(input);
    await GrowthPlanService.addActionEvidence(input);

    // Same evidence id both times, so the writer derives the same series and
    // point ids and the replay is a pure no-op.
    const [first, second] = repository.insertEvidence.mock.calls;
    expect(first?.[0]).toEqual(second?.[0]);
    expect(first?.[0]).toMatchObject({ id: input.requestKey });
  });

  it("conflicts when the creation key already carries a different fact", async () => {
    repository.getActionByCreationKey.mockResolvedValue({
      id: "action_1",
      factHash: "a-different-fact",
    });

    await expect(
      GrowthPlanService.createPlanAction({
        ...createInput,
        actorType: "user",
        actorId: "user_1",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(repository.createPlanActionGraph).not.toHaveBeenCalled();
  });
});

describe("GrowthPlanService.deleteWorkstream", () => {
  it("refuses while Actions still reference the Workstream", async () => {
    repository.countWorkstreamActions.mockResolvedValue(2);

    await expect(
      GrowthPlanService.deleteWorkstream({
        projectId: "project_1",
        workstreamId: "ws_1",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(repository.deleteWorkstream).not.toHaveBeenCalled();
  });
});

describe("GrowthPlanService.reorderWorkstreams", () => {
  it("rejects an order that does not list every Workstream", async () => {
    repository.listWorkstreams.mockResolvedValue([
      workstream,
      { ...workstream, id: "ws_2", position: 2 },
    ]);

    await expect(
      GrowthPlanService.reorderWorkstreams({
        projectId: "project_1",
        orderedWorkstreamIds: ["ws_1"],
        actorType: "user",
        actorId: "user_1",
      }),
    ).rejects.toBeInstanceOf(AppError);
    expect(repository.reorderWorkstreams).not.toHaveBeenCalled();
  });
});

describe("GrowthPlanService.createWorkstream", () => {
  it("replays the same request key and conflicts on a different fact", async () => {
    const request = {
      projectId: "project_1",
      requestKey: "22222222-2222-4222-8222-222222222222",
      title: workstream.title,
      commercialReason: workstream.commercialReason,
      actorType: "user" as const,
      actorId: "user_1",
    };
    repository.getWorkstreamByCreationKey.mockResolvedValue({
      ...workstream,
      creationKey: request.requestKey,
    });

    expect((await GrowthPlanService.createWorkstream(request)).id).toBe("ws_1");
    await expect(
      GrowthPlanService.createWorkstream({
        ...request,
        title: "Something else",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("GrowthPlanService.transitionPlanAction", () => {
  it("moves a plan Action from approved to ready", async () => {
    const action = {
      id: "action_1",
      title: "Rewrite the Teams comparison page",
      description: createInput.rationale,
      status: "ready",
      stateVersion: 1,
      rationale: createInput.rationale,
      successMeasure: null,
      dueAt: "2026-10-01T00:00:00.000Z",
      recommendationId: null,
      workstreamPosition: 1,
      createdAt: "2026-09-02T00:00:00.000Z",
      updatedAt: "2026-09-03T00:00:00.000Z",
    };
    repository.getAction.mockResolvedValue(action);

    const result = await GrowthPlanService.transitionPlanAction({
      projectId: "project_1",
      actionId: "action_1",
      expectedStatus: "approved",
      expectedVersion: 0,
      status: "ready",
      actorType: "user",
      actorId: "user_1",
    });

    expect(actions.transitionAction).toHaveBeenCalledWith(
      expect.objectContaining({ actionId: "action_1", status: "ready" }),
    );
    expect(result).toMatchObject({ status: "ready", isPlanAction: true });
  });
});

describe("GrowthPlanService.getPlan", () => {
  it("reads the thesis and lede from the project's custom sections", async () => {
    projectContext.getProjectContext.mockResolvedValue({
      customSections: [
        { slug: "growth-plan-thesis", content: "Win the comparison searches." },
        { slug: "unrelated-note", content: "Ignore me." },
      ],
    });

    const plan = await GrowthPlanService.getPlan("project_1");

    expect(plan).toMatchObject({
      thesis: "Win the comparison searches.",
      lede: null,
    });
  });
});
