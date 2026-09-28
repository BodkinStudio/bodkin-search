import { describe, expect, it } from "vitest";
import {
  isPriorityPageControllerReleasable,
  priorityPageControllerCycleKey,
  priorityPageOpportunityDedupeKey,
  priorityPageSuppressionReason,
} from "./PriorityPageOpportunityPolicy";

describe("priority-page repeat suppression policy", () => {
  it("opens a later controller cycle only after a valid evaluated instant", () => {
    expect(
      isPriorityPageControllerReleasable({
        actionStatus: "evaluated",
        evaluatedAt: "2026-09-01T10:00:00+01:00",
        capturedAt: "2026-09-01T09:30:00Z",
      }),
    ).toBe(true);
    expect(
      isPriorityPageControllerReleasable({
        actionStatus: "evaluated",
        evaluatedAt: "2026-09-01T09:30:00Z",
        capturedAt: "2026-09-01T10:30:00+01:00",
      }),
    ).toBe(false);
    expect(
      isPriorityPageControllerReleasable({
        actionStatus: "evaluated",
        evaluatedAt: "2026-09-01T10:00:00Z",
        capturedAt: "2026-09-01T10:00:00Z",
      }),
    ).toBe(false);
    expect(
      isPriorityPageControllerReleasable({
        actionStatus: "evaluated",
        evaluatedAt: "not-an-instant",
        capturedAt: "2026-09-01T10:00:01Z",
      }),
    ).toBe(false);
    expect(
      isPriorityPageControllerReleasable({
        actionStatus: "measuring",
        evaluatedAt: "2026-09-01T10:00:00Z",
        capturedAt: "2026-09-01T10:00:01Z",
      }),
    ).toBe(false);
  });

  it("uses the prior controller recommendation only for released cycles", () => {
    expect(priorityPageControllerCycleKey(null)).toBe("initial-controller");
    expect(priorityPageControllerCycleKey("recommendation_1")).toBe(
      "recommendation_1",
    );
  });
  it("uses only the closed issue coordinate for a stable project-scoped key", async () => {
    const first = await priorityPageOpportunityDedupeKey({
      projectId: "project_1",
      keyPageId: "key_1",
    });
    await expect(
      priorityPageOpportunityDedupeKey({
        projectId: "project_1",
        keyPageId: "key_1",
      }),
    ).resolves.toBe(first);
    await expect(
      priorityPageOpportunityDedupeKey({
        projectId: "project_1",
        keyPageId: "key_2",
      }),
    ).resolves.not.toBe(first);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it.each([
    ["proposed", false, "existing_proposal"],
    ["snoozed", false, "existing_snooze"],
    ["dismissed", false, "prior_dismissal"],
    ["accepted", true, "existing_action"],
    ["accepted", false, "accepted_without_action"],
    ["merged", false, "resolved_recommendation"],
    ["superseded", true, "resolved_recommendation"],
  ] as const)("maps %s with action=%s to %s", (status, hasAction, reason) => {
    expect(
      priorityPageSuppressionReason({
        recommendationStatus: status,
        hasTemplateAction: hasAction,
      }),
    ).toBe(reason);
  });
});
