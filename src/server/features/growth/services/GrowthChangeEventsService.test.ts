import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  linkGrowthActionChangeSchema,
  recordManualGrowthChangeEventSchema,
  type GrowthChangeEventType,
} from "@/types/schemas/growth-change-events";

const repository = vi.hoisted(() => ({
  projectDomain: vi.fn(),
  getChangeEvent: vi.fn(),
  getChangeEventByKey: vi.fn(),
  getChangeEventGraph: vi.fn(),
  getAction: vi.fn(),
  getActionChange: vi.fn(),
  createChangeEventGraph: vi.fn(),
  linkActionChange: vi.fn(),
}));

vi.mock("../repositories/GrowthChangeEventsRepository", () => ({
  GrowthChangeEventsRepository: repository,
}));

import { GrowthChangeEventsService } from "./GrowthChangeEventsService";

const input = recordManualGrowthChangeEventSchema.parse({
  projectId: "project_1",
  creationKey: "pricing-refresh-2026-08-29",
  changeType: "content_updated",
  actorType: "user",
  actorId: "user_1",
  description: "Reworked pricing copy and supporting proof.",
  happenedAt: "2026-08-29T14:30:00+01:00",
  externalRef: "deploy-123",
  urls: [
    "https://shop.example.com/Proof/?preview=1#result",
    "https://WWW.Example.com/Pricing/?utm_source=test#top",
    "example.com/Pricing/",
  ],
});

type CreateWrite = {
  id: string;
  projectId: string;
  creationKey: string;
  factHash: string;
  source: "manual";
  changeType: GrowthChangeEventType;
  actorType: "user" | "agent" | "system";
  actorId: string;
  description: string;
  happenedAt: string;
  externalRef: string | null;
  urls: string[];
  expectedDomain: string;
};

type StoredGraph = {
  event: {
    id: string;
    projectId: string;
    creationKey: string;
    factHash: string;
    source: "manual";
    changeType: GrowthChangeEventType;
    actorType: "user" | "agent" | "system";
    actorId: string;
    description: string;
    happenedAt: string;
    externalRef: string | null;
    createdAt: string;
  };
  urls: string[];
  actionIds: string[];
};

const action = {
  id: "action_1",
  projectId: "project_1",
  status: "evaluated",
  stateVersion: 7,
};

function graphFromWrite(write: CreateWrite): StoredGraph {
  return {
    event: {
      id: write.id,
      projectId: write.projectId,
      creationKey: write.creationKey,
      factHash: write.factHash,
      source: write.source,
      changeType: write.changeType,
      actorType: write.actorType,
      actorId: write.actorId,
      description: write.description,
      happenedAt: write.happenedAt,
      externalRef: write.externalRef,
      createdAt: "2026-08-29T14:31:00.000Z",
    },
    urls: write.urls,
    actionIds: [],
  };
}

function installStore() {
  const graphs = new Map<string, StoredGraph>();
  const writes: CreateWrite[] = [];
  repository.getChangeEventByKey.mockImplementation(
    async (projectId: string, creationKey: string) =>
      graphs.get(`${projectId}:${creationKey}`)?.event ?? null,
  );
  repository.getChangeEvent.mockImplementation(
    async (projectId: string, eventId: string) =>
      [...graphs.values()].find(
        ({ event }) => event.projectId === projectId && event.id === eventId,
      )?.event ?? null,
  );
  repository.getChangeEventGraph.mockImplementation(
    async (projectId: string, eventId: string) =>
      [...graphs.values()].find(
        ({ event }) => event.projectId === projectId && event.id === eventId,
      ) ?? null,
  );
  repository.createChangeEventGraph.mockImplementation(
    async (write: CreateWrite) => {
      writes.push(write);
      const key = `${write.projectId}:${write.creationKey}`;
      if (!graphs.has(key)) graphs.set(key, graphFromWrite(write));
    },
  );
  repository.linkActionChange.mockImplementation(
    async ({
      projectId,
      changeEventId,
      actionId,
    }: {
      projectId: string;
      changeEventId: string;
      actionId: string;
    }) => {
      const graph = [...graphs.values()].find(
        ({ event }) =>
          event.projectId === projectId && event.id === changeEventId,
      );
      if (graph && !graph.actionIds.includes(actionId))
        graph.actionIds.push(actionId);
    },
  );
  repository.getActionChange.mockImplementation(
    async (projectId: string, changeEventId: string, actionId: string) => {
      const graph = [...graphs.values()].find(
        ({ event }) =>
          event.projectId === projectId && event.id === changeEventId,
      );
      return graph?.actionIds.includes(actionId)
        ? { projectId, changeEventId, actionId }
        : null;
    },
  );
  return { graphs, writes };
}

