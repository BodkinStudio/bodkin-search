import { describe, expect, it } from "vitest";
import {
  growthActionsReadPageDtoSchema,
  growthActionsReadRequestSchema,
} from "./growth-action-reads";

const request = { projectId: "project_1" };

describe("growthActionsReadRequestSchema", () => {
  it("applies bounded defaults and canonicalizes status filters", () => {
    expect(growthActionsReadRequestSchema.parse(request)).toEqual({
      projectId: "project_1",
      limit: 20,
    });
    expect(
      growthActionsReadRequestSchema.parse({
        ...request,
        statuses: ["ready", "blocked", "ready", "approved"],
      }).statuses,
    ).toEqual(["approved", "ready", "blocked"]);
  });

  it("rejects unbounded filters, invalid cursors, and internal input", () => {
    for (const invalid of [
      { ...request, limit: 51 },
      { ...request, minPriorityScore: -1 },
      { ...request, category: "   " },
      { ...request, cursor: { createdAt: "not-a-time", id: "action" } },
      { ...request, cursor: { createdAt: "2026-09-01T00:00:00.000Z" } },
      { ...request, ownerUserId: "internal" },
    ])
      expect(growthActionsReadRequestSchema.safeParse(invalid).success).toBe(
        false,
      );
  });
});

describe("growthActionsReadPageDtoSchema", () => {
  it("allows only the safe target variants and rejects internal Action fields", () => {
    const dto = {
      actions: [
        {
          id: "action_1",
          title: "Safe title",
          titleRedacted: false,
          titleTruncated: false,
          category: "content",
          categoryRedacted: false,
          categoryTruncated: false,
          description: "Safe description",
          descriptionRedacted: false,
          descriptionTruncated: false,
          priorityScore: 10,
          status: "ready",
          version: 1,
          dueAt: "2026-09-01T00:00:00.000Z",
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-02T00:00:00.000Z",
          targetCount: 2,
          displayTargets: [
            {
              type: "url",
              value: "https://example.com/pricing",
              queryOrFragmentOmitted: true,
              withheld: false,
            },
            {
              type: "keyword",
              value: "pricing software",
              redacted: false,
              truncated: false,
            },
          ],
          displayTargetsOmitted: false,
          displayTargetsWithheld: false,
        },
      ],
      limit: 20,
      hasMore: false,
      nextCursor: null,
    };
    expect(growthActionsReadPageDtoSchema.safeParse(dto).success).toBe(true);
    expect(
      growthActionsReadPageDtoSchema.safeParse({
        ...dto,
        actions: [{ ...dto.actions[0], recommendationId: "not-safe" }],
      }).success,
    ).toBe(false);
  });
});
