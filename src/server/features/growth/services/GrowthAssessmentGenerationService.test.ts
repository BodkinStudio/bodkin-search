/* eslint-disable max-lines, max-lines-per-function -- generation scenarios cover the evidence boundary end to end */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import type { AppError } from "@/server/lib/errors";
import { saveGrowthAssessmentSchema } from "@/types/schemas/growth-assessments";

vi.mock("@/server/billing/subscription", () => ({
  assertUsageCreditsAvailable: vi.fn(),
  trackUsageCreditSpend: vi.fn(),
}));
const provider = vi.hoisted(() => ({
  model: { modelId: "provider/priority-test" },
  result: null as unknown,
  validate: false,
}));
const briefWriter = vi.hoisted(() =>
  vi.fn(async (_input: unknown) => ({
    object: {
      title: "Check Teams SMS page fit",
      comparisonRationale:
        "Start with a known ranking page before proposing new work.",
      businessRelevance: "Check whether this page serves business buyers.",
      nextValidation: "Compare the Teams SMS page offer with its search query.",
      successMeasure:
        "Record the page audience and whether enquiry tracking exists.",
      uncertainty: "Enquiry tracking has not been checked.",
    },
    providerMetadata: {},
  })),
);
vi.mock("./GrowthAssessmentBriefWriter", () => ({
  writeGrowthAssessmentBrief: briefWriter,
}));
vi.mock("ai", () => ({
  generateObject: vi.fn(async ({ schema }: { schema: z.ZodType }) => {
    if (!provider.validate) return provider.result;
    if (
      typeof provider.result !== "object" ||
      provider.result === null ||
      !("object" in provider.result)
    )
      throw new Error("Provider result must include an object");
    const result = provider.result;
    return { ...result, object: schema.parse(result.object) };
  }),
}));
vi.mock("@/server/lib/openrouter", () => ({
  getChatAgentModel: vi.fn(async () => provider.model),
}));
vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: vi.fn(),
  isHostedServerAuthMode: vi.fn(),
}));
vi.mock("../../project-context/services/ProjectContextService", () => ({
  getProjectContext: vi.fn(),
}));
vi.mock("../repositories/GrowthAssessmentsRepository", () => ({
  GrowthAssessmentsRepository: { getLatest: vi.fn(), append: vi.fn() },
}));
vi.mock("../repositories/GrowthProjectSummaryRepository", () => ({
  GrowthProjectSummaryRepository: {
    listUnresolvedRecommendations: vi.fn(),
    listRecentSignalEvidence: vi.fn(),
  },
}));
vi.mock("../../rank-tracking/repositories/RankTrackingRepository", () => ({
  RankTrackingRepository: {
    getConfigsForProject: vi.fn(),
    getLatestRunForConfig: vi.fn(),
    getSnapshotsForRun: vi.fn(),
  },
}));
vi.mock("../../audit/repositories/AuditRepository", () => ({
  AuditRepository: {
    getLatestAuditForProject: vi.fn(),
    getIssuesForAudit: vi.fn(),
  },
}));
vi.mock("./GrowthEvidencePacketService", () => ({
  assembleGrowthEvidencePacket: vi.fn(),
}));
import { generateObject } from "ai";
import { GrowthAssessmentGenerationService } from "./GrowthAssessmentGenerationService";

afterEach(() => {
  provider.validate = false;
});

const projectId = "4d26a0f8-b6a8-4ed5-a004-59ba4c8114ce";
const request = {
  projectId,
  organizationId: "org_1",
  userId: "user_1",
  userEmail: "person@example.com",
  expectedVersion: 1,
};

const confirmedAssessment = {
  id: "assessment_confirmed_1",
  version: 1,
  status: "ready",
  objectiveConfirmed: true,
  objective: "Increase qualified Teams SMS enquiries",
  market: "United States",
  audience: "IT teams evaluating Teams SMS",
  successMeasure: "Qualified Teams SMS enquiries",
};

const evidenceContext = {
  sections: [
    { key: "current_goal", content: "Grow qualified Teams SMS enquiries" },
  ],
  missingSections: ["business_overview"],
  competitors: [{ domain: "example-competitor.com", name: "Competitor" }],
  keyPages: [
    {
      id: "3fcb8c03-3a35-49f8-9a26-b3a392576a75",
      url: "https://example.com/teams",
      role: "commercial",
      topic: "Teams SMS",
      commercialWeight: 5,
    },
  ],
  researchLog: [],
};

