/* eslint-disable max-lines -- creation invariants share one in-memory repository harness */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGrowthActionSchema } from "@/types/schemas/growth-actions";

const repository = vi.hoisted(() => ({
  getAction: vi.fn(),
  getActionByKey: vi.fn(),
  getActionGraph: vi.fn(),
  getActionEvent: vi.fn(),
  getRecommendationSource: vi.fn(),
  listRecommendationTargets: vi.fn(),
  projectDomain: vi.fn(),
  createActionGraph: vi.fn(),
  approveActionGraph: vi.fn(),
  transitionAction: vi.fn(),
}));

vi.mock("../repositories/GrowthActionsRepository", () => ({
  GrowthActionsRepository: repository,
}));

import { GrowthActionsService } from "./GrowthActionsService";

const input = createGrowthActionSchema.parse({
  projectId: "project_1",
  recommendationId: "recommendation_1",
  creationKey: "repair-pricing-page",
  title: "Repair pricing visibility",
  description: "Rewrite the page around the strongest commercial intent.",
  dueAt: "2026-10-01T13:00:00+01:00",
  targets: [
    { type: "url", value: "https://WWW.Example.com/Pricing/?utm=one#top" },
    { type: "keyword", value: " High   Intent " },
    { type: "site", value: "shop.example.com/ignored" },
    { type: "url", value: "example.com/Pricing/" },
  ],
  actorType: "user",
  actorId: "user_1",
  note: "Approved in planning",
});

const source = {
  id: "recommendation_1",
  projectId: "project_1",
  runId: "run_1",
  status: "accepted" as const,
  reviewVersion: 1,
  category: "content",
  priorityScore: 9.5,
};

const sourceTargets = [
  { targetType: "keyword" as const, targetValue: "high intent" },
  { targetType: "site" as const, targetValue: "shop.example.com" },
  {
    targetType: "url" as const,
    targetValue: "https://example.com/Pricing",
  },
];

type CreateWrite = {
  id: string;
  projectId: string;
  recommendationId: string;
  creationKey: string;
  factHash: string;
  title: string;
  description: string;
  dueAt: string;
  category: string;
  priorityScore: number;
  targets: typeof sourceTargets;
  eventId: string;
  eventFactHash: string;
  actorType: "user" | "agent" | "system";
  actorId: string;
  note: string | null;
};

const actionRow = (write: CreateWrite) => ({
  id: write.id,
  projectId: write.projectId,
  recommendationId: write.recommendationId,
  creationKey: write.creationKey,
  factHash: write.factHash,
  title: write.title,
  description: write.description,
  category: write.category,
  priorityScore: write.priorityScore,
  status: "approved" as const,
  stateVersion: 0,
  ownerUserId: null,
  dueAt: write.dueAt,
  approvedAt: "2026-08-29T10:00:00.000Z",
  startedAt: null,
  implementedAt: null,
  evaluatedAt: null,
  cancelledAt: null,
  createdAt: "2026-08-29T10:00:00.000Z",
  updatedAt: "2026-08-29T10:00:00.000Z",
});

const creationEvent = (write: CreateWrite) => ({
  id: write.eventId,
  projectId: write.projectId,
  actionId: write.id,
  actionVersion: 0,
  factHash: write.eventFactHash,
  eventType: "created" as const,
  actorType: write.actorType,
  actorId: write.actorId,
  fromStatus: null,
  toStatus: "approved" as const,
  note: write.note,
  createdAt: "2026-08-29T10:00:00.000Z",
});

function installCreationStore() {
  const graphs = new Map<string, ReturnType<typeof makeGraph>>();
  const writes: CreateWrite[] = [];
  function makeGraph(write: CreateWrite) {
    return {
      action: actionRow(write),
      targets: write.targets,
      creationEvent: creationEvent(write),
    };
  }
  repository.getActionByKey.mockImplementation(
    async (projectId: string, creationKey: string) =>
      graphs.get(`${projectId}:${creationKey}`)?.action ?? null,
  );
  repository.getActionGraph.mockImplementation(
    async (projectId: string, actionId: string) =>
      [...graphs.values()].find(
        ({ action }) =>
          action.projectId === projectId && action.id === actionId,
      ) ?? null,
  );
  const storeWrite = async (write: CreateWrite) => {
    writes.push(write);
    const key = `${write.projectId}:${write.creationKey}`;
    if (!graphs.has(key)) graphs.set(key, makeGraph(write));
  };
  repository.createActionGraph.mockImplementation(storeWrite);
  repository.approveActionGraph.mockImplementation(storeWrite);
  return { graphs, writes };
}

