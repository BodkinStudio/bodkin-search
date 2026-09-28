import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/lib/errors";
import type { RecordManualGrowthChangeEventInput } from "@/types/schemas/growth-change-events";

const events = vi.hoisted(() => ({
  recordManualEvent:
    vi.fn<(input: RecordManualGrowthChangeEventInput) => Promise<unknown>>(),
}));

vi.mock("./GrowthChangeEventsService", () => ({
  GrowthChangeEventsService: events,
}));

import { GrowthRecordChangeService } from "./GrowthRecordChangeService";

const request = {
  projectId: "project_1",
  requestKey: "11111111-1111-4111-8111-111111111111",
  changeType: "content_updated" as const,
  description: "Updated the pricing page.",
  happenedAt: "2026-01-15T10:30:00+01:00",
  urls: ["https://example.com/pricing?utm_source=retry#details"],
};

const graph = {
  event: {
    id: "event_1",
    projectId: "project_1",
    creationKey: "private-key",
    factHash: "private-hash",
    source: "manual" as const,
    changeType: "content_updated" as const,
    actorType: "agent" as const,
    actorId: "private-actor",
    description: "Updated the pricing page.",
    happenedAt: "2026-01-15T09:30:00.000Z",
    externalRef: null,
    createdAt: "2026-01-15 09:31:00",
  },
  urls: ["https://example.com/pricing"],
  actionIds: [],
};

const auth = { userId: "user_1", clientId: "client_1" };

beforeEach(() => {
  vi.resetAllMocks();
  events.recordManualEvent.mockResolvedValue(graph);
});

describe("GrowthRecordChangeService", () => {
  it("derives immutable provenance and returns only the shared safe projection", async () => {
    const change = await GrowthRecordChangeService.recordChange(request, auth);

    const recorded = events.recordManualEvent.mock.calls[0]?.[0];
    if (!recorded) throw new Error("Expected a Change Event write");
    expect(recorded.creationKey).toMatch(/^mcp-change:[a-f0-9]{64}$/);
    expect(recorded).toEqual({
      projectId: "project_1",
      creationKey: recorded.creationKey,
      changeType: "content_updated",
      actorType: "agent",
      actorId: 'mcp:["user_1","client_1"]',
      description: "Updated the pricing page.",
      happenedAt: "2026-01-15T10:30:00+01:00",
      urls: ["https://example.com/pricing?utm_source=retry#details"],
    });
    expect(change).toEqual({
      id: "event_1",
      source: "manual",
      changeType: "content_updated",
      description: "Updated the pricing page.",
      descriptionRedacted: false,
      descriptionTruncated: false,
      happenedAt: "2026-01-15T09:30:00.000Z",
      recordedAt: "2026-01-15T09:31:00.000Z",
      urlCount: 1,
      displayUrls: [
        {
          value: "https://example.com/pricing",
          queryOrFragmentOmitted: false,
          withheld: false,
        },
      ],
      displayUrlsOmitted: false,
      displayUrlsWithheld: false,
    });
    expect(JSON.stringify(change)).not.toMatch(
      /private-key|private-hash|private-actor|actionIds/,
    );
  });

  it("uses a stable principal-namespaced replay key and separates clients", async () => {
    await GrowthRecordChangeService.recordChange(request, auth);
    await GrowthRecordChangeService.recordChange(request, auth);
    await GrowthRecordChangeService.recordChange(request, {
      ...auth,
      clientId: "client_2",
    });

    const calls = events.recordManualEvent.mock.calls.map(([input]) => input);
    expect(calls[0].creationKey).toBe(calls[1].creationKey);
    expect(calls[2].creationKey).not.toBe(calls[0].creationKey);
  });

  it("keeps delimiter-bearing authenticated principals in separate namespaces", async () => {
    await GrowthRecordChangeService.recordChange(request, {
      userId: "user:one",
      clientId: "client",
    });
    await GrowthRecordChangeService.recordChange(request, {
      userId: "user",
      clientId: "one:client",
    });

    const calls = events.recordManualEvent.mock.calls.map(([input]) => input);
    expect(calls[0].actorId).not.toBe(calls[1].actorId);
    expect(calls[0].creationKey).not.toBe(calls[1].creationKey);
  });

  it("bounds a long authenticated principal with a stable digest", async () => {
    const longAuth = {
      userId: "u".repeat(180),
      clientId: "c".repeat(180),
    };

    await GrowthRecordChangeService.recordChange(request, longAuth);

    const input = events.recordManualEvent.mock.calls[0]?.[0];
    if (!input) throw new Error("Expected a Change Event write");
    expect(input.actorId).toMatch(/^mcp:[a-f0-9]{64}$/);
    expect(input.actorId.length).toBeLessThanOrEqual(200);
    expect(input.creationKey.length).toBeLessThanOrEqual(200);
  });

  it("rejects a future supplied timestamp before deriving or writing", async () => {
    await expect(
      GrowthRecordChangeService.recordChange(
        {
          ...request,
          happenedAt: new Date(Date.now() + 60_000).toISOString(),
        },
        auth,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(events.recordManualEvent).not.toHaveBeenCalled();
  });

  it("redacts narrative material, limits display URLs, and checks the complete graph", async () => {
    const secret = "RECORD_CHANGE_SECRET_7812";
    events.recordManualEvent.mockResolvedValue({
      ...graph,
      event: {
        ...graph.event,
        description: `api_key=${secret}; contact owner@example.com`,
      },
      urls: [
        "https://example.com/a",
        "https://example.com/b",
        "https://example.com/c",
        "https://example.com/d",
        "https://example.com/e",
        "https://user:secret@example.com/private",
      ],
    });

    const change = await GrowthRecordChangeService.recordChange(request, auth);

    expect(change).toMatchObject({
      description: "[redacted: recognised credential material]",
      descriptionRedacted: true,
      urlCount: 6,
      displayUrlsOmitted: true,
      displayUrlsWithheld: true,
    });
    expect(change.displayUrls).toHaveLength(5);
    expect(JSON.stringify(change)).not.toContain(secret);

    events.recordManualEvent.mockResolvedValue({ ...graph, urls: [] });
    await expect(
      GrowthRecordChangeService.recordChange(request, auth),
    ).rejects.toMatchObject({ code: "INTERNAL_ERROR" });

    events.recordManualEvent.mockResolvedValue({
      ...graph,
      event: { ...graph.event, source: "deployment" },
    });
    await expect(
      GrowthRecordChangeService.recordChange(request, auth),
    ).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
  });

  it("preserves domain-validation and immutable-retry errors from the Change Event boundary", async () => {
    events.recordManualEvent.mockRejectedValueOnce(
      new AppError(
        "VALIDATION_ERROR",
        "Targets must belong to the project domain",
      ),
    );
    await expect(
      GrowthRecordChangeService.recordChange(request, auth),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    events.recordManualEvent.mockRejectedValueOnce(new AppError("CONFLICT"));
    await expect(
      GrowthRecordChangeService.recordChange(request, auth),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