const generated = {
  objective: "Hypothesis: increase qualified Teams SMS enquiries",
  market: "US (confirm)",
  audience: "Teams buyers (confirm)",
  successMeasure: "Qualified enquiries (confirm baseline and definition)",
  comparisonRationale:
    "The selected option has the clearest saved signal; alternatives remain unvalidated.",
  options: [
    {
      kind: "page" as const,
      title: "Improve the Teams SMS page",
      evidenceSubject: "Teams SMS",
      businessRelevance: "Could support the stated goal.",
      observation: "The saved signal requires validation on this page.",
      uncertainty: "No conversion evidence is supplied.",
      nextValidation: "Confirm the page and enquiry baseline.",
      disposition: "selected" as const,
      keyPageUrl: "https://example.com/teams",
      citationIds: ["signal_1"],
    },
    {
      kind: "research" as const,
      title: "Compare Teams competitors",
      evidenceSubject: "Compare Teams competitors",
      businessRelevance: "May clarify positioning.",
      observation: "A saved recommendation identifies a possible opportunity.",
      uncertainty: "No current competitor SERP evidence is supplied.",
      nextValidation: "Compare the named competitor against the query set.",
      disposition: "alternative" as const,
      keyPageUrl: null,
      citationIds: ["recommendation_1"],
    },
  ],
};

function selection(value: {
  kind: string;
  evidenceSubject: string;
  keyPageUrl: string | null;
  citationIds: string[];
}) {
  const { kind, evidenceSubject, keyPageUrl, citationIds } = value;
  return { kind, evidenceSubject, keyPageUrl, citationIds };
}

function deps() {
  return {
    getContext: vi.fn().mockResolvedValue(evidenceContext),
    listRecommendations: vi.fn().mockResolvedValue([
      {
        id: "recommendation_db_1",
        title: "Compare Teams competitors",
        rationale: "Saved research suggested an overlap",
        priorityScore: 8,
        confidence: 0.4,
        createdAt: "2026-09-08T10:00:00.000Z",
      },
    ]),
    listSignals: vi.fn().mockResolvedValue([
      {
        id: "signal_db_1",
        entityType: "page",
        entityRef: "https://example.com/teams",
        evidenceRef: "report_1",
        metric: "Clicks",
        baselineValue: 100,
        currentValue: 60,
        deltaValue: -40,
        deltaPercent: -40,
        severity: "warning",
        confidence: 0.8,
        evidenceKind: "gsc",
        capturedAt: "2026-09-08T10:00:00.000Z",
        periodStart: "2026-08-01",
        periodEnd: "2026-09-01",
        runStatus: "completed",
      },
    ]),
    rankConfigs: vi.fn().mockResolvedValue([]),
    rankRun: vi.fn(),
    rankSnapshots: vi.fn(),
    audit: vi.fn().mockResolvedValue(null),
    auditIssues: vi.fn(),
    assemblePacket: vi.fn().mockResolvedValue({
      source: { signalId: "signal_db_1" },
      subject: { displayUrl: "https://example.com/teams", topic: "Teams SMS" },
    }),
    getLatest: vi.fn().mockResolvedValue(confirmedAssessment),
    append: vi.fn().mockResolvedValue({
      id: "assessment_1",
      status: "draft",
      version: 1,
      options: [],
    }),
    generate: vi.fn().mockResolvedValue({
      object: generated,
      modelId: "test/model",
      providerMetadata: {},
    }),
    hostedMode: vi.fn().mockResolvedValue(false),
    assertCredits: vi.fn(),
    meter: vi.fn(),
    assertProviderConfigured: vi.fn(),
    now: () => "2026-09-09T12:00:00.000Z",
  };
}

function firstAppend(injected: ReturnType<typeof deps>) {
  const value: unknown = injected.append.mock.calls[0]?.[0];
  return saveGrowthAssessmentSchema.parse(value);
}

function firstGeneratedPrompt(injected: ReturnType<typeof deps>) {
  const value: unknown = injected.generate.mock.calls[0]?.[0];
  if (
    typeof value !== "object" ||
    value === null ||
    !("prompt" in value) ||
    typeof value.prompt !== "string"
  )
    throw new Error("Expected generator prompt");
  return value.prompt;
}

