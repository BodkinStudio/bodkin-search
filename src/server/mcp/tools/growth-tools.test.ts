import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GrowthMonthlyReportDto } from "@/types/schemas/growth-monthly-reports";
import { GROWTH_REPORT_SECTION_TYPES } from "@/types/schemas/growth-reports";
import { objectSchema } from "@/server/mcp/output-schemas";
import { growthGetMonthlySummaryTool } from "./growth-tools";
import { makeToolContext, textContent } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  getGrowthMonthlyReport: vi.fn(),
  buildGrowthMonthlyReport: vi.fn(),
  getGrowthMonthlyPublicationStatus: vi.fn(),
  publishGrowthMonthlyReport: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));

vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));

vi.mock(
  "@/server/features/growth/services/GrowthMonthlyReportsService",
  () => ({
    GrowthMonthlyReportsService: {
      getGrowthMonthlyReport: mocks.getGrowthMonthlyReport,
      buildGrowthMonthlyReport: mocks.buildGrowthMonthlyReport,
      getGrowthMonthlyPublicationStatus:
        mocks.getGrowthMonthlyPublicationStatus,
      publishGrowthMonthlyReport: mocks.publishGrowthMonthlyReport,
    },
  }),
);

const projectId = "project_1";
const context = makeToolContext({ baseUrl: "https://open-seo.test" });
const common = {
  periodStart: "2026-08-01",
  periodEnd: "2026-08-31",
  reportTimezone: "Europe/London",
} as const;

function savedReport(status: "draft" | "published"): GrowthMonthlyReportDto {
  const reportCommon = {
    version: 1,
    generatedAt: "2026-09-01T09:00:00.000Z",
    dataCutoffAt: "2026-09-01T08:59:00.000Z",
    sections: GROWTH_REPORT_SECTION_TYPES.map((sectionType, index) => ({
      sectionType,
      title: `Section ${index + 1}: ${sectionType}`,
      summary: `Section ${index + 1} summary`,
      items: [
        {
          title: `Item ${index + 1}`,
          summary: `Item ${index + 1} narrative`,
          facts: [
            {
              label: `Fact ${index + 1}`,
              value:
                index % 4 === 0
                  ? 0
                  : index % 4 === 1
                    ? false
                    : index % 4 === 2
                      ? null
                      : `Value ${index + 1}`,
            },
          ],
        },
      ],
    })),
  };

  return status === "published"
    ? {
        state: "report",
        ...common,
        report: {
          status,
          ...reportCommon,
          publishedAt: "2026-09-01T10:00:00.000Z",
        },
      }
    : {
        state: "report",
        ...common,
        report: { status, ...reportCommon },
      };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getProjectForOrganization.mockResolvedValue({ id: projectId });
});

