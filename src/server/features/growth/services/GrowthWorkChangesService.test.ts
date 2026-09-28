import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  listManualChangeEventGraphsForAction: vi.fn(),
  listManualChangeEventGraphs: vi.fn(),
}));
const changeEvents = vi.hoisted(() => ({
  getChangeEvent: vi.fn(),
  linkAction: vi.fn(),
}));
const investigations = vi.hoisted(() => ({ getQualifiedWork: vi.fn() }));

vi.mock("../repositories/GrowthChangeEventsRepository", () => ({
  GrowthChangeEventsRepository: repository,
}));
vi.mock("./GrowthChangeEventsService", () => ({
  GrowthChangeEventsService: changeEvents,
}));
vi.mock("./GrowthInvestigationsService", () => investigations);
vi.mock("./GrowthChangeLogService", () => ({
  toChangeDto: (value: typeof graph) => ({
    id: value.event.id,
    changeType: value.event.changeType,
    description: value.event.description,
    happenedAt: value.event.happenedAt,
    recordedAt: value.event.createdAt,
    displayUrls: ["https://example.com/pricing"],
  }),
}));

import { GrowthWorkChangesService } from "./GrowthWorkChangesService";

const graph = {
  event: {
    id: "change_1",
    source: "manual" as const,
    changeType: "content_updated" as const,
    description: "Updated copy",
    happenedAt: "2026-08-30T00:00:00.000Z",
    createdAt: "2026-08-31T00:00:00.000Z",
  },
  urls: ["https://example.com/pricing?private=1"],
  actionIds: ["action_1"],
};

describe("GrowthWorkChangesService", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    investigations.getQualifiedWork.mockResolvedValue({ id: "action_1" });
    repository.listManualChangeEventGraphsForAction.mockResolvedValue([graph]);
    repository.listManualChangeEventGraphs.mockResolvedValue([graph]);
    changeEvents.getChangeEvent.mockResolvedValue(graph);
    changeEvents.linkAction.mockResolvedValue({
      projectId: "project_1",
      actionId: "action_1",
      changeEventId: "change_1",
    });
  });

  it("qualifies exact Work and returns safe independent linked and recent lists", async () => {
    await expect(
      GrowthWorkChangesService.getGrowthWorkChanges("project_1", "action_1"),
    ).resolves.toEqual({
      actionId: "action_1",
      linkedChanges: [expect.objectContaining({ id: "change_1" })],
      availableChanges: [expect.objectContaining({ id: "change_1" })],
      limit: 50,
    });
    expect(investigations.getQualifiedWork).toHaveBeenCalledWith(
      "project_1",
      "action_1",
    );
    expect(
      repository.listManualChangeEventGraphsForAction,
    ).toHaveBeenCalledWith("project_1", "action_1", 50);
    expect(repository.listManualChangeEventGraphs).toHaveBeenCalledWith(
      "project_1",
      50,
    );
  });

  it("links only a same-project manual event after Work qualification", async () => {
    await expect(
      GrowthWorkChangesService.linkGrowthWorkChange({
        projectId: "project_1",
        actionId: "action_1",
        changeEventId: "change_1",
      }),
    ).resolves.toEqual({ actionId: "action_1", changeEventId: "change_1" });
    expect(changeEvents.linkAction).toHaveBeenCalledWith({
      projectId: "project_1",
      actionId: "action_1",
      changeEventId: "change_1",
    });
  });

  it("fails closed when exact Work qualification is rejected", async () => {
    investigations.getQualifiedWork.mockRejectedValue({ code: "NOT_FOUND" });
    await expect(
      GrowthWorkChangesService.getGrowthWorkChanges("project_1", "action_1"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      GrowthWorkChangesService.linkGrowthWorkChange({
        projectId: "project_1",
        actionId: "action_1",
        changeEventId: "change_1",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(
      repository.listManualChangeEventGraphsForAction,
    ).not.toHaveBeenCalled();
    expect(repository.listManualChangeEventGraphs).not.toHaveBeenCalled();
    expect(changeEvents.getChangeEvent).not.toHaveBeenCalled();
    expect(changeEvents.linkAction).not.toHaveBeenCalled();
  });

  it("fails closed when the scoped event is missing or rejected", async () => {
    changeEvents.getChangeEvent.mockRejectedValue({ code: "NOT_FOUND" });
    await expect(
      GrowthWorkChangesService.linkGrowthWorkChange({
        projectId: "project_1",
        actionId: "action_1",
        changeEventId: "missing_change",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(changeEvents.linkAction).not.toHaveBeenCalled();
  });

  it("rejects non-manual events without writing a link", async () => {
    changeEvents.getChangeEvent.mockResolvedValue({
      ...graph,
      event: { ...graph.event, source: "deployment" },
    });
    await expect(
      GrowthWorkChangesService.linkGrowthWorkChange({
        projectId: "project_1",
        actionId: "action_1",
        changeEventId: "change_1",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(changeEvents.linkAction).not.toHaveBeenCalled();
  });
});
