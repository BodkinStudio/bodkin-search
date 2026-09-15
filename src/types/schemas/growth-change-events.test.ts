import { describe, expect, it } from "vitest";
import { GROWTH_ACTOR_TYPES } from "./growth-actions";
import {
  GROWTH_CHANGE_EVENT_SOURCES,
  GROWTH_CHANGE_EVENT_TYPES,
  linkGrowthActionChangeSchema,
  recordManualGrowthChangeEventSchema,
} from "./growth-change-events";

const recordInput = {
  projectId: "project_1",
  creationKey: "change:pricing-refresh:2026-08-29",
  changeType: "content_updated" as const,
  actorType: "user" as const,
  actorId: "user_1",
  description: "Published the revised pricing page.",
  happenedAt: "2026-08-29T14:30:00+01:00",
  externalRef: "commit:abc123",
  urls: ["https://example.test/pricing"],
};

describe("Growth Change Event schemas", () => {
  it("publishes only the accepted persisted source registry", () => {
    expect(GROWTH_CHANGE_EVENT_SOURCES).toEqual([
      "manual",
      "sherpa",
      "cms_webhook",
      "deployment",
    ]);
  });

  it.each(GROWTH_CHANGE_EVENT_TYPES)(
    "accepts the persisted change type %s",
    (changeType) => {
      expect(
        recordManualGrowthChangeEventSchema.parse({
          ...recordInput,
          changeType,
        }).changeType,
      ).toBe(changeType);
    },
  );

  it.each(GROWTH_ACTOR_TYPES)(
    "accepts the shared actor type %s",
    (actorType) => {
      expect(
        recordManualGrowthChangeEventSchema.parse({
          ...recordInput,
          actorType,
        }).actorType,
      ).toBe(actorType);
    },
  );

  it("accepts offset-aware occurrence times and nullable references", () => {
    expect(
      recordManualGrowthChangeEventSchema.parse({
        ...recordInput,
        externalRef: null,
      }),
    ).toMatchObject({
      happenedAt: recordInput.happenedAt,
      externalRef: null,
    });
    expect(
      recordManualGrowthChangeEventSchema.parse({
        ...recordInput,
        externalRef: undefined,
      }).externalRef,
    ).toBeUndefined();
  });

  it("does not accept a caller-supplied source coordinate", () => {
    expect(
      recordManualGrowthChangeEventSchema.parse({
        ...recordInput,
        source: "deployment",
      }),
    ).not.toHaveProperty("source");
  });

  it("rejects unknown actor and change type vocabulary", () => {
    expect(() =>
      recordManualGrowthChangeEventSchema.parse({
        ...recordInput,
        actorType: "integration",
      }),
    ).toThrow();
    expect(() =>
      recordManualGrowthChangeEventSchema.parse({
        ...recordInput,
        changeType: "git_deployment",
      }),
    ).toThrow();
    expect(() =>
      recordManualGrowthChangeEventSchema.parse({
        ...recordInput,
        changeType: "unknown/mixed",
      }),
    ).toThrow();
  });

  it("enforces every text and reference bound", () => {
    for (const [field, max] of [
      ["projectId", 100],
      ["creationKey", 200],
      ["actorId", 200],
      ["description", 5000],
      ["externalRef", 500],
    ] as const) {
      expect(() =>
        recordManualGrowthChangeEventSchema.parse({
          ...recordInput,
          [field]: "x".repeat(max + 1),
        }),
      ).toThrow();
      expect(() =>
        recordManualGrowthChangeEventSchema.parse({
          ...recordInput,
          [field]: " ",
        }),
      ).toThrow();
    }
    expect(() =>
      recordManualGrowthChangeEventSchema.parse({
        ...recordInput,
        urls: ["x".repeat(2001)],
      }),
    ).toThrow();
  });

  it("requires an offset-aware timestamp", () => {
    expect(() =>
      recordManualGrowthChangeEventSchema.parse({
        ...recordInput,
        happenedAt: "2026-08-29",
      }),
    ).toThrow();
    expect(() =>
      recordManualGrowthChangeEventSchema.parse({
        ...recordInput,
        happenedAt: "2026-08-29T14:30:00",
      }),
    ).toThrow();
  });

  it("requires 1–100 exact URL inputs", () => {
    expect(() =>
      recordManualGrowthChangeEventSchema.parse({ ...recordInput, urls: [] }),
    ).toThrow();
    expect(() =>
      recordManualGrowthChangeEventSchema.parse({
        ...recordInput,
        urls: Array.from(
          { length: 101 },
          (_, index) => `https://example.test/page-${index}`,
        ),
      }),
    ).toThrow();
    expect(
      recordManualGrowthChangeEventSchema.parse({
        ...recordInput,
        urls: Array.from(
          { length: 100 },
          (_, index) => `https://example.test/page-${index}`,
        ),
      }).urls,
    ).toHaveLength(100);
  });

  it("accepts exactly one bounded project/Event/Action link coordinate", () => {
    const input = {
      projectId: "project_1",
      actionId: "action_1",
      changeEventId: "change_1",
    };
    expect(linkGrowthActionChangeSchema.parse(input)).toEqual(input);
    for (const field of ["projectId", "actionId", "changeEventId"] as const) {
      expect(() =>
        linkGrowthActionChangeSchema.parse({ ...input, [field]: " " }),
      ).toThrow();
      expect(() =>
        linkGrowthActionChangeSchema.parse({
          ...input,
          [field]: "x".repeat(101),
        }),
      ).toThrow();
    }
    expect(
      linkGrowthActionChangeSchema.parse({ ...input, extra: "no" }),
    ).toEqual(input);
  });
});