beforeEach(() => {
  vi.clearAllMocks();
  repository.projectDomain.mockResolvedValue("example.com");
  repository.getAction.mockResolvedValue(action);
});

describe("GrowthChangeEventsService recording", () => {
  it("records a standalone manual Event with canonical URLs and UTC occurrence time", async () => {
    const { writes } = installStore();

    const graph = await GrowthChangeEventsService.recordManualEvent(input);

    expect(graph.event).toMatchObject({
      projectId: "project_1",
      creationKey: "pricing-refresh-2026-08-29",
      source: "manual",
      changeType: "content_updated",
      actorType: "user",
      actorId: "user_1",
      happenedAt: "2026-08-29T13:30:00.000Z",
      externalRef: "deploy-123",
    });
    expect(graph.urls).toEqual([
      "https://example.com/Pricing",
      "https://shop.example.com/Proof",
    ]);
    expect(graph.actionIds).toEqual([]);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      source: "manual",
      expectedDomain: "example.com",
      happenedAt: "2026-08-29T13:30:00.000Z",
      urls: graph.urls,
    });
    expect(writes[0]?.factHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("treats equivalent URL order, duplicates, and timestamp offsets as an exact retry", async () => {
    const { graphs } = installStore();
    const first = await GrowthChangeEventsService.recordManualEvent(input);
    const retry = await GrowthChangeEventsService.recordManualEvent({
      ...input,
      happenedAt: "2026-08-29T13:30:00Z",
      urls: input.urls.toReversed(),
    });

    expect(retry).toBe(first);
    expect(graphs.size).toBe(1);
    expect(repository.createChangeEventGraph).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["change type", { changeType: "technical_fix" as const }],
    ["actor", { actorId: "user_2" }],
    ["description", { description: "A different immutable description." }],
    ["occurrence", { happenedAt: "2026-08-29T13:31:00Z" }],
    ["external reference", { externalRef: "deploy-456" }],
    ["URL set", { urls: ["https://example.com/Pricing"] }],
  ])(
    "rejects creation-key drift in %s without attaching losing URLs",
    async (_label, change) => {
      const { graphs } = installStore();
      await GrowthChangeEventsService.recordManualEvent(input);

      await expect(
        GrowthChangeEventsService.recordManualEvent({ ...input, ...change }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(repository.createChangeEventGraph).toHaveBeenCalledTimes(1);
      expect([...graphs.values()][0]?.urls).toEqual([
        "https://example.com/Pricing",
        "https://shop.example.com/Proof",
      ]);
    },
  );

  it("validates the complete immutable core and URL graph on replay", async () => {
    const { graphs } = installStore();
    await GrowthChangeEventsService.recordManualEvent(input);
    const graph = [...graphs.values()][0];
    if (!graph) throw new Error("Expected stored Change Event graph");
    graph.urls = graph.urls.slice(1);

    await expect(
      GrowthChangeEventsService.recordManualEvent(input),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    graph.urls = [
      "https://example.com/Pricing",
      "https://shop.example.com/Proof",
    ];
    graph.event.description = "Corrupted core";
    await expect(
      GrowthChangeEventsService.recordManualEvent(input),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("returns current links while excluding added or removed links from replay equality", async () => {
    const { graphs } = installStore();
    const first = await GrowthChangeEventsService.recordManualEvent(input);
    const graph = [...graphs.values()][0];
    if (!graph) throw new Error("Expected stored Change Event graph");

    graph.actionIds.push("action_1");
    const linkedReplay =
      await GrowthChangeEventsService.recordManualEvent(input);
    expect(linkedReplay.actionIds).toEqual(["action_1"]);

    graph.actionIds = [];
    const replayAfterActionRemoval =
      await GrowthChangeEventsService.recordManualEvent(input);
    expect(replayAfterActionRemoval.event).toEqual(first.event);
    expect(replayAfterActionRemoval.urls).toEqual(first.urls);
    expect(replayAfterActionRemoval.actionIds).toEqual([]);
  });

  it("preserves an exact historical retry after the active project domain changes", async () => {
    installStore();
    const recorded = await GrowthChangeEventsService.recordManualEvent(input);
    repository.projectDomain.mockResolvedValue("new-example.com");

    await expect(
      GrowthChangeEventsService.recordManualEvent(input),
    ).resolves.toBe(recorded);
    await expect(
      GrowthChangeEventsService.recordManualEvent({
        ...input,
        creationKey: "new-event-on-old-domain",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(repository.createChangeEventGraph).toHaveBeenCalledTimes(1);
  });

  it("keeps the same creation key independent between projects", async () => {
    const { graphs } = installStore();
    repository.projectDomain.mockResolvedValue("example.com");

    const first = await GrowthChangeEventsService.recordManualEvent(input);
    const second = await GrowthChangeEventsService.recordManualEvent({
      ...input,
      projectId: "project_2",
    });

    expect(first.event.id).not.toBe(second.event.id);
    expect(graphs.size).toBe(2);
  });

  it("reads a complete Event graph only through its project coordinate", async () => {
    installStore();
    const recorded = await GrowthChangeEventsService.recordManualEvent(input);

    await expect(
      GrowthChangeEventsService.getChangeEvent(
        input.projectId,
        recorded.event.id,
      ),
    ).resolves.toBe(recorded);
    await expect(
      GrowthChangeEventsService.getChangeEvent(
        "project_foreign",
        recorded.event.id,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects off-project URLs before writing a new Event", async () => {
    installStore();

    await expect(
      GrowthChangeEventsService.recordManualEvent({
        ...input,
        urls: ["https://competitor.com/landing"],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(repository.getChangeEventByKey).toHaveBeenCalledWith(
      input.projectId,
      input.creationKey,
    );
    expect(repository.createChangeEventGraph).not.toHaveBeenCalled();
  });

  it.each(["missing", "archived"])(
    "hides a %s project as NOT_FOUND without reading or writing Events",
    async () => {
      installStore();
      repository.projectDomain.mockResolvedValue(null);

      await expect(
        GrowthChangeEventsService.recordManualEvent(input),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(repository.getChangeEventByKey).not.toHaveBeenCalled();
      expect(repository.createChangeEventGraph).not.toHaveBeenCalled();
    },
  );
});

describe("GrowthChangeEventsService Action links", () => {
  it("links one existing Event and Action idempotently without mutating Action lifecycle state", async () => {
    const { graphs } = installStore();
    const graph = await GrowthChangeEventsService.recordManualEvent(input);
    const linkInput = linkGrowthActionChangeSchema.parse({
      projectId: input.projectId,
      changeEventId: graph.event.id,
      actionId: action.id,
    });
    const actionBefore = structuredClone(action);

    const first = await GrowthChangeEventsService.linkAction(linkInput);
    const retry = await GrowthChangeEventsService.linkAction(linkInput);

    expect(first).toEqual({
      projectId: "project_1",
      changeEventId: graph.event.id,
      actionId: "action_1",
    });
    expect(retry).toEqual(first);
    expect([...graphs.values()][0]?.actionIds).toEqual(["action_1"]);
    expect(action).toEqual(actionBefore);
    expect(repository.linkActionChange).toHaveBeenCalledTimes(2);
    expect(repository.linkActionChange).toHaveBeenCalledWith(linkInput);
  });

  it.each([
    ["Event", null, action],
    ["Action", { id: "event_foreign" }, null],
    ["both coordinates", null, null],
  ])(
    "hides a missing or foreign %s behind the same NOT_FOUND response",
    async (_label, event, storedAction) => {
      repository.getChangeEvent.mockResolvedValue(event);
      repository.getAction.mockResolvedValue(storedAction);
      const linkInput = linkGrowthActionChangeSchema.parse({
        projectId: "project_1",
        changeEventId: "event_1",
        actionId: "action_1",
      });

      await expect(
        GrowthChangeEventsService.linkAction(linkInput),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "Growth Change Event or Action not found",
      });
      expect(repository.linkActionChange).not.toHaveBeenCalled();
    },
  );

  it("maps a delete race after validation to the same generic NOT_FOUND response", async () => {
    repository.getChangeEvent.mockResolvedValue({ id: "event_1" });
    repository.getAction.mockResolvedValue(action);
    repository.getActionChange.mockResolvedValue(null);
    const linkInput = linkGrowthActionChangeSchema.parse({
      projectId: "project_1",
      changeEventId: "event_1",
      actionId: "action_1",
    });

    await expect(
      GrowthChangeEventsService.linkAction(linkInput),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Growth Change Event or Action not found",
    });
  });
});
