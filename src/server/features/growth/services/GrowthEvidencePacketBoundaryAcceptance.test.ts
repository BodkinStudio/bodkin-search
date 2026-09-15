import { describe, expect, it } from "vitest";
import { buildGrowthEvidencePacket } from "./GrowthEvidencePacket";

function source() {
  return {
    organizationId: "org_boundary",
    project: {
      id: "project_boundary",
      organizationId: "org_boundary",
      name: "Boundary fixture",
    },
    signal: {
      id: "signal_boundary",
      projectId: "project_boundary",
      runId: "run_boundary",
      signalType: "priority_page_click_decline",
      entityType: "key_page",
      entityRef: "page_boundary",
      metric: "gsc_clicks",
      periodStart: "2026-06-15",
      periodEnd: "2026-06-28",
      baselineValue: 100,
      currentValue: 60,
      deltaValue: -40,
      deltaPercent: -40,
      evidenceKind: "gsc_period",
      evidenceRef: `gsc:${"a".repeat(64)}`,
      capturedAt: "2026-07-03T12:00:00.000Z",
    },
    run: {
      id: "run_boundary",
      projectId: "project_boundary",
      detectorVersion: "priority-page-click-decline-v1",
    },
    context: {
      sections: [
        {
          key: "business_overview",
          content: "Business context",
          updatedAt: "2026-07-03T12:00:00.000Z",
        },
      ],
      keyPages: [
        {
          id: "page_boundary",
          url: "https://example.com/pricing",
          role: "money" as const,
          topic: "Pricing",
          notes: "Compare the plans",
          commercialWeight: 3,
          protected: false,
          activelyOptimized: true,
          updatedAt: "2026-07-03T12:00:00.000Z",
        },
      ],
    },
    assembledAt: "2026-07-04T12:00:00.000Z",
    selectedEventIds: [] as string[],
    selectionProvided: false,
    events: [] as ReturnType<typeof change>[],
  };
}

function change(id: string) {
  return {
    event: {
      id,
      projectId: "project_boundary",
      changeType: "content_updated",
      source: "manual",
      description: "Changed the page",
      happenedAt: "2026-06-15T12:00:00.000Z",
    },
    urls: ["https://example.com/pricing"],
  };
}

function select(ids: string[]) {
  return {
    ...source(),
    selectedEventIds: ids,
    selectionProvided: true,
    events: ids.map(change),
  };
}

