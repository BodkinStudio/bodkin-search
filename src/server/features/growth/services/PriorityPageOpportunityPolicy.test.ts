import { describe, expect, it } from "vitest";
import {
  priorityPageOpportunityDedupeKey,
  priorityPageSuppressionReason,
} from "./PriorityPageOpportunityPolicy";

describe("priority-page repeat suppression policy", () => {
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
