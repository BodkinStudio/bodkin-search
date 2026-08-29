/* eslint-disable max-lines -- the complete lifecycle and replay matrix is easier to audit together */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sha256Hex } from "@/server/lib/audit/ids";
import {
  transitionGrowthActionSchema,
  type GrowthActionStatus,
  type TransitionGrowthActionInput,
} from "@/types/schemas/growth-actions";

const repository = vi.hoisted(() => ({
  getAction: vi.fn(),
  getActionByKey: vi.fn(),
  getActionGraph: vi.fn(),
  getActionEvent: vi.fn(),
  getRecommendationSource: vi.fn(),
  listRecommendationTargets: vi.fn(),
  projectDomain: vi.fn(),
  createActionGraph: vi.fn(),
  transitionAction: vi.fn(),
}));

vi.mock("../repositories/GrowthActionsRepository", () => ({
  GrowthActionsRepository: repository,
}));

import { GrowthActionsService } from "./GrowthActionsService";

type TransitionWrite = {
  projectId: string;
  actionId: string;
  expectedStatus: GrowthActionStatus;
  expectedVersion: number;
  status: GrowthActionStatus;
  eventId: string;
  eventFactHash: string;
  actorType: "user" | "agent" | "system";
  actorId: string;
  note: string | null;
};

const startedAt = "2026-08-29T11:00:00.000Z";
const implementedAt = "2026-08-30T11:00:00.000Z";
const evaluatedAt = "2026-09-30T11:00:00.000Z";
const cancelledAt = "2026-08-31T11:00:00.000Z";

function actionRow(status: GrowthActionStatus, stateVersion: number) {
  const started = [
    "in_progress",
    "blocked",
    "implemented",
    "measuring",
    "evaluated",
  ].includes(status);
  const implemented = ["implemented", "measuring", "evaluated"].includes(
    status,
  );
  return {
    id: "action_1",
    projectId: "project_1",
    recommendationId: "recommendation_1",
    creationKey: "repair-pricing",
    factHash: "a".repeat(64),
    title: "Repair pricing visibility",
    description: "Rewrite the pricing page.",
    category: "content",
    priorityScore: 9,
    status,
    stateVersion,
    ownerUserId: null,
    dueAt: "2026-10-01T00:00:00.000Z",
    approvedAt: "2026-08-29T10:00:00.000Z",
    startedAt: started ? startedAt : null,
    implementedAt: implemented ? implementedAt : null,
    evaluatedAt: status === "evaluated" ? evaluatedAt : null,
    cancelledAt: status === "cancelled" ? cancelledAt : null,
    createdAt: "2026-08-29T10:00:00.000Z",
    updatedAt: "2026-08-29T10:00:00.000Z",
  };
}

const transitionInput = (
  expectedStatus: GrowthActionStatus,
  expectedVersion: number,
  status: GrowthActionStatus,
  note: string | null = "Workflow update",
) =>
  transitionGrowthActionSchema.parse({
    projectId: "project_1",
    actionId: "action_1",
    expectedStatus,
    expectedVersion,
    status,
    actorType: "agent",
    actorId: "agent_1",
    note,
  });

const uncheckedTransitionInput = (
  expectedStatus: GrowthActionStatus,
  expectedVersion: number,
  status: GrowthActionStatus,
  note: string | null = "Workflow update",
): TransitionGrowthActionInput => ({
  projectId: "project_1",
  actionId: "action_1",
  expectedStatus,
  expectedVersion,
  status,
  actorType: "agent",
  actorId: "agent_1",
  note,
});

async function expectedEventHash(
  expectedStatus: GrowthActionStatus,
  expectedVersion: number,
  status: GrowthActionStatus,
  note: string | null = "Workflow update",
) {
  return sha256Hex(
    JSON.stringify({
      projectId: "project_1",
      actionId: "action_1",
      actionVersion: expectedVersion + 1,
      eventType: "status_changed",
      fromStatus: expectedStatus,
      toStatus: status,
      actorType: "agent",
      actorId: "agent_1",
      note,
    }),
  );
}

function eventRow(write: TransitionWrite) {
  return {
    id: write.eventId,
    projectId: write.projectId,
    actionId: write.actionId,
    actionVersion: write.expectedVersion + 1,
    factHash: write.eventFactHash,
    eventType: "status_changed" as const,
    actorType: write.actorType,
    actorId: write.actorId,
    fromStatus: write.expectedStatus,
    toStatus: write.status,
    note: write.note,
    createdAt: "2026-08-29T12:00:00.000Z",
  };
}