describe("BG-0204 independent boundary acceptance", () => {
  it("checks the exact three-day Pacific source lag boundary", async () => {
    const input = source();
    input.signal.capturedAt = "2026-07-01T06:59:59.000Z";
    await expect(buildGrowthEvidencePacket(input)).rejects.toThrow();
    input.signal.capturedAt = "2026-07-01T07:00:00.000Z";
    await expect(buildGrowthEvidencePacket(input)).resolves.toMatchObject({
      observation: { capturedAt: input.signal.capturedAt },
    });
  });

  it.each([
    ["2026-01-01", "2026-01-01", "2025-12-31", "2025-12-31"],
    ["2024-03-01", "2024-03-01", "2024-02-29", "2024-02-29"],
    ["2026-01-01", "2026-02-14", "2025-11-17", "2025-12-31"],
  ])(
    "derives bounded calendar windows for %s through %s",
    async (startDate, endDate, baselineStart, baselineEnd) => {
      const input = source();
      input.signal.periodStart = startDate;
      input.signal.periodEnd = endDate;
      const packet = await buildGrowthEvidencePacket(input);
      expect(packet.observation.baselinePeriod).toEqual({
        startDate: baselineStart,
        endDate: baselineEnd,
        derivation: "preceding_equal_length_v1",
      });
    },
  );

  it.each([
    ["2026-01-01", "2026-02-15"],
    ["2026-02-30", "2026-03-01"],
    ["2026-06-30", "2026-06-01"],
  ])(
    "rejects invalid or overlong windows %s through %s",
    async (start, end) => {
      const input = source();
      input.signal.periodStart = start;
      input.signal.periodEnd = end;
      await expect(buildGrowthEvidencePacket(input)).rejects.toThrow();
    },
  );

  it.each(["2026-09-31T12:00:00.000Z", "2026-07-03T12:00:00"])(
    "rejects malformed or timezone-less stored capture time %s",
    async (capturedAt) => {
      const input = source();
      input.signal.capturedAt = capturedAt;
      input.assembledAt = "2026-10-04T12:00:00.000Z";
      await expect(buildGrowthEvidencePacket(input)).rejects.toThrow();
    },
  );

  it.each([100, 120])(
    "rejects a non-decline with current clicks %i",
    async (current) => {
      const input = source();
      input.signal.currentValue = current;
      input.signal.deltaValue = current - 100;
      input.signal.deltaPercent = current - 100;
      await expect(buildGrowthEvidencePacket(input)).rejects.toThrow();
    },
  );

  it("is stable when Unicode event IDs collate equally", async () => {
    const input = select(["é", "e\u0301"]);
    const first = await buildGrowthEvidencePacket(input);
    const second = await buildGrowthEvidencePacket({
      ...input,
      selectedEventIds: input.selectedEventIds.toReversed(),
      events: input.events.toReversed(),
    });
    expect(second).toEqual(first);
    expect(first.selectedChangeEvents.events.map(({ id }) => id)).toEqual(
      input.selectedEventIds.toSorted(),
    );
  });

  it("rejects selected graphs that are missing rather than calling them irrelevant", async () => {
    await expect(
      buildGrowthEvidencePacket({
        ...select(["missing"]),
        events: [],
      }),
    ).rejects.toThrow();
  });

  it("rejects duplicate graphs instead of inflating coverage", async () => {
    await expect(
      buildGrowthEvidencePacket({
        ...select(["event_a", "event_b"]),
        events: [change("event_a"), change("event_a")],
      }),
    ).rejects.toThrow();
  });

  it.each(["source", "changeType"] as const)(
    "rejects unrecognised structured event %s instead of emitting free text",
    async (field) => {
      const input = select(["event_a"]);
      input.events[0].event[field] = "ghp_METADATA_CANARY_391";
      await expect(buildGrowthEvidencePacket(input)).rejects.toThrow();
    },
  );

  it("withholds recognisable credential material in a display URL path", async () => {
    const input = source();
    input.context.keyPages[0].url =
      "https://example.com/ghp_SECRET_IN_PATH_448";
    const packet = await buildGrowthEvidencePacket(input);
    expect(packet.subject.displayUrl).toBeNull();
    expect(JSON.stringify(packet)).not.toContain("SECRET_IN_PATH_448");
  });

  it.each([
    ["topic", 201],
    ["notes", 501],
  ] as const)("enforces the existing raw %s bound", async (field, length) => {
    const input = source();
    input.context.keyPages[0][field] = "x".repeat(length);
    await expect(buildGrowthEvidencePacket(input)).rejects.toThrow();
  });

  it("accepts ten selected events with bounded Unicode and rejects an oversized UTF-8 packet", async () => {
    const input = select(
      Array.from({ length: 10 }, (_, index) => `event_${index}`),
    );
    input.context.sections = [
      "business_overview",
      "current_goal",
      "positioning",
    ].map((key) => ({
      key,
      content: "漢".repeat(4_000),
      updatedAt: input.assembledAt,
    }));
    input.context.keyPages[0].topic = "漢".repeat(200);
    input.context.keyPages[0].notes = "漢".repeat(500);
    for (const graph of input.events)
      graph.event.description = "漢".repeat(4_000);
    const packet = await buildGrowthEvidencePacket(input);
    expect(packet.selectedChangeEvents.includedCount).toBe(10);
    expect(
      new TextEncoder().encode(JSON.stringify(packet)).byteLength,
    ).toBeLessThanOrEqual(32_768);
    expect(
      packet.currentCommercialContext.sections.every(
        ({ truncated }) => truncated,
      ),
    ).toBe(true);
    // JSON escapes these characters to six bytes each, so character caps alone are insufficient.
    for (const row of input.context.sections)
      row.content = "\u0001".repeat(4_000);
    for (const graph of input.events)
      graph.event.description = "\u0001".repeat(4_000);
    await expect(buildGrowthEvidencePacket(input)).rejects.toThrow(
      /UTF-8 byte limit/,
    );
  });
});
