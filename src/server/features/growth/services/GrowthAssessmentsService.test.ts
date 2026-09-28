import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  latest: vi.fn(),
  pages: vi.fn(),
  append: vi.fn(),
  domain: vi.fn(),
}));
vi.mock("../repositories/GrowthAssessmentsRepository", () => ({
  GrowthAssessmentsRepository: {
    getLatest: mocks.latest,
    append: mocks.append,
  },
}));
vi.mock(
  "@/server/features/project-context/repositories/ProjectContextRepository",
  () => ({ ProjectContextRepository: { listKeyPages: mocks.pages } }),
);
vi.mock("../repositories/GrowthInsightsRepository", () => ({
  GrowthInsightsRepository: { projectDomain: mocks.domain },
}));
import { GrowthAssessmentsService } from "./GrowthAssessmentsService";

const selected = {
  id: "option_1",
  kind: "page",
  keyPageId: "page_1",
  businessRelevance: "Revenue",
  uncertainty: "Attribution",
  nextValidation: "Measure",
};
const ready = {
  id: "assessment_1",
  status: "ready",
  selectedOptionId: "option_1",
  options: [selected],
};

describe("Growth assessment page gate", () => {
  beforeEach(() => {
    mocks.latest.mockReset();
    mocks.pages.mockReset();
    mocks.pages.mockResolvedValue([
      { id: "page_1", url: "https://example.com/pricing" },
    ]);
  });
  it("allows only a ready page selection for its source URL", async () => {
    mocks.latest.mockResolvedValue(ready);
    await expect(
      GrowthAssessmentsService.requireReadyForPage(
        "project_1",
        "https://example.com/pricing",
      ),
    ).resolves.toMatchObject({ selected: { id: "option_1" } });
    await expect(
      GrowthAssessmentsService.requireReadyForPage(
        "project_1",
        "https://example.com/other",
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
  it("rejects measurement selections and cross-project pages", async () => {
    mocks.latest.mockResolvedValue({
      ...ready,
      options: [{ ...selected, kind: "measurement", keyPageId: null }],
    });
    await expect(
      GrowthAssessmentsService.requireReadyForPage(
        "project_1",
        "https://example.com/pricing",
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    mocks.latest.mockResolvedValue(ready);
    mocks.pages.mockResolvedValue([
      { id: "page_2", url: "https://other.example/pricing" },
    ]);
    await expect(
      GrowthAssessmentsService.requireReadyForPage(
        "project_1",
        "https://example.com/pricing",
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("saved priority acceptance", () => {
  it.each(["draft", "ready"] as const)(
    "rejects saved %s investigations with an invalid completion target",
    async (status) => {
      mocks.latest.mockResolvedValue({
        version: 3,
        status,
        selectedOptionId: "option_1",
        successMeasure: "Reach rank <=3 for two terms",
        options: [{ ...selected, kind: "measurement", keyPageId: null }],
      });

      await expect(
        GrowthAssessmentsService.confirmAssessment(
          "765f38ea-ff6a-48bf-8a5c-a6a368a5e9dc",
          3,
        ),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
      expect(mocks.append).not.toHaveBeenCalled();
    },
  );

  it("preserves server-owned evidence and rejects stale versions", async () => {
    const projectId = "765f38ea-ff6a-48bf-8a5c-a6a368a5e9dc";
    const option = {
      kind: "measurement",
      title: "Verify conversions",
      businessRelevance: "Measure the goal",
      evidenceSource: "Saved signal",
      evidenceDate: "2026-09-09",
      evidenceScope: "Project",
      observation: "Stored fact",
      uncertainty: "Unverified events",
      nextValidation: "Test event",
      disposition: "selected",
      keyPageId: null,
    };
    const draft = {
      version: 3,
      status: "draft",
      objective: "Qualified enquiries",
      market: "US",
      audience: "Buyers",
      successMeasure: "Verified enquiry",
      comparisonRationale: "Stored comparison",
      options: [
        option,
        { ...option, title: "Investigate content", disposition: "alternative" },
      ],
    };
    mocks.latest.mockResolvedValue(draft);
    mocks.pages.mockResolvedValue([]);
    mocks.append.mockResolvedValue({ ...draft, version: 4, status: "ready" });
    await GrowthAssessmentsService.confirmAssessment(projectId, 3);
    expect(mocks.append).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId,
        expectedVersion: 3,
        status: "ready",
        objectiveConfirmed: true,
        options: draft.options,
        comparisonRationale: draft.comparisonRationale,
      }),
    );
    mocks.append.mockClear();
    mocks.latest.mockResolvedValue({ ...draft, status: "ready" });
    await expect(
      GrowthAssessmentsService.confirmAssessment(projectId, 3),
    ).resolves.toMatchObject({ status: "ready", version: 3 });
    expect(mocks.append).not.toHaveBeenCalled();
    await expect(
      GrowthAssessmentsService.confirmAssessment(projectId, 2),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("accepted evidence investigation gate", () => {
  it("accepts the real research shape, strips prose punctuation and allows www for the project host", async () => {
    mocks.latest.mockResolvedValue({
      id: "accepted",
      status: "ready",
      selectedOptionId: "option",
      options: [
        {
          id: "option",
          kind: "research",
          keyPageId: null,
          evidenceScope: "US desktop",
          observation:
            "Keyword microsoft teams sms ranked 15 on desktop; result URL https://www.yakchat.com/posts/microsoft-adds-sms-to-teams.",
        },
      ],
    });
    mocks.domain.mockResolvedValue("yakchat.com");
    await expect(
      GrowthAssessmentsService.requireReadyForInvestigation(
        "project",
        "accepted",
      ),
    ).resolves.toMatchObject({
      page: {
        url: "https://www.yakchat.com/posts/microsoft-adds-sms-to-teams",
      },
    });
    mocks.domain.mockResolvedValue("another.example");
    await expect(
      GrowthAssessmentsService.requireReadyForInvestigation(
        "project",
        "accepted",
      ),
    ).rejects.toThrow();
    await expect(
      GrowthAssessmentsService.requireReadyForInvestigation("project", "old"),
    ).rejects.toThrow();
  });
});