function installSuccessfulTransition(
  from: GrowthActionStatus,
  version: number,
  to: GrowthActionStatus,
) {
  const current = actionRow(from, version);
  const winner = {
    ...actionRow(to, version + 1),
    startedAt:
      to === "in_progress"
        ? (current.startedAt ?? startedAt)
        : current.startedAt,
    implementedAt:
      to === "implemented"
        ? (current.implementedAt ?? implementedAt)
        : current.implementedAt,
    evaluatedAt:
      to === "evaluated"
        ? (current.evaluatedAt ?? evaluatedAt)
        : current.evaluatedAt,
    cancelledAt:
      to === "cancelled"
        ? (current.cancelledAt ?? cancelledAt)
        : current.cancelledAt,
  };
  const writes: TransitionWrite[] = [];
  repository.getAction
    .mockResolvedValueOnce(current)
    .mockImplementation(async () => winner);
  repository.transitionAction.mockImplementation(
    async (value: TransitionWrite) => {
      writes.push(value);
    },
  );
  repository.getActionEvent.mockImplementation(async () =>
    writes[0] ? eventRow(writes[0]) : null,
  );
  return { current, winner, writes };
}

beforeEach(() => vi.clearAllMocks());

const legalCases = [
  ["approved", 0, "ready"],
  ["approved", 0, "cancelled"],
  ["ready", 1, "in_progress"],
  ["ready", 1, "cancelled"],
  ["in_progress", 2, "blocked"],
  ["in_progress", 2, "implemented"],
  ["in_progress", 2, "cancelled"],
  ["blocked", 3, "in_progress"],
  ["blocked", 3, "implemented"],
  ["blocked", 3, "cancelled"],
  ["implemented", 4, "measuring"],
  ["measuring", 5, "evaluated"],
] as const;

