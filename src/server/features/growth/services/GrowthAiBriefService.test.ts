import type { GrowthAiBrief } from "@/types/schemas/growth-investigations";
import { describe, expect, it, vi } from "vitest";

vi.mock("./GrowthAssessmentsService", () => ({
  GrowthAssessmentsService: {
    requireReadyForPage: vi.fn(async () => ({
      assessment: {
        id: "assessment_1",
        version: 1,
        objective: "Increase qualified enquiries",
        market: "US",
        audience: "IT buyers",
        successMeasure: "Qualified enquiries",
        comparisonRationale: "This page supports the agreed objective",
      },
      selected: {
        title: "Investigate pricing",
        businessRelevance: "Help buyers evaluate",
        observation: "Saved evidence",
        evidenceSource: "Saved report",
        evidenceDate: "2026-09-09",
        evidenceScope: "US",
        uncertainty: "No causal evidence",
        nextValidation: "Validate enquiry baseline",
      },
      page: { url: "https://example.com/pricing" },
    })),
  },
}));

vi.mock("@/server/billing/subscription", () => ({
  assertUsageCreditsAvailable: vi.fn(),
  trackUsageCreditSpend: vi.fn(),
}));
vi.mock("@/server/lib/openrouter", () => ({ getChatAgentModel: vi.fn() }));
vi.mock("./GrowthEvidencePacketService", () => ({
  assembleGrowthEvidencePacket: vi.fn(),
}));
vi.mock("./GrowthAiBriefProposalsService", () => ({
  persistGeneratedGrowthAiBrief: vi.fn(),
  getGrowthAiBrief: vi.fn(),
}));
vi.mock("./GrowthInvestigationsService", () => ({
  GrowthInvestigationsService: { getInvestigation: vi.fn() },
}));
vi.mock("../../project-context/services/ProjectContextService", () => ({
  getProjectContext: vi.fn(),
}));
vi.mock("@/server/lib/scrape", () => ({ readPages: vi.fn() }));

import { generateGrowthAiBrief } from "./GrowthAiBriefService";
import { GrowthAssessmentsService } from "./GrowthAssessmentsService";

const brief = {
  businessRelevance: "The saved decline affects a commercially important page.",
  observations: [
    {
      statement: "Clicks declined in the saved comparison.",
      citationIds: ["saved_priority_page_click_decline"],
    },
  ],
  hypotheses: [
    {
      statement: "Search intent may no longer match the page.",
      confidence: "low" as const,
      citationIds: ["saved_priority_page_click_decline"],
    },
  ],
  proposedSteps: ["Investigate intent before making page changes."],
  measurementApproach: "Compare clicks in the next matching period.",
  caveats: ["The saved evidence does not establish causality."],
};

const packet = {
  source: { detectorVersion: "priority-page-click-decline-v1" },
  subject: {
    displayUrl: "https://example.com/pricing",
    role: "money",
    topic: "Pricing",
  },
  observation: {
    currentPeriod: { startDate: "2026-08-01", endDate: "2026-08-28" },
    baselinePeriod: { startDate: "2026-07-04", endDate: "2026-07-31" },
    baselineClicks: 100,
    currentClicks: 60,
    deltaClicks: -40,
    deltaPercent: -40,
  },
  currentCommercialContext: {
    sections: [{ key: "business_overview", content: "B2B pricing software." }],
  },
};

function dependencies() {
  return {
    getInvestigation: vi.fn().mockResolvedValue({
      relationship: "controller",
      status: "proposed",
      templateVersion: "priority-page-investigation-v1",
    }),
    assemblePacket: vi.fn().mockResolvedValue(packet),
    getProjectContext: vi.fn(),
    readPage: vi.fn().mockResolvedValue({
      pages: [
        {
          url: "https://example.com/pricing",
          title: "Pricing",
          text: "Current pricing page text",
        },
      ],
      blocked: false,
    }),
    generate: vi.fn().mockResolvedValue({
      object: brief,
      modelId: "fixture/model",
      providerMetadata: { openrouter: { usage: { cost: 0.01 } } },
    }),
    hostedMode: vi.fn().mockResolvedValue(true),
    assertCredits: vi.fn().mockResolvedValue({ monthlyRemaining: 10 }),
    meter: vi.fn().mockResolvedValue(undefined),
    assertProviderConfigured: vi.fn().mockResolvedValue(undefined),
    getSaved: vi.fn().mockResolvedValue(null),
    persist: vi
      .fn()
      .mockImplementation(({ generated }: { generated: GrowthAiBrief }) =>
        Promise.resolve({ generated }),
      ),
    now: () => "2026-09-06T12:00:00.000Z",
  };
}

const request = {
  organizationId: "org_authorized",
  projectId: "project_authorized",
  signalId: "signal_1",
  userId: "user_1",
  userEmail: "person@example.com",
};

