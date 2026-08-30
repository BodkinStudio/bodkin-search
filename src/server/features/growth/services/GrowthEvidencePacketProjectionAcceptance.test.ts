import { describe, expect, it, vi } from "vitest";
import { buildGrowthEvidencePacket } from "./GrowthEvidencePacket";

function source() {
  return {
    organizationId: "org_projection",
    project: {
      id: "project_projection",
      organizationId: "org_projection",
      name: "Projection fixture",
    },
    signal: {
      id: "signal_projection",
      projectId: "project_projection",
      runId: "run_projection",
      signalType: "priority_page_click_decline",
      entityType: "key_page",
      entityRef: "page_projection",
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
      id: "run_projection",
      projectId: "project_projection",
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
          id: "page_projection",
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
    selectedEventIds: ["event_projection"],
    selectionProvided: true,
    events: [
      {
        event: {
          id: "event_projection",
          projectId: "project_projection",
          changeType: "content_updated",
          source: "manual",
          description: "Changed the page",
          happenedAt: "2026-06-15T12:00:00.000Z",
        },
        urls: ["https://example.com/pricing"],
      },
    ],
  };
}

describe("BG-0204 independent safe-projection acceptance", () => {
  it.each(["name", "topic", "notes", "section", "event"] as const)(
    "redacts and discloses a credential in %s",
    async (field) => {
      const input = source();
      const credential = '"refresh_token": "PROJECTION_CANARY_6725"';
      if (field === "name") input.project.name = credential;
      if (field === "topic") input.context.keyPages[0].topic = credential;
      if (field === "notes") input.context.keyPages[0].notes = credential;
      if (field === "section") input.context.sections[0].content = credential;
      if (field === "event") input.events[0].event.description = credential;
      const packet = await buildGrowthEvidencePacket(input);
      const flags = {
        name: packet.currentCommercialContext.projectNameRedacted,
        topic: packet.subject.topicRedacted,
        notes: packet.subject.notesRedacted,
        section: packet.currentCommercialContext.sections[0].redacted,
        event: packet.selectedChangeEvents.events[0].descriptionRedacted,
      };
      expect(flags[field]).toBe(true);
      expect(JSON.stringify(packet)).not.toContain("PROJECTION_CANARY_6725");
    },
  );

  it.each([
    '"aPi_KeY": "DUMMY_CREDENTIAL_7153"',
    '"access_token": "DUMMY_CREDENTIAL_7153"',
    '"refresh-token": "DUMMY_CREDENTIAL_7153"',
    '"id_token": "DUMMY_CREDENTIAL_7153"',
    '"client_secret": "DUMMY_CREDENTIAL_7153"',
    '"PASSWORD": "DUMMY_CREDENTIAL_7153"',
    '"Authorization": "DUMMY_CREDENTIAL_7153"',
    "Basic DUMMY_CREDENTIAL_7153",
    "bEaReR DUMMY_CREDENTIAL_7153",
    "sk-DUMMY_CREDENTIAL_7153",
    "pk_DUMMY_CREDENTIAL_7153",
    "ghp_DUMMY_CREDENTIAL_7153",
    "github_pat_DUMMY_CREDENTIAL_7153",
    "xoxb-DUMMY_CREDENTIAL_7153",
    "xoxp-DUMMY_CREDENTIAL_7153",
    "xoxa-DUMMY_CREDENTIAL_7153",
    "xoxr-DUMMY_CREDENTIAL_7153",
    "xoxs-DUMMY_CREDENTIAL_7153",
    "AIzaDUMMY_CREDENTIAL_7153",
    "AKIADUMMY_CREDENTIAL_7153",
    "eyJhbGciOiJub25lIn0.eyJkdW1teSI6dHJ1ZX0.dummy_signature",
    "-----BEGIN PRIVATE KEY-----\nDUMMY_CREDENTIAL_7153\n-----END PRIVATE KEY-----",
    "-----BEGIN EC PRIVATE KEY-----\nDUMMY_CREDENTIAL_7153",
    "https://user:DUMMY_CREDENTIAL_7153@example.com/private",
  ])("redacts the declared late credential family: %s", async (credential) => {
    const input = source();
    input.context.sections[0].content = `${"p".repeat(3_800)} ${credential}`;
    const packet = await buildGrowthEvidencePacket(input);
    expect(packet.currentCommercialContext.sections[0]).toMatchObject({
      content: "[redacted: recognised credential material]",
      redacted: true,
      truncated: false,
    });
    expect(JSON.stringify(packet)).not.toContain(credential);
    expect(JSON.stringify(packet)).not.toContain("DUMMY_CREDENTIAL_7153");
  });

  it("discloses email-expansion truncation and bounded notes without hiding canonical facts", async () => {
    const input = source();
    input.project.name = Array.from({ length: 17 }, () => "a@b.co").join(" ");
    input.context.keyPages[0].topic = Array.from(
      { length: 28 },
      () => "a@b.co",
    ).join(" ");
    input.context.keyPages[0].notes = "n".repeat(500);
    const packet = await buildGrowthEvidencePacket(input);
    expect(packet.currentCommercialContext).toMatchObject({
      projectNameRedacted: true,
      projectNameTruncated: true,
    });
    expect(packet.subject).toMatchObject({
      topicRedacted: true,
      topicTruncated: true,
      notesRedacted: false,
      notesTruncated: true,
    });
    expect(
      packet.currentCommercialContext.projectName.length,
    ).toBeLessThanOrEqual(200);
    expect(packet.subject.topic?.length).toBeLessThanOrEqual(200);
    expect(packet.subject.notes?.length).toBe(400);
    expect(JSON.stringify(packet)).not.toContain("a@b.co");
    expect(packet.observation.deltaClicks).toBe(-40);
  });

  it("hashes only the final safe projection of secrets and URL query values", async () => {
    const input = source();
    input.context.sections[0].content = "api_key=FIRST_HIDDEN_CANARY_682";
    input.context.keyPages[0].url += "?plan=FIRST_QUERY_CANARY_901";
    const first = await buildGrowthEvidencePacket(input);
    input.context.sections[0].content = "api_key=SECOND_HIDDEN_CANARY_715";
    input.context.keyPages[0].url =
      "https://example.com/pricing?plan=SECOND_QUERY_CANARY_489";
    const second = await buildGrowthEvidencePacket(input);
    expect(second).toEqual(first);
    for (const canary of [
      "FIRST_HIDDEN_CANARY_682",
      "SECOND_HIDDEN_CANARY_715",
      "FIRST_QUERY_CANARY_901",
      "SECOND_QUERY_CANARY_489",
    ])
      expect(JSON.stringify(second)).not.toContain(canary);
    input.context.sections[0].content = "Now public context";
    expect((await buildGrowthEvidencePacket(input)).packetReference).not.toBe(
      first.packetReference,
    );
  });

  it("keeps consistent changed numeric facts in the reference", async () => {
    const input = source();
    const first = await buildGrowthEvidencePacket(input);
    input.signal.currentValue = 50;
    input.signal.deltaValue = -50;
    input.signal.deltaPercent = -50;
    const second = await buildGrowthEvidencePacket(input);
    expect(second.observation).toMatchObject({
      currentClicks: 50,
      deltaClicks: -50,
      deltaPercent: -50,
    });
    expect(second.packetReference).not.toBe(first.packetReference);
  });

  it("canonicalises equivalent valid timestamp offsets without changing the reference", async () => {
    const input = source();
    const first = await buildGrowthEvidencePacket(input);
    input.signal.capturedAt = "2026-07-03T13:00:00+01:00";
    input.assembledAt = "2026-07-04T13:00:00+01:00";
    const second = await buildGrowthEvidencePacket(input);
    expect(second).toEqual(first);
  });

  it("rejects hour-24 rollover forbidden by the source timestamp contract", async () => {
    const input = source();
    input.signal.capturedAt = "2026-07-03T24:00:00.000Z";
    await expect(buildGrowthEvidencePacket(input)).rejects.toThrow();
  });

  it("accepts valid fractional precision supported by the source timestamp contract", async () => {
    const input = source();
    input.signal.capturedAt = "2026-07-03T12:00:00.1Z";
    const packet = await buildGrowthEvidencePacket(input);
    expect(packet.observation.capturedAt).toBe("2026-07-03T12:00:00.100Z");
  });

  it("does not consult the wall clock while projecting explicit source times", async () => {
    const input = source();
    const now = vi.spyOn(Date, "now").mockImplementation(() => {
      throw new Error("The pure builder must not read the clock");
    });
    try {
      const packet = await buildGrowthEvidencePacket(input);
      expect(packet.assembledAt).toBe(input.assembledAt);
    } finally {
      now.mockRestore();
    }
  });

  it("is stable across context reordering and ignores other key-page prose", async () => {
    const input = source();
    input.context.sections.push({
      key: "current_goal",
      content: "Grow qualified enquiries",
      updatedAt: input.assembledAt,
    });
    input.context.keyPages.push({
      ...input.context.keyPages[0],
      id: "page_unrelated",
      url: "https://example.com/unrelated",
      notes: "OTHER_PAGE_CANARY_2439",
    });
    const first = await buildGrowthEvidencePacket(input);
    input.context.sections.reverse();
    input.context.keyPages.reverse();
    const second = await buildGrowthEvidencePacket(input);
    expect(second).toEqual(first);
    expect(JSON.stringify(second)).not.toContain("OTHER_PAGE_CANARY_2439");
  });

  it("rejects ambiguous selected context sections instead of choosing by input order", async () => {
    const input = source();
    input.context.sections.push({
      ...input.context.sections[0],
      content: "Contradictory current business context",
    });
    await expect(buildGrowthEvidencePacket(input)).rejects.toThrow();
  });

  it("rejects agreeing but noncanonical stored project IDs instead of trimming them", async () => {
    const input = source();
    input.project.id += " ";
    input.signal.projectId += " ";
    input.run.projectId += " ";
    input.events[0].event.projectId += " ";
    await expect(buildGrowthEvidencePacket(input)).rejects.toThrow();
  });

  it("accepts duplicate selected IDs only with one graph and honest coverage", async () => {
    const input = source();
    input.selectedEventIds.push(input.selectedEventIds[0]);
    expect(
      (await buildGrowthEvidencePacket(input)).selectedChangeEvents,
    ).toMatchObject({
      coverage: "caller_selected",
      selectedCount: 1,
      includedCount: 1,
      omittedIrrelevantCount: 0,
    });
    input.selectionProvided = false;
    await expect(buildGrowthEvidencePacket(input)).rejects.toThrow();
  });

  it.each(["version", "metric", "evidenceKind", "evidenceRef"])(
    "rejects unsupported stored %s",
    async (field) => {
      const input = source();
      if (field === "version")
        input.run.detectorVersion = "priority-page-click-decline-v2";
      if (field === "metric") input.signal.metric = "gsc_impressions";
      if (field === "evidenceKind")
        input.signal.evidenceKind = "provider_payload";
      if (field === "evidenceRef")
        input.signal.evidenceRef = "gsc:opaque_unverified_reference";
      await expect(buildGrowthEvidencePacket(input)).rejects.toThrow();
    },
  );

  it.each([NaN, Infinity, -1, Number.MAX_SAFE_INTEGER + 1])(
    "rejects unsafe current count %s",
    async (current) => {
      const input = source();
      input.signal.currentValue = current;
      input.signal.deltaValue = current - input.signal.baselineValue;
      input.signal.deltaPercent = input.signal.deltaValue;
      await expect(buildGrowthEvidencePacket(input)).rejects.toThrow();
    },
  );

  it("rejects an assembly time before capture", async () => {
    const input = source();
    input.assembledAt = "2026-07-03T11:59:59.999Z";
    await expect(buildGrowthEvidencePacket(input)).rejects.toThrow();
  });

  it.each([
    "name",
    "subject_url",
    "event_url",
    "event_url_count",
    "key_page_count",
  ])("bounds raw %s before projection", async (field) => {
    const input = source();
    if (field === "name") input.project.name = "n".repeat(121);
    if (field === "subject_url")
      input.context.keyPages[0].url = `https://example.com/${"p".repeat(2_048)}`;
    if (field === "event_url")
      input.events[0].urls = [`https://example.com/${"p".repeat(2_000)}`];
    if (field === "event_url_count")
      input.events[0].urls = Array.from(
        { length: 101 },
        (_, index) => `https://example.com/page-${index}`,
      );
    if (field === "key_page_count")
      input.context.keyPages = Array.from({ length: 101 }, (_, index) => ({
        ...input.context.keyPages[0],
        id: index === 0 ? input.signal.entityRef : `page_${index}`,
      }));
    await expect(buildGrowthEvidencePacket(input)).rejects.toThrow();
  });
});
