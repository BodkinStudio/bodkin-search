import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  listActionsPage: vi.fn(),
  listActionTargetsForActions: vi.fn(),
}));

vi.mock("../repositories/GrowthActionsRepository", () => ({
  GrowthActionsRepository: repository,
}));

import { GrowthActionsReadService } from "./GrowthActionsReadService";

const input = { projectId: "project_authorized", limit: 2 };
const expandingUrl = (characters: number) =>
  `https://e.co/${"é".repeat(characters)}`;
const action = (id: string, createdAt = "2026-09-01T00:00:00.000Z") => ({
  id,
  title: "Improve pricing page",
  description: "A safe Action description.",
  category: "content",
  priorityScore: 10,
  status: "ready",
  stateVersion: 1,
  dueAt: "2026-09-10T00:00:00.000Z",
  createdAt,
  updatedAt: "2026-09-02T00:00:00.000Z",
  recommendationId: "must-never-return",
  ownerUserId: "must-never-return",
  creationKey: "must-never-return",
  factHash: "must-never-return",
});

describe("GrowthActionsReadService.listActions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    repository.listActionsPage.mockResolvedValue([]);
    repository.listActionTargetsForActions.mockResolvedValue([]);
  });

  it("uses the page read then bulk-loads only emitted Action targets", async () => {
    const first = action("action_first");
    const second = action("action_second", "2026-08-31T00:00:00.000Z");
    const extra = action("action_extra", "2026-08-30T00:00:00.000Z");
    repository.listActionsPage.mockResolvedValue([first, second, extra]);
    repository.listActionTargetsForActions.mockResolvedValue([
      {
        actionId: "action_first",
        targetType: "url",
        targetValue: "https://example.com/pricing?source=internal#section",
      },
      {
        actionId: "action_second",
        targetType: "keyword",
        targetValue: "pricing software",
      },
    ]);

    await expect(GrowthActionsReadService.listActions(input)).resolves.toEqual(
      expect.objectContaining({
        limit: 2,
        hasMore: true,
        nextCursor: {
          createdAt: second.createdAt,
          id: second.id,
        },
      }),
    );
    expect(repository.listActionsPage).toHaveBeenCalledWith(input);
    expect(repository.listActionTargetsForActions).toHaveBeenCalledWith(
      input.projectId,
      [first.id, second.id],
    );
  });

  it("projects mutable prose and target URLs without leaking credentials or query material", async () => {
    const credential = "PROJECTION_ACTION_SECRET_6725";
    repository.listActionsPage.mockResolvedValue([
      {
        ...action("action_private"),
        title: `api_key=${credential}`,
        category: "owner@example.com",
        description: `${"safe ".repeat(100)} https://example.com/path?secret=value#fragment`,
      },
    ]);
    repository.listActionTargetsForActions.mockResolvedValue([
      {
        actionId: "action_private",
        targetType: "url",
        targetValue: "https://example.com/path?secret=value#fragment",
      },
      {
        actionId: "action_private",
        targetType: "url",
        targetValue: `https://user:${credential}@example.com/private`,
      },
      {
        actionId: "action_private",
        targetType: "keyword",
        targetValue: "person@example.com",
      },
    ]);

    const page = await GrowthActionsReadService.listActions(input);
    const result = page.actions[0];
    expect(result).toMatchObject({
      title: "[redacted: recognised credential material]",
      titleRedacted: true,
      titleTruncated: false,
      category: "[email omitted]",
      categoryRedacted: true,
      categoryTruncated: false,
      descriptionTruncated: true,
      displayTargetsWithheld: true,
    });
    expect(result.description).not.toContain("?secret=value");
    expect(result.description).not.toContain("#fragment");
    expect(JSON.stringify(page)).not.toContain(credential);
    expect(JSON.stringify(page)).not.toContain("owner@example.com");
    expect(JSON.stringify(page)).not.toContain("recommendationId");
    expect(result.displayTargets).toContainEqual({
      type: "url",
      value: "https://example.com/path",
      queryOrFragmentOmitted: true,
      withheld: false,
    });
    expect(result.displayTargets).toContainEqual({
      type: "url",
      value: null,
      queryOrFragmentOmitted: false,
      withheld: true,
    });
  });

  it("reapplies public caps when safe URL projection expands Unicode prose", async () => {
    repository.listActionsPage.mockResolvedValue([
      {
        ...action("action_expanded"),
        title: expandingUrl(48),
        category: expandingUrl(15),
      },
    ]);
    repository.listActionTargetsForActions.mockResolvedValue([
      {
        actionId: "action_expanded",
        targetType: "keyword",
        targetValue: expandingUrl(400),
      },
    ]);

    const page = await GrowthActionsReadService.listActions(input);
    const result = page.actions[0];
    expect(result.title).toHaveLength(300);
    expect(result.titleTruncated).toBe(true);
    expect(result.category).toHaveLength(100);
    expect(result.categoryTruncated).toBe(true);
    expect(result.displayTargets[0]).toMatchObject({
      type: "keyword",
      truncated: true,
    });
    expect(result.displayTargets[0].value).toHaveLength(2000);
  });

  it("sorts targets in JavaScript code-unit order, bounds display, and fails closed over the write invariant", async () => {
    repository.listActionsPage.mockResolvedValue([action("action_targets")]);
    repository.listActionTargetsForActions.mockResolvedValue(
      Array.from({ length: 6 }, (_, index) => ({
        actionId: "action_targets",
        targetType: "keyword",
        targetValue: `keyword-${5 - index}`,
      })),
    );
    const page = await GrowthActionsReadService.listActions(input);
    expect(page.actions[0]).toMatchObject({
      targetCount: 6,
      displayTargetsOmitted: true,
    });
    expect(page.actions[0].displayTargets.map(({ value }) => value)).toEqual([
      "keyword-0",
      "keyword-1",
      "keyword-2",
      "keyword-3",
      "keyword-4",
    ]);

    repository.listActionTargetsForActions.mockResolvedValue(
      Array.from({ length: 101 }, (_, index) => ({
        actionId: "action_targets",
        targetType: "keyword",
        targetValue: `keyword-${index}`,
      })),
    );
    await expect(GrowthActionsReadService.listActions(input)).rejects.toThrow(
      "target integrity limit",
    );
  });
});
