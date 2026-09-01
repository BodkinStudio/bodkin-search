import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  listRecentManualChangeEventsPage: vi.fn(),
  listUrlsForRecentChangeEvents: vi.fn(),
}));

vi.mock("../repositories/GrowthChangeEventsRepository", () => ({
  GrowthChangeEventsRepository: repository,
}));

import { GrowthRecentChangesReadService } from "./GrowthRecentChangesReadService";

const row = {
  id: "event_1",
  source: "manual",
  changeType: "content_updated",
  description: "Updated the pricing page.",
  happenedAt: "2026-08-20T09:00:00.000Z",
  createdAt: "2026-08-20 09:10:00",
} as const;

beforeEach(() => {
  vi.resetAllMocks();
  repository.listRecentManualChangeEventsPage.mockResolvedValue([row]);
  repository.listUrlsForRecentChangeEvents.mockResolvedValue([
    { changeEventId: row.id, url: "https://example.com/pricing" },
  ]);
});

describe("GrowthRecentChangesReadService", () => {
  it("reads roots before one bulk URL read and normalizes recorded timestamps", async () => {
    const page = await GrowthRecentChangesReadService.listRecentChanges({
      projectId: "project_1",
      limit: 1,
    });

    expect(repository.listRecentManualChangeEventsPage).toHaveBeenCalledWith({
      projectId: "project_1",
      limit: 1,
    });
    expect(repository.listUrlsForRecentChangeEvents).toHaveBeenCalledWith(
      "project_1",
      ["event_1"],
    );
    expect(page.changes[0]).toMatchObject({
      source: "manual",
      recordedAt: "2026-08-20T09:10:00.000Z",
      urlCount: 1,
    });
  });

  it("canonicalizes an offset cursor before the repository read", async () => {
    await GrowthRecentChangesReadService.listRecentChanges({
      projectId: "project_1",
      limit: 1,
      cursor: {
        happenedAt: "2026-08-20T10:00:00+01:00",
        id: "event_2",
      },
    });

    expect(repository.listRecentManualChangeEventsPage).toHaveBeenCalledWith({
      projectId: "project_1",
      limit: 1,
      cursor: {
        happenedAt: "2026-08-20T09:00:00.000Z",
        id: "event_2",
      },
    });
  });

  it("uses a canonical cap-plus-one cursor and loads URLs only for emitted roots", async () => {
    repository.listRecentManualChangeEventsPage.mockResolvedValue([
      row,
      { ...row, id: "event_older", happenedAt: "2026-08-19T09:00:00.000Z" },
    ]);

    const page = await GrowthRecentChangesReadService.listRecentChanges({
      projectId: "project_1",
      limit: 1,
    });

    expect(page).toMatchObject({
      hasMore: true,
      nextCursor: {
        happenedAt: "2026-08-20T09:00:00.000Z",
        id: "event_1",
      },
    });
    expect(repository.listUrlsForRecentChangeEvents).toHaveBeenCalledWith(
      "project_1",
      ["event_1"],
    );
  });

  it("sanitizes every description and URL before public truncation", async () => {
    const secret = "RECENT_CHANGE_SECRET_4107";
    repository.listRecentManualChangeEventsPage.mockResolvedValue([
      {
        ...row,
        description: `Contact owner@example.com with api_key=${secret}; see https://example.com/private?token=private`,
      },
    ]);
    repository.listUrlsForRecentChangeEvents.mockResolvedValue([
      { changeEventId: row.id, url: "https://example.com/a" },
      { changeEventId: row.id, url: "https://example.com/b" },
      { changeEventId: row.id, url: "https://example.com/c" },
      { changeEventId: row.id, url: "https://example.com/d" },
      { changeEventId: row.id, url: "https://example.com/e" },
      {
        changeEventId: row.id,
        url: "https://user:secret@example.com/private?token=private",
      },
    ]);

    const page = await GrowthRecentChangesReadService.listRecentChanges({
      projectId: "project_1",
      limit: 1,
    });
    const item = page.changes[0];
    expect(item).toMatchObject({
      description: "[redacted: recognised credential material]",
      descriptionRedacted: true,
      urlCount: 6,
      displayUrlsOmitted: true,
      displayUrlsWithheld: true,
    });
    expect(item.displayUrls).toHaveLength(5);
    expect(JSON.stringify(page)).not.toContain(secret);
    expect(JSON.stringify(page)).not.toContain("owner@example.com");
  });

  it("rejects missing and overflowing stored URL children before display truncation", async () => {
    repository.listUrlsForRecentChangeEvents.mockResolvedValue([]);
    await expect(
      GrowthRecentChangesReadService.listRecentChanges({
        projectId: "project_1",
        limit: 1,
      }),
    ).rejects.toMatchObject({ code: "INTERNAL_ERROR" });

    repository.listUrlsForRecentChangeEvents.mockResolvedValue(
      Array.from({ length: 101 }, (_, index) => ({
        changeEventId: row.id,
        url: `https://example.com/${index}`,
      })),
    );
    await expect(
      GrowthRecentChangesReadService.listRecentChanges({
        projectId: "project_1",
        limit: 1,
      }),
    ).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
  });
});