beforeEach(() => {
  vi.clearAllMocks();
  repository.projectDomain.mockResolvedValue("example.com");
  repository.getRecommendationSource.mockResolvedValue(source);
  repository.listRecommendationTargets.mockResolvedValue(sourceTargets);
});

describe("GrowthActionsService creation", () => {
  it("uses the atomic approval writer for a matching proposed review version", async () => {
    installCreationStore();
    repository.getRecommendationSource.mockResolvedValue({
      ...source,
      status: "proposed",
      reviewVersion: 2,
    });
    const graph = await GrowthActionsService.approveProposedRecommendation(
      input,
      2,
    );
    expect(graph.creationEvent).toMatchObject({ actorId: input.actorId });
    expect(repository.approveActionGraph).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedReviewVersion: 2,
        dueAt: "2026-10-01T12:00:00.000Z",
      }),
    );
    expect(repository.createActionGraph).not.toHaveBeenCalled();
  });

  it.each([
    ["query-string", "https://example.com/Pricing?plan=pro"],
    ["non-root trailing-slash", "https://example.com/Pricing/"],
  ])(
    "preserves a striking-distance %s URL from Recommendation through Action approval and replay",
    async (_identity, exactUrl) => {
      const exactTargets = [
        { targetType: "keyword" as const, targetValue: "high intent" },
        { targetType: "site" as const, targetValue: "example.com" },
        { targetType: "url" as const, targetValue: exactUrl },
      ];
      repository.getRecommendationSource.mockResolvedValue({
        ...source,
        status: "proposed",
        reviewVersion: 0,
      });
      repository.listRecommendationTargets.mockResolvedValue(exactTargets);
      const { writes } = installCreationStore();
      const exactInput = createGrowthActionSchema.parse({
        ...input,
        creationKey: `striking-${_identity}`,
        targets: [
          ...exactTargets
            .map(({ targetType, targetValue }) => ({
              type: targetType,
              value: targetValue,
            }))
            .toReversed(),
          {
            type: "url",
            value: exactUrl
              .replace("https://example.com", "http://www.example.com")
              .concat("#duplicate"),
          },
        ],
      });

      const approved = await GrowthActionsService.approveProposedRecommendation(
        exactInput,
        0,
        "key_page_identity",
      );
      expect(approved.targets).toEqual(exactTargets);
      expect(writes[0]?.targets).toEqual(exactTargets);

      repository.getRecommendationSource.mockResolvedValue({
        ...source,
        status: "accepted",
        reviewVersion: 1,
      });
      const replayed = await GrowthActionsService.createAction(
        exactInput,
        "key_page_identity",
      );
      expect(replayed).toBe(approved);
      expect(repository.approveActionGraph).toHaveBeenCalledTimes(1);
      expect(repository.createActionGraph).not.toHaveBeenCalled();
    },
  );

  it("validates striking-distance exact URL scope and normalized length before writing", async () => {
    repository.getRecommendationSource.mockResolvedValue({
      ...source,
      status: "proposed",
      reviewVersion: 0,
    });
    const overlongUrl = `example.com/${"a".repeat(1988)}`;

    await expect(
      GrowthActionsService.approveProposedRecommendation(
        {
          ...input,
          targets: [{ type: "url", value: overlongUrl }],
        },
        0,
        "key_page_identity",
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      GrowthActionsService.approveProposedRecommendation(
        {
          ...input,
          targets: [
            { type: "url", value: "https://competitor.com/Pricing/?x=1" },
          ],
        },
        0,
        "key_page_identity",
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(repository.approveActionGraph).not.toHaveBeenCalled();
  });

  it("rejects stale approval versions and accepted sources without attempting a write", async () => {
    installCreationStore();
    await expect(
      GrowthActionsService.approveProposedRecommendation(input, 0),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    repository.getRecommendationSource.mockResolvedValue({
      ...source,
      status: "proposed",
      reviewVersion: 2,
    });
    await expect(
      GrowthActionsService.approveProposedRecommendation(input, 0),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(repository.approveActionGraph).not.toHaveBeenCalled();
    expect(repository.createActionGraph).not.toHaveBeenCalled();
  });

  it("creates an approved Action from an accepted Recommendation with a canonical target subset", async () => {
    const { writes } = installCreationStore();

    const graph = await GrowthActionsService.createAction(input);

    expect(graph.action).toMatchObject({
      recommendationId: "recommendation_1",
      category: "content",
      priorityScore: 9.5,
      status: "approved",
      stateVersion: 0,
      ownerUserId: null,
      dueAt: "2026-10-01T12:00:00.000Z",
    });
    expect(graph.targets).toEqual(sourceTargets);
    expect(graph.creationEvent).toMatchObject({
      actionVersion: 0,
      eventType: "created",
      fromStatus: null,
      toStatus: "approved",
      actorType: "user",
      actorId: "user_1",
      note: "Approved in planning",
    });
    const [write] = writes;
    expect(write).toMatchObject({
      projectId: "project_1",
      runId: "run_1",
      recommendationId: "recommendation_1",
      category: "content",
      priorityScore: 9.5,
      dueAt: "2026-10-01T12:00:00.000Z",
      targets: sourceTargets,
    });
    expect(write?.factHash).toMatch(/^[a-f0-9]{64}$/);
    expect(write?.eventFactHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("deduplicates and sorts equivalent targets and due-date offsets for exact retries", async () => {
    const { graphs } = installCreationStore();
    const first = await GrowthActionsService.createAction(input);
    const retry = await GrowthActionsService.createAction({
      ...input,
      dueAt: "2026-10-01T12:00:00Z",
      targets: input.targets.toReversed(),
    });

    expect(retry).toBe(first);
    expect(graphs.size).toBe(1);
    expect(repository.createActionGraph).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["changed title", { title: "A different immutable title" }],
    ["changed due date", { dueAt: "2026-10-02T12:00:00Z" }],
    ["changed event metadata", { note: "A different approval note" }],
    [
      "changed target subset",
      { targets: [{ type: "keyword" as const, value: "high intent" }] },
    ],
  ])("rejects creation-key drift from a %s", async (_label, change) => {
    installCreationStore();
    await GrowthActionsService.createAction(input);

    await expect(
      GrowthActionsService.createAction({ ...input, ...change }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(repository.createActionGraph).toHaveBeenCalledTimes(1);
  });

  it("allows one accepted Recommendation to create multiple Actions with different keys", async () => {
    const { graphs } = installCreationStore();

    const first = await GrowthActionsService.createAction(input);
    const second = await GrowthActionsService.createAction({
      ...input,
      creationKey: "repair-pricing-proof",
      title: "Add pricing proof",
      targets: [{ type: "url", value: "example.com/Pricing" }],
    });

    expect(first.action.id).not.toBe(second.action.id);
    expect(graphs.size).toBe(2);
    expect(repository.createActionGraph).toHaveBeenCalledTimes(2);
  });

  it.each(["proposed", "dismissed", "snoozed", "merged", "superseded"])(
    "rejects a %s Recommendation source",
    async (status) => {
      repository.getRecommendationSource.mockResolvedValue({
        ...source,
        status,
      });

      await expect(
        GrowthActionsService.createAction(input),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(repository.createActionGraph).not.toHaveBeenCalled();
    },
  );

  it("hides missing and foreign Recommendation sources as NOT_FOUND", async () => {
    repository.getRecommendationSource.mockResolvedValue(null);

    await expect(
      GrowthActionsService.createAction({ ...input, projectId: "project_2" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(repository.getRecommendationSource).toHaveBeenCalledWith(
      "project_2",
      "recommendation_1",
    );
    expect(repository.createActionGraph).not.toHaveBeenCalled();
  });

  it("rejects a canonical target absent from the source Recommendation", async () => {
    await expect(
      GrowthActionsService.createAction({
        ...input,
        targets: [{ type: "keyword", value: "invented query" }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(repository.createActionGraph).not.toHaveBeenCalled();
  });

  it("rejects off-project targets before writing", async () => {
    await expect(
      GrowthActionsService.createAction({
        ...input,
        targets: [{ type: "url", value: "https://competitor.test/pricing" }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(repository.createActionGraph).not.toHaveBeenCalled();
  });

  it("verifies the complete target graph and creation-event hash on replay", async () => {
    const { graphs, writes } = installCreationStore();
    await GrowthActionsService.createAction(input);
    const [stored] = [...graphs.values()];
    if (!stored) throw new Error("Expected stored graph");
    stored.creationEvent.factHash = "f".repeat(64);

    await expect(
      GrowthActionsService.createAction(input),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    stored.creationEvent.factHash = writes[0]?.eventFactHash ?? "";
    stored.targets = stored.targets.slice(1);
    await expect(
      GrowthActionsService.createAction(input),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects invalid inherited priority before computing or writing an Action", async () => {
    repository.getRecommendationSource.mockResolvedValue({
      ...source,
      priorityScore: Number.POSITIVE_INFINITY,
    });

    await expect(
      GrowthActionsService.createAction(input),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(repository.getActionByKey).not.toHaveBeenCalled();
    expect(repository.createActionGraph).not.toHaveBeenCalled();
  });
});