function firstGeneratedPrompt(calls: unknown[][]) {
  const input = calls[0]?.[0];
  if (typeof input !== "object" || input === null || !("prompt" in input))
    throw new Error("Expected the AI generator to receive a prompt");
  const prompt = input.prompt;
  if (typeof prompt !== "string")
    throw new Error("Expected the AI generator prompt to be a string");
  return prompt;
}

describe("generateGrowthAiBrief", () => {
  it("uses only canonical project evidence, reads the exact page, and returns an ephemeral cited brief", async () => {
    const deps = dependencies();
    const result = await generateGrowthAiBrief(request, deps);

    expect(deps.assemblePacket).toHaveBeenCalledWith({
      organizationId: request.organizationId,
      projectId: request.projectId,
      signalId: request.signalId,
      assembledAt: "2026-09-06T12:00:00.000Z",
    });
    expect(deps.readPage).toHaveBeenCalledWith("https://example.com/pricing");
    expect(result).toMatchObject({
      generated: {
        kind: "growth_ai_brief",
        currentPageRead: { status: "read" },
        citations: [
          {
            id: "saved_priority_page_click_decline",
            source: "historical_saved_evidence",
          },
          { id: "current_project_context", source: "current_project_context" },
          { id: "current_page_read", source: "current_page_read" },
        ],
      },
    });
    expect(deps.meter).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: request.organizationId,
        creditFeature: "agent",
        costUsd: 0.01,
      }),
    );
  });

  it("discloses an unreadable page rather than claiming it inspected one", async () => {
    const deps = dependencies();
    deps.readPage.mockResolvedValue({ pages: [], blocked: true });
    const result = await generateGrowthAiBrief(request, deps);
    expect(result.generated.currentPageRead).toEqual({ status: "unavailable" });
    const prompt = firstGeneratedPrompt(deps.generate.mock.calls);
    expect(prompt).toContain('"pageReadStatus":"unavailable"');
  });

  it("discloses missing or blank current business context deterministically", async () => {
    const deps = dependencies();
    deps.assemblePacket.mockResolvedValue({
      ...packet,
      currentCommercialContext: {
        sections: [
          { key: "business_overview", content: "   " },
          { key: "current_goal", content: null },
        ],
      },
    });
    const result = await generateGrowthAiBrief(request, deps);
    expect(result.generated.currentBusinessContext).toBe("missing");
    expect(result.generated.citations).not.toContainEqual(
      expect.objectContaining({ id: "current_project_context" }),
    );
    expect(result.generated.caveats).toContain(
      "Current business context is missing or blank, so business fit could not be assessed.",
    );
  });

  it("uses canonical striking-distance evidence without attempting the priority-page packet", async () => {
    const deps = dependencies();
    deps.getInvestigation.mockResolvedValue({
      relationship: "controller",
      status: "proposed",
      templateVersion: "striking-distance-investigation-v1",
      evidenceSummary: {
        kind: "striking_distance_query",
        query: "text free online",
        page: "https://yakchat.com/sms-for-browsers",
        site: "sc-domain:yakchat.com",
        baselinePeriod: { start: "2026-07-09", end: "2026-08-05" },
        currentPeriod: { start: "2026-08-06", end: "2026-09-02" },
        baseline: { position: 9.1, impressions: 303, clicks: 18 },
        current: { position: 13.9, impressions: 476, clicks: 20 },
      },
    });
    deps.getProjectContext.mockResolvedValue({
      sections: [
        { key: "business_overview", content: "Messaging product" },
        { key: "custom:unrelated", content: "Do not send" },
      ],
    });
    deps.generate.mockResolvedValue({
      object: {
        ...brief,
        observations: [
          {
            statement: "The query has a lower current position.",
            citationIds: ["saved_striking_distance"],
          },
        ],
        hypotheses: [
          {
            statement: "Intent may not fit the product.",
            confidence: "low",
            citationIds: ["saved_striking_distance"],
          },
        ],
      },
      modelId: "fixture/model",
      providerMetadata: { openrouter: { usage: { cost: 0.01 } } },
    });

    const result = await generateGrowthAiBrief(request, deps);
    expect(deps.assemblePacket).not.toHaveBeenCalled();
    expect(deps.readPage).toHaveBeenCalledWith(
      "https://yakchat.com/sms-for-browsers",
    );
    expect(result.generated.citations[0]).toMatchObject({
      id: "saved_striking_distance",
      source: "historical_saved_evidence",
    });
    const prompt = firstGeneratedPrompt(deps.generate.mock.calls);
    expect(prompt).not.toContain("custom:unrelated");
  });

  it("rejects a striking evidence summary under an unapproved template before page or model egress", async () => {
    const deps = dependencies();
    deps.getInvestigation.mockResolvedValue({
      relationship: "controller",
      status: "proposed",
      templateVersion: "unapproved-template-v1",
      evidenceSummary: {
        kind: "striking_distance_query",
        query: "text free online",
        page: "https://yakchat.com/sms-for-browsers",
        site: "sc-domain:yakchat.com",
        baselinePeriod: { start: "2026-07-09", end: "2026-08-05" },
        currentPeriod: { start: "2026-08-06", end: "2026-09-02" },
        baseline: { position: 9.1, impressions: 303, clicks: 18 },
        current: { position: 13.9, impressions: 476, clicks: 20 },
      },
    });
    deps.getProjectContext.mockResolvedValue({ sections: [] });
    await expect(generateGrowthAiBrief(request, deps)).rejects.toThrow(
      "priority-page click declines and striking-distance query opportunities",
    );
    expect(deps.readPage).not.toHaveBeenCalled();
    expect(deps.generate).not.toHaveBeenCalled();
    expect(deps.meter).not.toHaveBeenCalled();
  });

  it("rejects invented citations after recording the provider cost", async () => {
    const deps = dependencies();
    deps.generate.mockResolvedValue({
      object: {
        ...brief,
        observations: [
          { statement: "Unsupported claim", citationIds: ["invented"] },
        ],
      },
      modelId: "fixture/model",
      providerMetadata: { openrouter: { usage: { cost: 0.01 } } },
    });
    await expect(generateGrowthAiBrief(request, deps)).rejects.toThrow(
      "outside the server-assembled sources",
    );
    expect(deps.meter).toHaveBeenCalledTimes(1);
  });

  it("gates hosted generation before any model call when credits are unavailable", async () => {
    const deps = dependencies();
    deps.assertCredits.mockRejectedValue(new Error("insufficient credits"));
    await expect(generateGrowthAiBrief(request, deps)).rejects.toThrow(
      "insufficient credits",
    );
    expect(deps.generate).not.toHaveBeenCalled();
  });

  it("fails for a missing provider key before reading the affected page", async () => {
    const deps = dependencies();
    deps.assertProviderConfigured.mockRejectedValue(
      new Error("OPENROUTER_API_KEY is not configured"),
    );
    await expect(generateGrowthAiBrief(request, deps)).rejects.toThrow(
      "OPENROUTER_API_KEY is not configured",
    );
    expect(deps.readPage).not.toHaveBeenCalled();
  });

  it("shares same-runtime concurrent generation and meters it once", async () => {
    const deps = dependencies();
    let complete!: (value: {
      object: typeof brief;
      modelId: string;
      providerMetadata: unknown;
    }) => void;
    deps.generate.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const first = generateGrowthAiBrief(request, deps);
    const second = generateGrowthAiBrief(request, deps);
    await vi.waitFor(() => expect(deps.generate).toHaveBeenCalledTimes(1));
    complete({
      object: brief,
      modelId: "fixture/model",
      providerMetadata: { openrouter: { usage: { cost: 0.01 } } },
    });
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(deps.meter).toHaveBeenCalledTimes(1);
  });

  it("cleans up a failed shared request so an explicit later regeneration runs", async () => {
    const deps = dependencies();
    deps.generate.mockRejectedValueOnce(new Error("provider unavailable"));
    await expect(generateGrowthAiBrief(request, deps)).rejects.toThrow(
      "provider unavailable",
    );
    await expect(generateGrowthAiBrief(request, deps)).resolves.toMatchObject({
      generated: { kind: "growth_ai_brief" },
    });
    expect(deps.generate).toHaveBeenCalledTimes(2);
  });
  it("reuses a saved brief before reading pages or calling the paid provider", async () => {
    const deps = dependencies();
    deps.getSaved.mockResolvedValue({ id: "saved_brief" });
    await expect(generateGrowthAiBrief(request, deps)).resolves.toEqual({
      id: "saved_brief",
    });
    expect(deps.generate).not.toHaveBeenCalled();
    expect(deps.readPage).not.toHaveBeenCalled();
    expect(deps.meter).not.toHaveBeenCalled();
  });
  it("persists the actual model identifier and AI prompt version", async () => {
    const deps = dependencies();
    await generateGrowthAiBrief(request, deps);
    expect(deps.persist).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "fixture/model",
        promptVersion: "growth-ai-investigation-v2",
      }),
    );
  });
  it("requires the selected business case before any provider or page call", async () => {
    const deps = dependencies();
    vi.mocked(
      GrowthAssessmentsService.requireReadyForPage,
    ).mockRejectedValueOnce(new Error("Select an evidenced priority first"));
    await expect(generateGrowthAiBrief(request, deps)).rejects.toThrow(
      "Select an evidenced priority first",
    );
    expect(deps.assertProviderConfigured).not.toHaveBeenCalled();
    expect(deps.readPage).not.toHaveBeenCalled();
    expect(deps.generate).not.toHaveBeenCalled();
    expect(deps.persist).not.toHaveBeenCalled();
  });
});
