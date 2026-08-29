import { describe, expect, it } from "vitest";
import {
  GROWTH_ACTION_STATUSES,
  createGrowthActionSchema,
  isDirectGrowthActionTransition,
  isLegalGrowthActionTransition,
  transitionGrowthActionSchema,
} from "./growth-actions";

const createInput = {
  projectId: "project_1",
  recommendationId: "recommendation_1",
  creationKey: "action:pricing-refresh",
  title: "Refresh the pricing page",
  description: "Implement the accepted pricing-page recommendation.",
  dueAt: "2026-09-30T17:00:00+01:00",
  targets: [{ type: "url" as const, value: "https://example.test/pricing" }],
  actorType: "user" as const,
  actorId: "user_1",
};

describe("Growth Action schemas", () => {
  it("accepts bounded creation facts, offset dates, actors and nullable notes", () => {
    expect(
      createGrowthActionSchema.parse({ ...createInput, note: null }),
    ).toMatchObject({
      dueAt: createInput.dueAt,
      actorType: "user",
      note: null,
    });
    expect(
      createGrowthActionSchema.parse({
        ...createInput,
        actorType: "agent",
        actorId: "growth-agent",
        note: "Accepted by the account team",
      }),
    ).toMatchObject({ actorType: "agent" });
  });

  it("rejects missing or excessive targets and invalid target vocabularies", () => {
    expect(() =>
      createGrowthActionSchema.parse({ ...createInput, targets: [] }),
    ).toThrow();
    expect(() =>
      createGrowthActionSchema.parse({
        ...createInput,
        targets: Array.from({ length: 101 }, (_, index) => ({
          type: "keyword" as const,
          value: `keyword ${index}`,
        })),
      }),
    ).toThrow();
    expect(() =>
      createGrowthActionSchema.parse({
        ...createInput,
        targets: [{ type: "page", value: "/pricing" }],
      }),
    ).toThrow();
  });

  it("rejects malformed dates and unbounded creation or actor text", () => {
    expect(() =>
      createGrowthActionSchema.parse({
        ...createInput,
        dueAt: "2026-09-30",
      }),
    ).toThrow();
    expect(() =>
      createGrowthActionSchema.parse({
        ...createInput,
        description: "x".repeat(5001),
      }),
    ).toThrow();
    expect(() =>
      createGrowthActionSchema.parse({ ...createInput, actorId: " " }),
    ).toThrow();
    expect(() =>
      createGrowthActionSchema.parse({
        ...createInput,
        actorType: "integration",
      }),
    ).toThrow();
    expect(() =>
      createGrowthActionSchema.parse({
        ...createInput,
        note: "x".repeat(5001),
      }),
    ).toThrow();
  });

  const legalTransitions = [
    ["approved", "ready"],
    ["approved", "cancelled"],
    ["ready", "in_progress"],
    ["ready", "cancelled"],
    ["in_progress", "blocked"],
    ["in_progress", "implemented"],
    ["in_progress", "cancelled"],
    ["blocked", "in_progress"],
    ["blocked", "implemented"],
    ["blocked", "cancelled"],
    ["implemented", "measuring"],
    ["measuring", "evaluated"],
  ] as const;

  const directTransitions = legalTransitions.slice(0, -2);
  const measurementTransitions = legalTransitions.slice(-2);

  it.each(directTransitions)(
    "accepts the direct transition %s to %s",
    (from, to) => {
      expect(
        transitionGrowthActionSchema.parse({
          projectId: "project_1",
          actionId: "action_1",
          expectedStatus: from,
          expectedVersion: from === "approved" ? 0 : 1,
          status: to,
          actorType: "system",
          actorId: "growth-worker",
        }),
      ).toMatchObject({ expectedStatus: from, status: to });
      expect(isLegalGrowthActionTransition(from, to)).toBe(true);
      expect(isDirectGrowthActionTransition(from, to)).toBe(true);
    },
  );

  it.each(measurementTransitions)(
    "reserves the legal measurement transition %s to %s",
    (from, to) => {
      expect(isLegalGrowthActionTransition(from, to)).toBe(true);
      expect(isDirectGrowthActionTransition(from, to)).toBe(false);
      expect(
        transitionGrowthActionSchema.safeParse({
          projectId: "project_1",
          actionId: "action_1",
          expectedStatus: from,
          expectedVersion: 1,
          status: to,
          actorType: "system",
          actorId: "growth-worker",
        }).success,
      ).toBe(false);
    },
  );

  it("rejects every incompatible lifecycle coordinate", () => {
    const legal = new Set(
      legalTransitions.map(([from, to]) => `${from}:${to}`),
    );
    for (const from of GROWTH_ACTION_STATUSES) {
      for (const to of GROWTH_ACTION_STATUSES) {
        if (legal.has(`${from}:${to}`)) continue;
        expect(
          transitionGrowthActionSchema.safeParse({
            projectId: "project_1",
            actionId: "action_1",
            expectedStatus: from,
            expectedVersion: from === "approved" ? 0 : 1,
            status: to,
            actorType: "system",
            actorId: "growth-worker",
          }).success,
          `${from} to ${to}`,
        ).toBe(false);
        expect(isLegalGrowthActionTransition(from, to)).toBe(false);
        expect(isDirectGrowthActionTransition(from, to)).toBe(false);
      }
    }
  });

  it("rejects fractional, negative and status-incompatible versions", () => {
    const transition = {
      projectId: "project_1",
      actionId: "action_1",
      expectedStatus: "approved" as const,
      expectedVersion: 0,
      status: "ready" as const,
      actorType: "user" as const,
      actorId: "user_1",
    };
    expect(() =>
      transitionGrowthActionSchema.parse({
        ...transition,
        expectedVersion: 0.5,
      }),
    ).toThrow();
    expect(() =>
      transitionGrowthActionSchema.parse({
        ...transition,
        expectedVersion: -1,
      }),
    ).toThrow();
    expect(() =>
      transitionGrowthActionSchema.parse({
        ...transition,
        expectedVersion: 1,
      }),
    ).toThrow("Only an approved Action can have version zero");
    expect(() =>
      transitionGrowthActionSchema.parse({
        ...transition,
        expectedStatus: "ready",
      }),
    ).toThrow("Only an approved Action can have version zero");
  });

  it("rejects unknown, no-op and return-to-initial statuses", () => {
    const transition = {
      projectId: "project_1",
      actionId: "action_1",
      expectedStatus: "ready" as const,
      expectedVersion: 1,
      status: "in_progress" as const,
      actorType: "user" as const,
      actorId: "user_1",
    };
    expect(() =>
      transitionGrowthActionSchema.parse({
        ...transition,
        status: "done",
      }),
    ).toThrow();
    expect(() =>
      transitionGrowthActionSchema.parse({
        ...transition,
        status: "ready",
      }),
    ).toThrow("Growth Action transition is not allowed");
    expect(() =>
      transitionGrowthActionSchema.parse({
        ...transition,
        status: "approved",
      }),
    ).toThrow("Growth Action transition is not allowed");
  });
});