describe("growth_get_monthly_summary MCP tool", () => {
  it("is a closed-world, read-only, zero-credit adapter with only project scope as input", () => {
    expect(growthGetMonthlySummaryTool.name).toBe("growth_get_monthly_summary");
    expect(growthGetMonthlySummaryTool.config.annotations).toEqual({
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    });
    expect(growthGetMonthlySummaryTool.config.description).toMatch(
      /previous[- ]complete[- ]month/i,
    );
    expect(growthGetMonthlySummaryTool.config.description).toMatch(
      /(?:zero|no) credits/i,
    );
    expect(growthGetMonthlySummaryTool.config.description).toMatch(
      /(?:does not|never).*(?:build|publish)/i,
    );
    expect(Object.keys(growthGetMonthlySummaryTool.config.inputSchema)).toEqual(
      ["projectId"],
    );
  });

  it("denies an unauthorized project before reading or mutating reports", async () => {
    mocks.getProjectForOrganization.mockResolvedValue(null);

    await expect(
      growthGetMonthlySummaryTool.handler({ projectId }, context),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(mocks.getGrowthMonthlyReport).not.toHaveBeenCalled();
    expect(mocks.buildGrowthMonthlyReport).not.toHaveBeenCalled();
    expect(mocks.getGrowthMonthlyPublicationStatus).not.toHaveBeenCalled();
    expect(mocks.publishGrowthMonthlyReport).not.toHaveBeenCalled();
  });

  it("delegates exactly one current read and returns schema-valid data with a Growth deep link", async () => {
    const summary = savedReport("draft");
    mocks.getGrowthMonthlyReport.mockResolvedValue(summary);

    const result = await growthGetMonthlySummaryTool.handler(
      { projectId },
      context,
    );

    expect(mocks.getProjectForOrganization).toHaveBeenCalledWith(
      "org_123",
      projectId,
    );
    expect(mocks.getGrowthMonthlyReport).toHaveBeenCalledTimes(1);
    expect(mocks.getGrowthMonthlyReport).toHaveBeenCalledWith(projectId);
    expect(mocks.buildGrowthMonthlyReport).not.toHaveBeenCalled();
    expect(mocks.getGrowthMonthlyPublicationStatus).not.toHaveBeenCalled();
    expect(mocks.publishGrowthMonthlyReport).not.toHaveBeenCalled();
    expect(result.structuredContent).toEqual({
      summary,
      meta: {
        projectId,
        url: `https://open-seo.test/p/${projectId}/growth/operations#growth-monthly-summary`,
      },
    });

    const outputSchema = objectSchema(
      growthGetMonthlySummaryTool.config.outputSchema,
    );
    expect(outputSchema.safeParse(result.structuredContent).success).toBe(true);

    const withInternalActor = structuredClone(result.structuredContent);
    if (withInternalActor?.summary.state !== "report") {
      throw new Error("Expected a saved report fixture");
    }
    Object.assign(withInternalActor.summary.report, {
      actorId: "user_internal",
    });
    expect(outputSchema.safeParse(withInternalActor).success).toBe(false);
    expect(JSON.stringify(result.structuredContent)).not.toMatch(
      /actorId|evidence|source/i,
    );
  });

  it("truthfully distinguishes ready and no-activity states", async () => {
    const ready: GrowthMonthlyReportDto = { state: "ready", ...common };
    mocks.getGrowthMonthlyReport.mockResolvedValueOnce(ready);

    const readyResult = await growthGetMonthlySummaryTool.handler(
      { projectId },
      context,
    );
    const readyText = textContent(readyResult);
    expect(readyText).toMatch(/ready|no saved monthly summary/i);
    expect(readyText).toContain(common.periodStart);
    expect(readyText).toContain(common.periodEnd);
    expect(readyText).toContain(common.reportTimezone);
    expect(readyText).not.toMatch(/published at/i);

    const noActivity: GrowthMonthlyReportDto = {
      state: "no_activity",
      ...common,
      message: "No eligible saved activity was available when the build ran.",
    };
    mocks.getGrowthMonthlyReport.mockResolvedValueOnce(noActivity);

    const noActivityResult = await growthGetMonthlySummaryTool.handler(
      { projectId },
      context,
    );
    const noActivityText = textContent(noActivityResult);
    expect(noActivityText).toContain(noActivity.message);
    expect(noActivityText).toContain(common.periodStart);
    expect(noActivityText).toContain(common.periodEnd);
    expect(noActivityText).toContain(common.reportTimezone);
    expect(noActivityText).not.toMatch(/published at/i);
  });

  it.each(["draft", "published"] as const)(
    "renders every section, item, and fact in frozen order for a %s report",
    async (status) => {
      const summary = savedReport(status);
      mocks.getGrowthMonthlyReport.mockResolvedValue(summary);

      const result = await growthGetMonthlySummaryTool.handler(
        { projectId },
        context,
      );
      const text = textContent(result);

      expect(text).toContain(common.periodStart);
      expect(text).toContain(common.periodEnd);
      expect(text).toContain(common.reportTimezone);
      expect(text).toContain("2026-09-01T09:00:00.000Z");
      expect(text).toContain("2026-09-01T08:59:00.000Z");
      expect(text.toLowerCase()).toContain(status);
      if (status === "published") {
        expect(text).toContain("2026-09-01T10:00:00.000Z");
      } else {
        expect(text).not.toContain("2026-09-01T10:00:00.000Z");
        expect(text).not.toMatch(/published at/i);
      }

      if (summary.state !== "report") {
        throw new Error("Expected a saved report fixture");
      }
      let previousSection = -1;
      for (const section of summary.report.sections) {
        const sectionPosition = text.indexOf(section.title);
        expect(sectionPosition).toBeGreaterThan(previousSection);
        previousSection = sectionPosition;
        expect(text).toContain(section.summary);
        for (const item of section.items) {
          expect(text).toContain(item.title);
          expect(text).toContain(item.summary);
          for (const fact of item.facts) {
            expect(text).toContain(fact.label);
            expect(text).toContain(
              fact.value === null ? "Not available" : String(fact.value),
            );
          }
        }
      }
    },
  );
});