describe("GrowthActionsService lifecycle", () => {
  it.each(legalCases)(
    "atomically transitions %s to %s",
    async (from, version, to) => {
      const { winner, writes } = installSuccessfulTransition(from, version, to);
      const input = transitionInput(from, version, to);

      const result = await GrowthActionsService.transitionAction(input);

      expect(result.action).toBe(winner);
      expect(result.event).toMatchObject({
        actionVersion: version + 1,
        eventType: "status_changed",
        fromStatus: from,
        toStatus: to,
        actorType: "agent",
        actorId: "agent_1",
        note: "Workflow update",
      });
      expect(writes[0]).toMatchObject({
        projectId: "project_1",
        actionId: "action_1",
        expectedStatus: from,
        expectedVersion: version,
        status: to,
        actorType: "agent",
        actorId: "agent_1",
        note: "Workflow update",
      });
      const write = writes[0];
      expect(write?.eventId).toBeTruthy();
      expect(write?.eventFactHash).toMatch(/^[a-f0-9]{64}$/);
      expect(write).not.toHaveProperty("startedAt");
      expect(write).not.toHaveProperty("implementedAt");
      expect(write).not.toHaveProperty("evaluatedAt");
      expect(write).not.toHaveProperty("cancelledAt");
    },
  );

  it("recognizes an exact terminal replay before legality checks", async () => {
    const action = actionRow("cancelled", 1);
    const factHash = await expectedEventHash("approved", 0, "cancelled");
    const event = {
      ...eventRow({
        projectId: "project_1",
        actionId: "action_1",
        expectedStatus: "approved",
        expectedVersion: 0,
        status: "cancelled",
        eventId: "event_1",
        eventFactHash: factHash,
        actorType: "agent",
        actorId: "agent_1",
        note: "Workflow update",
      }),
    };
    repository.getAction.mockResolvedValue(action);
    repository.getActionEvent.mockResolvedValue(event);

    await expect(
      GrowthActionsService.transitionAction(
        transitionInput("approved", 0, "cancelled"),
      ),
    ).resolves.toEqual({ action, event });
    expect(repository.transitionAction).not.toHaveBeenCalled();
  });

  it("rejects an immediate replay when actor or note metadata differs", async () => {
    const action = actionRow("ready", 1);
    const persistedHash = await expectedEventHash(
      "approved",
      0,
      "ready",
      "Original note",
    );
    repository.getAction.mockResolvedValue(action);
    repository.getActionEvent.mockResolvedValue({
      ...eventRow({
        projectId: "project_1",
        actionId: "action_1",
        expectedStatus: "approved",
        expectedVersion: 0,
        status: "ready",
        eventId: "event_1",
        eventFactHash: persistedHash,
        actorType: "agent",
        actorId: "agent_1",
        note: "Original note",
      }),
    });

    await expect(
      GrowthActionsService.transitionAction(
        transitionInput("approved", 0, "ready", "Different note"),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(repository.transitionAction).not.toHaveBeenCalled();
  });

  it("rejects stale matching statuses from later blocked/resumed cycles", async () => {
    repository.getAction.mockResolvedValue(actionRow("in_progress", 6));

    await expect(
      GrowthActionsService.transitionAction(
        transitionInput("blocked", 3, "in_progress"),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(repository.getActionEvent).toHaveBeenCalledWith(
      "project_1",
      "action_1",
      4,
    );
    expect(repository.transitionAction).not.toHaveBeenCalled();
  });

  it.each([
    ["ready", 1, "blocked"],
    ["in_progress", 2, "measuring"],
    ["blocked", 3, "ready"],
    ["implemented", 4, "cancelled"],
    ["measuring", 5, "cancelled"],
    ["evaluated", 6, "cancelled"],
    ["cancelled", 1, "ready"],
  ] as const)(
    "rejects the illegal transition %s to %s",
    async (from, version, to) => {
      repository.getAction.mockResolvedValue(actionRow(from, version));

      await expect(
        GrowthActionsService.transitionAction(
          uncheckedTransitionInput(from, version, to),
        ),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(repository.transitionAction).not.toHaveBeenCalled();
    },
  );

  it("rejects a stale compare-and-set input before writing", async () => {
    repository.getAction.mockResolvedValue(actionRow("ready", 2));

    await expect(
      GrowthActionsService.transitionAction(
        transitionInput("ready", 1, "in_progress"),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(repository.transitionAction).not.toHaveBeenCalled();
  });

  it("rejects a lost compare-and-set race without accepting the other winner", async () => {
    repository.getAction
      .mockResolvedValueOnce(actionRow("approved", 0))
      .mockResolvedValueOnce(actionRow("cancelled", 1));
    repository.getActionEvent.mockResolvedValue(null);

    await expect(
      GrowthActionsService.transitionAction(
        transitionInput("approved", 0, "ready"),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(repository.transitionAction).toHaveBeenCalledTimes(1);
  });

  it("rejects a same-state/version race whose winning event metadata differs", async () => {
    repository.getAction
      .mockResolvedValueOnce(actionRow("approved", 0))
      .mockResolvedValueOnce(actionRow("ready", 1));
    repository.getActionEvent
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        ...eventRow({
          projectId: "project_1",
          actionId: "action_1",
          expectedStatus: "approved",
          expectedVersion: 0,
          status: "ready",
          eventId: "other_event",
          eventFactHash: "f".repeat(64),
          actorType: "agent",
          actorId: "other_agent",
          note: "Other winner",
        }),
      });

    await expect(
      GrowthActionsService.transitionAction(
        transitionInput("approved", 0, "ready"),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("records distinct versions through blocked/resumed cycles without replacing the first started milestone", async () => {
    const blocked = actionRow("blocked", 3);
    const resumed = { ...actionRow("in_progress", 4), startedAt };
    const blockedAgain = { ...actionRow("blocked", 5), startedAt };
    const events = new Map<number, ReturnType<typeof eventRow>>();
    repository.getAction
      .mockResolvedValueOnce(blocked)
      .mockResolvedValueOnce(resumed)
      .mockResolvedValueOnce(resumed)
      .mockResolvedValueOnce(blockedAgain);
    repository.transitionAction.mockImplementation(
      async (write: TransitionWrite) => {
        events.set(write.expectedVersion + 1, eventRow(write));
      },
    );
    repository.getActionEvent.mockImplementation(
      async (_projectId: string, _actionId: string, version: number) =>
        events.get(version) ?? null,
    );
    const first = await GrowthActionsService.transitionAction(
      transitionInput("blocked", 3, "in_progress", "Unblocked"),
    );

    const second = await GrowthActionsService.transitionAction(
      transitionInput("in_progress", 4, "blocked", "Blocked again"),
    );

    expect(first.action.startedAt).toBe(startedAt);
    expect(second.action.startedAt).toBe(startedAt);
    expect(first.event.actionVersion).toBe(4);
    expect(second.event.actionVersion).toBe(5);
    expect(first.event.factHash).not.toBe(second.event.factHash);

    repository.getAction.mockResolvedValue(blockedAgain);
    await expect(
      GrowthActionsService.transitionAction(
        transitionInput("blocked", 3, "in_progress", "Unblocked"),
      ),
    ).resolves.toEqual({ action: blockedAgain, event: first.event });
    await expect(
      GrowthActionsService.transitionAction(
        transitionInput("blocked", 3, "in_progress", "Changed replay"),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(repository.transitionAction).toHaveBeenCalledTimes(2);
  });

  it("preserves implementation milestones while entering measurement", async () => {
    const { current, winner } = installSuccessfulTransition(
      "implemented",
      4,
      "measuring",
    );

    const result = await GrowthActionsService.transitionAction(
      transitionInput("implemented", 4, "measuring"),
    );

    expect(result.action.startedAt).toBe(current.startedAt);
    expect(result.action.implementedAt).toBe(current.implementedAt);
    expect(result.action.evaluatedAt).toBeNull();
    expect(result.action).toBe(winner);
  });

  it("hides missing and foreign Actions as NOT_FOUND", async () => {
    repository.getAction.mockResolvedValue(null);

    await expect(
      GrowthActionsService.transitionAction({
        ...transitionInput("approved", 0, "ready"),
        projectId: "project_2",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(repository.getAction).toHaveBeenCalledWith("project_2", "action_1");
    expect(repository.transitionAction).not.toHaveBeenCalled();
  });
});
