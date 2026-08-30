import { describe, expect, it } from "vitest";
import {
  buildGrowthEvidencePacketSchema,
  type BuildGrowthEvidencePacketInput,
} from "@/types/schemas/growth-evidence-packet";
import { buildGrowthEvidencePacket } from "./GrowthEvidencePacket";

function source(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: "org_1",
    project: { id: "project_1", name: "Example Ltd" },
    signal: {
      id: "signal_1",
      projectId: "project_1",
      runId: "run_1",
      signalType: "priority_page_click_decline",
      entityType: "key_page",
      entityRef: "page_1",
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
      id: "run_1",
      projectId: "project_1",
      detectorVersion: "priority-page-click-decline-v1",
    },
    context: {
      sections: [
        {
          key: "business_overview",
          content: "Useful business",
          updatedAt: "2026-07-01T00:00:00.000Z",
        },
        {
          key: "writing_preferences",
          content: "CANARY_SHOULD_NOT_APPEAR",
          updatedAt: "2026-07-01T00:00:00.000Z",
        },
      ],
      keyPages: [
        {
          id: "page_1",
          url: "https://example.com/pricing/?preview=1#x",
          role: "money" as const,
          topic: "Pricing",
          notes: "Call sales@example.com",
          commercialWeight: 5,
          protected: true,
          activelyOptimized: false,
          updatedAt: "2026-07-01T00:00:00.000Z",
        },
      ],
    },
    assembledAt: "2026-07-04T00:00:00.000Z",
    selectedEventIds: ["event_2", "event_1"],
    selectionProvided: true,
    events: [
      {
        event: {
          id: "event_2",
          projectId: "project_1",
          changeType: "content_updated",
          source: "manual",
          description: "Unrelated",
          happenedAt: "2026-06-15T07:00:00.000Z",
        },
        urls: ["https://example.com/other"],
      },
      {
        event: {
          id: "event_1",
          projectId: "project_1",
          changeType: "content_updated",
          source: "manual",
          description: "Updated: Bearer SECRET_SHOULD_NOT_LEAK",
          happenedAt: "2026-06-14T07:00:00.000Z",
        },
        urls: ["https://example.com/pricing"],
      },
    ],
    ...overrides,
  };
}

describe("buildGrowthEvidencePacket", () => {
  it("keeps the composition request internal and bounded", () => {
    const request: BuildGrowthEvidencePacketInput = {
      organizationId: "org_1",
      projectId: "project_1",
      signalId: "signal_1",
      assembledAt: "2026-07-04T00:00:00.000Z",
      knownChangeEventIds: ["event_1"],
    };
    expect(buildGrowthEvidencePacketSchema.parse(request)).toEqual(request);
  });

  it("keeps canonical facts separate, projects only safe current context, and is reorder stable", async () => {
    const first = await buildGrowthEvidencePacket(source());
    const second = await buildGrowthEvidencePacket(
      source({
        selectedEventIds: ["event_1", "event_2"],
        events: source().events.toReversed(),
      }),
    );
    expect(first).toEqual(second);
    expect(first.observation).toMatchObject({
      baselineClicks: 100,
      currentClicks: 60,
      deltaClicks: -40,
      baselinePeriod: {
        startDate: "2026-06-01",
        endDate: "2026-06-14",
        derivation: "preceding_equal_length_v1",
      },
    });
    expect(first.subject.displayUrl).toBe("https://example.com/pricing/");
    expect(first.subject.notes).toBe("Call [email omitted]");
    expect(first.selectedChangeEvents).toMatchObject({
      coverage: "caller_selected",
      includedCount: 1,
      omittedIrrelevantCount: 1,
    });
    expect(first.selectedChangeEvents.events[0]).toMatchObject({
      id: "event_1",
      descriptionRedacted: true,
      match: "normalised_url_candidate",
    });
    expect(JSON.stringify(first)).not.toContain("SECRET_SHOULD_NOT_LEAK");
    expect(JSON.stringify(first)).not.toContain("CANARY_SHOULD_NOT_APPEAR");
  });

  it("rejects canonical numeric contradictions and unavailable subjects", async () => {
    await expect(
      buildGrowthEvidencePacket(
        source({ signal: { ...source().signal, deltaValue: -39 } }),
      ),
    ).rejects.toThrow("contradict");
    await expect(
      buildGrowthEvidencePacket(
        source({ context: { ...source().context, keyPages: [] } }),
      ),
    ).rejects.toThrow("missing or ambiguous");
  });

  it.each([
    "api_key: VALUE_SHOULD_NOT_LEAK",
    "Authorization: Bearer VALUE_SHOULD_NOT_LEAK",
    "eyJhbGciOiJIUzI1NiJ9.payload.signature",
    "-----BEGIN PRIVATE KEY-----\nVALUE_SHOULD_NOT_LEAK",
    "https://user:VALUE_SHOULD_NOT_LEAK@example.com",
  ])("redacts recognisable sensitive narrative: %s", async (description) => {
    const input = source();
    const event = input.events[1];
    const result = await buildGrowthEvidencePacket(
      source({
        selectedEventIds: ["event_1"],
        events: [{ ...event, event: { ...event.event, description } }],
      }),
    );
    expect(JSON.stringify(result)).not.toContain("VALUE_SHOULD_NOT_LEAK");
  });
});