describe("GrowthAssessmentGenerationService", () => {
  it("allows research to reference a saved page without authorizing a page change", async () => {
    const injected = deps();
    injected.generate.mockResolvedValue({
      object: {
        ...generated,
        options: [
          generated.options[0],
          { ...generated.options[1], keyPageUrl: "https://example.com/teams" },
        ],
      },
      modelId: "test/model",
      providerMetadata: {},
    });
    await GrowthAssessmentGenerationService.generateAssessment(
      request,
      injected,
    );
    expect(firstAppend(injected).options[1]).toMatchObject({
      kind: "research",
      keyPageId: null,
    });
    expect(injected.generate).toHaveBeenCalledWith(
      expect.objectContaining({ pageUrls: ["https://example.com/teams"] }),
    );
  });

  it("persists an unconfirmed draft with server-hydrated evidence provenance", async () => {
    const injected = deps();
    await expect(
      GrowthAssessmentGenerationService.generateAssessment(request, injected),
    ).resolves.toMatchObject({ id: "assessment_1", status: "draft" });
    const saved = firstAppend(injected);
    expect(saved.objectiveConfirmed).toBe(false);
    expect(saved.status).toBe("draft");
    expect(saved.options[0]).toMatchObject({
      keyPageId: "3fcb8c03-3a35-49f8-9a26-b3a392576a75",
      evidenceSource: "Saved gsc Growth signal signal_db_1",
      evidenceDate: "2026-09-08T10:00:00.000Z",
    });
    expect(firstGeneratedPrompt(injected)).toContain("availableCitationIds");
    expect(firstGeneratedPrompt(injected)).toContain(
      "Increase qualified Teams SMS enquiries",
    );
  });

  it("blocks selected page changes without a previously confirmed objective", async () => {
    const injected = deps();
    injected.getLatest.mockResolvedValue(null);
    await expect(
      GrowthAssessmentGenerationService.generateAssessment(
        { ...request, expectedVersion: null },
        injected,
      ),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    } satisfies Partial<AppError>);
    expect(injected.generate).toHaveBeenCalledWith(
      expect.objectContaining({ pageUrls: [] }),
    );
    expect(injected.append).not.toHaveBeenCalled();
  });

  it("rejects a task whose cited query is unrelated to its claimed topic", async () => {
    const injected = deps();
    injected.listSignals.mockResolvedValue([
      {
        id: "signal_db_1",
        entityType: "query",
        entityRef: "sms browser",
        evidenceRef: "report_1",
        metric: "Clicks",
        baselineValue: 100,
        currentValue: 60,
        deltaValue: -40,
        deltaPercent: -40,
        severity: "warning",
        confidence: 0.8,
        evidenceKind: "gsc",
        capturedAt: "2026-09-08T10:00:00.000Z",
        periodStart: "2026-08-01",
        periodEnd: "2026-09-01",
        runStatus: "completed",
      },
    ]);
    await expect(
      GrowthAssessmentGenerationService.generateAssessment(request, injected),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    } satisfies Partial<AppError>);
    expect(injected.append).not.toHaveBeenCalled();
  });

  it("rejects a rank target as the completion measure for an investigation", async () => {
    const injected = deps();
    injected.generate.mockResolvedValue({
      object: {
        ...generated,
        successMeasure: "Reach rank <=3 for two Teams SMS terms",
        options: [
          { ...generated.options[1], disposition: "selected" },
          {
            ...generated.options[1],
            title: "Hold competitor work",
            disposition: "alternative",
          },
        ],
      },
      modelId: "test/model",
      providerMetadata: {},
    });
    await expect(
      GrowthAssessmentGenerationService.generateAssessment(request, injected),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    } satisfies Partial<AppError>);
    expect(injected.append).not.toHaveBeenCalled();
  });

  it("allows an investigation completion measure that records a time-bounded baseline", async () => {
    const injected = deps();
    injected.generate.mockResolvedValue({
      object: {
        ...generated,
        successMeasure:
          "Record conversions for the last 28 days by destination page",
        options: [
          { ...generated.options[1], disposition: "selected" },
          {
            ...generated.options[1],
            title: "Hold competitor work",
            disposition: "alternative",
          },
        ],
      },
      modelId: "test/model",
      providerMetadata: {},
    });
    await expect(
      GrowthAssessmentGenerationService.generateAssessment(request, injected),
    ).resolves.toMatchObject({ id: "assessment_1" });
  });

  it("allows a repeated investigation completion result when no confirmed page target exists", async () => {
    const injected = deps();
    injected.generate.mockResolvedValue({
      object: {
        ...generated,
        successMeasure: confirmedAssessment.successMeasure,
        options: [
          { ...generated.options[1], disposition: "selected" },
          {
            ...generated.options[1],
            title: "Hold competitor work",
            disposition: "alternative",
          },
        ],
      },
      modelId: "test/model",
      providerMetadata: {},
    });
    await expect(
      GrowthAssessmentGenerationService.generateAssessment(request, injected),
    ).resolves.toMatchObject({ id: "assessment_1" });
  });

  it("maps the configured provider result into one selected priority and alternatives", async () => {
    const injected = deps();
    const { generate: _ignored, ...providerDeps } = injected;
    const { disposition: _priorityDisposition, ...priority } =
      generated.options[0];
    const { disposition: _alternativeDisposition, ...alternative } =
      generated.options[1];
    provider.result = {
      object: {
        objective: generated.objective,
        market: generated.market,
        audience: generated.audience,
        priority: selection(priority),
        alternatives: [selection(alternative)],
      },
      providerMetadata: { openrouter: { usage: { cost: 0 } } },
    };

    provider.validate = true;
    await GrowthAssessmentGenerationService.generateAssessment(
      request,
      providerDeps,
    );

    expect(generateObject).toHaveBeenCalledWith(
      expect.objectContaining({ model: provider.model }),
    );
    expect(briefWriter).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "Teams SMS",
        evidence: [
          expect.objectContaining({
            fact: expect.stringContaining("Clicks") as unknown,
          }),
        ],
      }),
    );
    const briefInput = briefWriter.mock.calls.at(-1)?.[0];
    expect(JSON.stringify(briefInput)).not.toContain(
      "Saved research suggested an overlap",
    );
    const saved = firstAppend(injected);
    expect(saved.successMeasure).toBe(
      "Record the page audience and whether enquiry tracking exists.",
    );
    expect(
      saved.options.filter((option) => option.disposition === "selected"),
    ).toHaveLength(1);
    expect(saved.options[0]).toMatchObject({
      kind: "page",
      keyPageId: "3fcb8c03-3a35-49f8-9a26-b3a392576a75",
    });
    expect(saved.options[1]).toMatchObject({
      kind: "research",
      keyPageId: null,
    });
  });

  it("records selection usage even if isolated brief writing fails, without replacing saved work", async () => {
    const injected = deps();
    injected.hostedMode.mockResolvedValue(true);
    injected.assertCredits.mockResolvedValue({ monthlyRemaining: 100 });
    const { generate: _ignored, ...providerDeps } = injected;
    const { disposition: _selected, ...priority } = generated.options[0];
    const { disposition: _alternative, ...alternative } = generated.options[1];
    provider.result = {
      object: {
        objective: generated.objective,
        market: generated.market,
        audience: generated.audience,
        priority: selection(priority),
        alternatives: [selection(alternative)],
      },
      providerMetadata: {},
    };
    briefWriter.mockRejectedValueOnce(new Error("brief unavailable"));
    await expect(
      GrowthAssessmentGenerationService.generateAssessment(
        request,
        providerDeps,
      ),
    ).rejects.toThrow("brief unavailable");
    expect(injected.meter).toHaveBeenCalledTimes(1);
    expect(injected.append).not.toHaveBeenCalled();
  });

  it("rejects a provider priority whose structured subject and citation disagree", async () => {
    const injected = deps();
    const { generate: _ignored, ...providerDeps } = injected;
    const { disposition: _priorityDisposition, ...priority } =
      generated.options[0];
    const { disposition: _alternativeDisposition, ...alternative } =
      generated.options[1];
    provider.result = {
      object: {
        objective: generated.objective,
        market: generated.market,
        audience: generated.audience,
        priority: {
          ...selection(priority),
          evidenceSubject: "Unrelated topic",
        },
        alternatives: [selection(alternative)],
      },
      providerMetadata: {},
    };
    provider.validate = true;
    try {
      await expect(
        GrowthAssessmentGenerationService.generateAssessment(
          request,
          providerDeps,
        ),
      ).rejects.toThrow();
      expect(injected.append).not.toHaveBeenCalled();
    } finally {
      provider.validate = false;
    }
  });

  it("rejects fabricated citations before writing an assessment", async () => {
    const injected = deps();
    injected.generate.mockResolvedValue({
      object: {
        ...generated,
        options: [
          { ...generated.options[0], citationIds: ["fabricated"] },
          generated.options[1],
        ],
      },
      modelId: "test/model",
      providerMetadata: {},
    });
    await expect(
      GrowthAssessmentGenerationService.generateAssessment(request, injected),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    } satisfies Partial<AppError>);
    expect(injected.append).not.toHaveBeenCalled();
  });

  it("rejects an AI-selected page outside the authorized project", async () => {
    const injected = deps();
    injected.generate.mockResolvedValue({
      object: {
        ...generated,
        options: [
          {
            ...generated.options[0],
            keyPageUrl: "https://other.example/private",
          },
          generated.options[1],
        ],
      },
      modelId: "test/model",
      providerMetadata: {},
    });
    await expect(
      GrowthAssessmentGenerationService.generateAssessment(request, injected),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    } satisfies Partial<AppError>);
    expect(injected.append).not.toHaveBeenCalled();
  });

  it("rejects a selected page when its cited packet proves a different project page", async () => {
    const injected = deps();
    injected.getContext.mockResolvedValue({
      ...evidenceContext,
      keyPages: [
        ...evidenceContext.keyPages,
        {
          id: "f9ca52cf-f151-4546-9d5c-a75e529e4cf3",
          url: "https://example.com/pricing",
          role: "commercial",
          topic: "Pricing",
          commercialWeight: 5,
        },
      ],
    });
    injected.assemblePacket.mockResolvedValue({
      source: { signalId: "signal_db_1" },
      subject: { displayUrl: "https://example.com/pricing" },
    });
    await expect(
      GrowthAssessmentGenerationService.generateAssessment(request, injected),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    } satisfies Partial<AppError>);
    expect(injected.append).not.toHaveBeenCalled();
  });

  it("does not let an unavailable packet justify a selected page", async () => {
    const injected = deps();
    injected.assemblePacket.mockRejectedValue(new Error("packet unavailable"));
    await expect(
      GrowthAssessmentGenerationService.generateAssessment(request, injected),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    } satisfies Partial<AppError>);
    expect(injected.append).not.toHaveBeenCalled();
  });

  it("does not call the model when saved evidence is unavailable", async () => {
    const injected = deps();
    injected.listRecommendations.mockResolvedValue([]);
    injected.listSignals.mockResolvedValue([]);
    injected.getContext.mockResolvedValue({
      ...evidenceContext,
      researchLog: [],
    });
    await expect(
      GrowthAssessmentGenerationService.generateAssessment(request, injected),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    } satisfies Partial<AppError>);
    expect(injected.generate).not.toHaveBeenCalled();
  });

  it("surfaces a concurrent append without claiming the draft was saved", async () => {
    const injected = deps();
    injected.append.mockResolvedValue(null);
    await expect(
      GrowthAssessmentGenerationService.generateAssessment(request, injected),
    ).rejects.toMatchObject({ code: "CONFLICT" } satisfies Partial<AppError>);
  });

  it("stores server-owned observations, never model-authored evidence text", async () => {
    const injected = deps();
    injected.generate.mockResolvedValue({
      object: {
        ...generated,
        options: [
          {
            ...generated.options[0],
            observation: "Invented causal claim",
            citationIds: ["signal_1"],
          },
          generated.options[1],
        ],
      },
      modelId: "test/model",
      providerMetadata: {},
    });
    await GrowthAssessmentGenerationService.generateAssessment(
      request,
      injected,
    );
    const saved = firstAppend(injected);
    expect(saved.options[0]?.observation).toContain("Clicks on page");
    expect(saved.options[0]?.observation).not.toContain(
      "Invented causal claim",
    );
  });

  it("rejects a page option without a project page URL and keeps user feedback out of the stored objective", async () => {
    const injected = deps();
    injected.generate.mockResolvedValue({
      object: {
        ...generated,
        objective: "Refined objective",
        options: [
          { ...generated.options[0], keyPageUrl: null },
          generated.options[1],
        ],
      },
      modelId: "test/model",
      providerMetadata: {},
    });
    await expect(
      GrowthAssessmentGenerationService.generateAssessment(
        {
          ...request,
          businessContext:
            "Reassess against corrected business context: { objective: 'Actually qualified demos' }",
        },
        injected,
      ),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    } satisfies Partial<AppError>);
    injected.generate.mockResolvedValue({
      object: {
        ...generated,
        objective: "Refined objective",
        options: [
          { ...generated.options[1], disposition: "selected" },
          {
            ...generated.options[1],
            title: "Hold page work",
            disposition: "alternative",
          },
        ],
      },
      modelId: "test/model",
      providerMetadata: {},
    });
    await GrowthAssessmentGenerationService.generateAssessment(
      {
        ...request,
        businessContext:
          "Reassess against corrected business context: { objective: 'Actually qualified demos' }",
      },
      injected,
    );
    expect(firstAppend(injected).objective).toBe("Refined objective");
  });
});
