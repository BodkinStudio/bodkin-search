import {
  validInvestigationProposal,
  searchEvidenceFixture,
} from "./GrowthAssessmentInvestigation.fixtures";
import {
  assertUsageCreditsAvailable,
  trackUsageCreditSpend,
} from "@/server/billing/subscription";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import { growthInvestigationDecisionSchema } from "@/types/schemas/growth-assessment-investigations";
import { z } from "zod";
import type * as AiModule from "ai";
import { NoObjectGeneratedError } from "ai";
import type { GrowthAssessmentInvestigationsRepository } from "../repositories/GrowthAssessmentInvestigationsRepository";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  claim: vi.fn(),
  complete: vi.fn(),
  renewActiveLease: vi.fn(),
  updateStage: vi.fn(),
  fail: vi.fn(),
  gate: vi.fn(),
  read: vi.fn(),
  health: vi.fn(),
  report: vi.fn(),
  project: vi.fn(),
  context: vi.fn(),
  pageContext: vi.fn(),
  model: vi.fn(),
  generate: vi.fn(),
}));
vi.mock("../repositories/GrowthAssessmentInvestigationsRepository", () => ({
  GrowthAssessmentInvestigationsRepository: mocks,
}));
vi.mock("./GrowthAssessmentsService", () => ({
  GrowthAssessmentsService: { requireReadyForInvestigation: mocks.gate },
}));
vi.mock("@/server/lib/scrape", () => ({ readPages: mocks.read }));
vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof AiModule>()),
  wrapLanguageModel: ({ model }: { model: unknown }) => model,
  generateObject: mocks.generate,
}));
vi.mock("@/server/lib/openrouter", () => ({ getChatAgentModel: mocks.model }));
vi.mock("@/server/billing/subscription", () => ({
  assertUsageCreditsAvailable: vi.fn(),
  trackUsageCreditSpend: vi.fn(),
}));
vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: vi.fn().mockResolvedValue(false),
}));
vi.mock("../../projects/repositories/ProjectRepository", () => ({
  ProjectRepository: { getProjectById: mocks.project },
}));
vi.mock("../../project-context/services/ProjectContextService", () => ({
  getProjectContext: mocks.context,
}));
vi.mock("./GrowthPageContextService", () => ({
  GrowthPageContextService: { getPageContext: mocks.pageContext },
}));
vi.mock("@/server/features/ga4/services/Ga4MeasurementHealthService", () => ({
  Ga4MeasurementHealthService: { getMeasurementHealth: mocks.health },
}));
vi.mock("@/server/features/ga4/services/Ga4ReportingService", () => ({
  Ga4ReportingService: { runReport: mocks.report },
}));
import { GrowthAssessmentInvestigationsService as service } from "./GrowthAssessmentInvestigationsService";
const projectId = "765f38ea-ff6a-48bf-8a5c-a6a368a5e9dc";
const assessmentId = "00000000-0000-4000-8000-000000000002";
const pageUrl = "https://www.yakchat.com/posts/microsoft-adds-sms-to-teams";
const saved = {
  id: "00000000-0000-4000-8000-000000000003",
  projectId,
  assessmentId,
  assessmentVersion: 8,
  attemptId: "attempt",
  status: "running",
  startedAt: "2026-09-11T10:00:00Z",
  completedAt: null,
  failedAt: null,
  staleAfter: "2026-09-11T10:02:00Z",
  pageStatus: "pending",
  analyticsStatus: "pending",
  findingsStatus: "pending",
  sourceUrl: null,
  sourceTitle: null,
  sourceObservedAt: null,
  failureMessage: null,
  findings: [],
};
beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  vi.mocked(isHostedServerAuthMode).mockResolvedValue(false);
  vi.mocked(trackUsageCreditSpend).mockClear();
  mocks.gate.mockResolvedValue({
    assessment: { id: assessmentId, version: 8 },
    selected: {
      kind: "measurement",
      title: "Check Microsoft Teams SMS",
      observation: `Keyword microsoft teams sms ranked 15 on desktop; result URL ${pageUrl}.`,
    },
    page: { url: pageUrl },
  });
  mocks.claim.mockResolvedValue({ claimed: true, run: saved });
  mocks.read.mockResolvedValue({
    pages: [
      {
        url: pageUrl,
        resolvedUrl: pageUrl,
        title: "Microsoft adds SMS to Teams",
        text: "Microsoft Teams SMS helps business teams communicate. Book a demo to see how YakChat works.",
        links: [{ text: "Book a demo", url: "https://www.yakchat.com/demo" }],
      },
    ],
    blocked: false,
  });
  mocks.health.mockRejectedValue(new Error("not connected"));
  mocks.report.mockRejectedValue(new Error("not connected"));
  mocks.updateStage.mockResolvedValue(undefined);
  mocks.renewActiveLease.mockResolvedValue(true);
  mocks.project.mockResolvedValue({ id: projectId, domain: "yakchat.com" });
  mocks.context.mockResolvedValue({
    competitors: [],
    sections: [],
    keyPages: [],
  });
  mocks.pageContext.mockResolvedValue({
    asOf: "2026-09-11T10:00:00.000Z",
    searchPerformance: { state: "not_connected" },
  });
  mocks.model.mockResolvedValue({ modelId: "test" });
  mocks.generate.mockImplementation(
    async (input: { prompt: string; schema: z.ZodType }) => {
      const result = {
        object: {
          ...validInvestigationProposal,
          evidenceIds: z
            .object({ permittedEvidenceIds: z.array(z.string()) })
            .parse(JSON.parse(input.prompt.split("\n\n").at(-1)!))
            .permittedEvidenceIds,
        },
        providerMetadata: {},
      };
      return {
        ...result,
        object: input.schema.parse(
          growthInvestigationDecisionSchema
            .omit({ whyThisPage: true, rationale: true })
            .strip()
            .parse(result.object),
        ),
      };
    },
  );
  mocks.complete.mockImplementation(
    (
      input: Parameters<
        typeof GrowthAssessmentInvestigationsRepository.complete
      >[0],
    ) =>
      Promise.resolve({
        ...saved,
        ...input,
        decisionVerdict: input.decision.verdict,
        decisionHeadline: input.decision.headline,
        decisionWhyThisPage: input.decision.whyThisPage,
        decisionRationale: input.decision.rationale,
        decisionNextAction: input.decision.nextAction,
        decisionExpectedOutcome: input.decision.expectedOutcome,
        decisionMeasurement: input.decision.measurement,
        decisionCaveat: input.decision.caveat,
        evidence: input.evidence.map((item) => ({
          ...item,
          evidenceText: item.text,
          sourceUrl: item.url,
          citedByDecision: true,
        })),
        status: "completed",
        completedAt: "2026-09-11T10:01:00Z",
      }),
  );
  mocks.fail.mockImplementation((...args: unknown[]) =>
    Promise.resolve({
      ...saved,
      status: "failed",
      failedAt: "2026-09-11T10:01:00Z",
      failureMessage: String(args.at(-1)),
    }),
  );
});
describe("executing an agreed investigation", () => {
  it("reads the exact accepted source and saves observed content with analytics limits", async () => {
    const result = await service.runInvestigation(projectId, assessmentId);
    expect(mocks.gate).toHaveBeenCalledWith(projectId, assessmentId);
    expect(mocks.read).toHaveBeenCalledWith([pageUrl], 1);
    expect(result.status).toBe("completed");
    expect(result.decision?.verdict).toBe("investigate");
    expect(
      result.evidence.some((item) => item.text.includes("Book a demo")),
    ).toBe(true);
    expect(result.limitations.join(" ")).toMatch(/Analytics|analytics/);
    expect(
      result.findings.every((finding) => finding.unverified.length > 0),
    ).toBe(true);
    expect(mocks.updateStage).toHaveBeenCalledWith(
      expect.objectContaining({ attemptId: "attempt" }),
    );
  });
  it("does no new source work for a completed run", async () => {
    mocks.claim.mockResolvedValue({
      claimed: false,
      run: {
        ...saved,
        status: "completed",
        completedAt: "2026-09-11T10:01:00Z",
      },
    });
    expect(
      (await service.runInvestigation(projectId, assessmentId)).status,
    ).toBe("completed");
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.report).not.toHaveBeenCalled();
  });
  it("repairs model-written metrics before persistence and meters both calls", async () => {
    vi.mocked(isHostedServerAuthMode).mockResolvedValue(true);
    vi.mocked(assertUsageCreditsAvailable).mockResolvedValue({
      monthlyRemaining: 100,
    });
    const generate = mocks.generate.getMockImplementation()!;
    mocks.generate.mockImplementationOnce(
      async (input: { prompt: string; schema: z.ZodType }) => {
        const result = z
          .object({
            object: growthInvestigationDecisionSchema.omit({
              whyThisPage: true,
              rationale: true,
            }),
            providerMetadata: z.unknown(),
          })
          .parse(await generate(input));
        return {
          ...result,
          object: {
            ...result.object,
            headline:
              "The Microsoft Teams query had 17 impressions and ranked 19.2.",
          },
        };
      },
    );
    const result = await service.runInvestigation(
      projectId,
      assessmentId,
      false,
      { organizationId: "org", userId: "user", userEmail: "test@example.com" },
    );
    expect(result.status).toBe("completed");
    expect(mocks.generate).toHaveBeenCalledTimes(2);
    expect(vi.mocked(trackUsageCreditSpend)).toHaveBeenCalledTimes(2);
    expect(result.decision?.rationale).not.toContain("17");
    expect(mocks.complete).toHaveBeenCalledTimes(1);
  });
  it("builds the page-selection facts directly from the exact-page report", async () => {
    mocks.pageContext.mockResolvedValue(searchEvidenceFixture);
    const result = await service.runInvestigation(projectId, assessmentId);
    expect(result.status).toBe("completed");
    expect(result.decision?.whyThisPage).toContain(
      "3,605 impressions and 9 clicks",
    );
    expect(result.decision?.whyThisPage).toContain("2026-08-13 to 2026-09-09");
    const source = result.evidence.find(
      (item) => item.source === "search_performance",
    )!;
    expect(source.text).toContain(
      "“can i text from microsoft teams”: 0 clicks, 8 impressions",
    );
    expect(source.text).toContain(
      "“can i text from teams”: 0 clicks, 17 impressions",
    );
  });
  it("accepts all five supplied citations using the actual generation schema", async () => {
    const result = await service.runInvestigation(projectId, assessmentId);
    expect(result.status).toBe("completed");
    expect(result.decision?.evidenceIds).toHaveLength(5);
  });
  it("explains a malformed AI result without exposing SDK jargon or saving a decision", async () => {
    mocks.generate.mockRejectedValue(
      new NoObjectGeneratedError({
        message: "No object generated: response did not match schema.",
        text: "invalid provider response",
        response: { id: "test", timestamp: new Date(), modelId: "test" },
        usage: {
          inputTokens: 1,
          outputTokens: 1,
          totalTokens: 2,
          inputTokenDetails: {
            noCacheTokens: 1,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          },
          outputTokenDetails: { textTokens: 1, reasoningTokens: 0 },
        },
        finishReason: "stop",
      }),
    );
    const result = await service.runInvestigation(projectId, assessmentId);
    expect(result.status).toBe("failed");
    expect(result.failureMessage).toContain("No recommendation was saved");
    expect(result.failureMessage).not.toContain("schema");
    expect(mocks.complete).not.toHaveBeenCalled();
  });
  it("rejects an unaccepted or foreign assessment before source requests", async () => {
    mocks.gate.mockRejectedValue(new Error("Assessment not accepted"));
    await expect(
      service.runInvestigation(projectId, assessmentId),
    ).rejects.toThrow("Assessment not accepted");
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("returns a retryable failure when neither source can be checked", async () => {
    mocks.read.mockResolvedValue({ pages: [], blocked: true });
    expect(
      (await service.runInvestigation(projectId, assessmentId)).status,
    ).toBe("failed");
    expect(mocks.complete).not.toHaveBeenCalled();
  });
  it("does not invoke the provider after another attempt takes ownership", async () => {
    mocks.renewActiveLease.mockResolvedValue(false);
    mocks.get.mockResolvedValue(saved);
    expect(
      (await service.runInvestigation(projectId, assessmentId)).status,
    ).toBe("running");
    expect(mocks.model).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("does not treat an external redirect as the selected page", async () => {
    mocks.read.mockResolvedValue({
      pages: [
        { resolvedUrl: "https://other.example/page", text: "Book a demo" },
      ],
    });
    expect(
      (await service.runInvestigation(projectId, assessmentId)).status,
    ).toBe("failed");
  });
  it("labels a missing page report even when Analytics configuration succeeds", async () => {
    mocks.health.mockResolvedValue({
      source: {
        propertyId: "properties/123",
        propertyDisplayName: "Test property",
      },
      summary: { webStreamCount: 1 },
      keyEvents: [{ eventName: "generate_lead" }],
    });
    const result = await service.runInvestigation(projectId, assessmentId);
    expect(result.stages.analytics).toBe("limited");
    expect(
      result.findings.some((item) =>
        item.title.includes("page-level report was unavailable"),
      ),
    ).toBe(true);
    expect(
      result.findings.some((item) => item.sourceUrl.includes("/p123/admin")),
    ).toBe(true);
    expect(result.limitations.length).toBeGreaterThan(0);
  });
  it("records page-level values without treating aggregate key events as a verified enquiry", async () => {
    mocks.report.mockResolvedValue({
      source: { propertyId: "123" },
      request: {
        resolvedDateRange: { startDate: "2026-08-01", endDate: "2026-08-28" },
      },
      rows: [
        {
          hostName: "www.yakchat.com",
          pagePath: "/posts/microsoft-adds-sms-to-teams",
          screenPageViews: 42,
          activeUsers: 30,
          keyEvents: 2,
        },
      ],
    });
    const result = await service.runInvestigation(projectId, assessmentId);
    const finding = result.findings.find((item) =>
      item.evidence.includes("42"),
    );
    expect(finding?.evidence).toContain("2026-08-01");
    expect(finding?.unverified).toMatch(/not|unverified|cannot/);
    expect(result.stages.analytics).toBe("limited");
    expect(
      result.findings.some((item) =>
        item.title.includes("configuration was unavailable"),
      ),
    ).toBe(true);
    expect(result.limitations.length).toBeGreaterThan(0);
  });
});
