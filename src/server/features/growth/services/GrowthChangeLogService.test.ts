import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  projectDomain: vi.fn(),
  listManualChangeEventGraphs: vi.fn(),
  getChangeEventByKey: vi.fn(),
  getChangeEventGraph: vi.fn(),
}));
const context = vi.hoisted(() => ({ getProjectContext: vi.fn() }));
const events = vi.hoisted(() => ({ recordManualEvent: vi.fn() }));
vi.mock("../repositories/GrowthChangeEventsRepository", () => ({
  GrowthChangeEventsRepository: repository,
}));
vi.mock(
  "@/server/features/project-context/services/ProjectContextService",
  () => ({ ProjectContextService: context }),
);
vi.mock("./GrowthChangeEventsService", () => ({
  GrowthChangeEventsService: events,
}));

import { GrowthChangeLogService } from "./GrowthChangeLogService";

const graph = {
  event: {
    id: "event_1",
    changeType: "content_updated" as const,
    description: "Updated copy",
    happenedAt: "2026-08-29T00:00:00.000Z",
    createdAt: "2026-08-30T12:00:00.000Z",
  },
  urls: ["https://example.com/pricing?secret=1"],
  actionIds: [],
};

describe("GrowthChangeLogService", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    repository.projectDomain.mockResolvedValue("example.com");
    repository.listManualChangeEventGraphs.mockResolvedValue([]);
    context.getProjectContext.mockResolvedValue({
      keyPages: [{ id: "page_1", url: "https://example.com/pricing" }],
    });
    events.recordManualEvent.mockResolvedValue(graph);
  });

  it("records configured pages at UTC midnight with a user actor", async () => {
    await GrowthChangeLogService.recordGrowthPageChange({
      projectId: "project_1",
      requestKey: "c6d24ae8-da66-45c3-9057-11e76520a34f",
      keyPageId: "page_1",
      happenedOn: "2026-08-29",
      changeType: "content_updated",
      description: "Updated copy",
      actorId: "user_1",
    });
    expect(events.recordManualEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        creationKey:
          "manual-key-page:page_1:c6d24ae8-da66-45c3-9057-11e76520a34f",
        actorType: "user",
        actorId: "user_1",
        happenedAt: "2026-08-29T00:00:00.000Z",
        urls: ["https://example.com/pricing"],
      }),
    );
  });

  it("replays using saved targets before looking up current key pages", async () => {
    repository.getChangeEventByKey.mockResolvedValue({ id: "event_1" });
    repository.getChangeEventGraph.mockResolvedValue(graph);
    await GrowthChangeLogService.recordGrowthPageChange({
      projectId: "project_1",
      requestKey: "c6d24ae8-da66-45c3-9057-11e76520a34f",
      keyPageId: "page_removed",
      happenedOn: "2026-08-29",
      changeType: "content_updated",
      description: "Updated copy",
      actorId: "user_1",
    });
    expect(context.getProjectContext).not.toHaveBeenCalled();
    expect(events.recordManualEvent).toHaveBeenCalledWith(
      expect.objectContaining({ urls: graph.urls }),
    );
  });

  it("returns safe, deterministic bounded history", async () => {
    repository.listManualChangeEventGraphs.mockResolvedValue([graph]);
    const result = await GrowthChangeLogService.getGrowthChangeLog("project_1");
    expect(repository.listManualChangeEventGraphs).toHaveBeenCalledWith(
      "project_1",
      50,
    );
    expect(result).toMatchObject({
      setup: "ready",
      limit: 50,
      changes: [{ displayUrls: ["https://example.com/pricing"] }],
    });
  });

  it("reports missing setup and rejects unavailable key pages", async () => {
    repository.projectDomain.mockResolvedValue(null);
    expect(
      await GrowthChangeLogService.getGrowthChangeLog("project_1"),
    ).toMatchObject({ setup: "missing_domain" });
    repository.projectDomain.mockResolvedValue("example.com");
    context.getProjectContext.mockResolvedValue({ keyPages: [] });
    expect(
      await GrowthChangeLogService.getGrowthChangeLog("project_1"),
    ).toMatchObject({ setup: "missing_key_pages" });
    await expect(
      GrowthChangeLogService.recordGrowthPageChange({
        projectId: "project_1",
        requestKey: "c6d24ae8-da66-45c3-9057-11e76520a34f",
        keyPageId: "foreign_page",
        happenedOn: "2026-08-29",
        changeType: "content_updated",
        description: "Updated copy",
        actorId: "user_1",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(events.recordManualEvent).not.toHaveBeenCalled();
  });
});
