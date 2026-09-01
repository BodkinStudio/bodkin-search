import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { objectSchema } from "@/server/mcp/output-schemas";
import type { GrowthProjectSummaryDto } from "@/types/schemas/growth-project-summary";
import { growthGetProjectSummaryTool } from "./growth-project-summary-tool";
import { makeToolContext, textContent } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  getProjectSummary: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));

vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));

vi.mock(
  "@/server/features/growth/services/GrowthProjectSummaryService",
  () => ({
    GrowthProjectSummaryService: {
      getProjectSummary: mocks.getProjectSummary,
    },
  }),
);

const projectId = "project_1";
const project = {
  id: projectId,
  organizationId: "org_123",
  name: "Example growth",
  domain: "example.com",
  locationCode: 2826,
  languageCode: "en",
  createdAt: "2026-08-01T09:00:00.000Z",
  archivedAt: null,
};
const context = makeToolContext({ baseUrl: "https://open-seo.test" });

const summary: GrowthProjectSummaryDto = {
  asOf: "2026-09-01T12:00:00.000Z",
  consistency: "current_not_snapshot",
  project: {
    id: projectId,
    name: { value: "Example growth", redacted: false, truncated: false },
    url: {
      value: "https://example.com/",
      queryOrFragmentOmitted: false,
      withheld: false,
    },
    market: { locationCode: 2826, languageCode: "en" },
    createdAt: "2026-08-01T09:00:00.000Z",
  },
  settings: {
    growthEnabled: true,
    reportTimezone: "Europe/London",
    reportCadence: "monthly",
    reportDay: 1,
    defaultBaselineDays: 28,
    defaultCooldownDays: 7,
    defaultPrimaryWindowDays: 28,
    defaultLongWindowDays: 55,
    persisted: true,
    updatedAt: "2026-08-02T09:00:00.000Z",
  },
  context: {
    scope: "typed_sections_with_other_context_counts_only",
    sections: [
      {
        key: "business_overview",
        content: {
          value: "A specialist agency.",
          redacted: false,
          truncated: false,
        },
        updatedAt: "2026-08-02T09:00:00.000Z",
      },
      { key: "current_goal", content: null, updatedAt: null },
      { key: "positioning", content: null, updatedAt: null },
      { key: "writing_preferences", content: null, updatedAt: null },
    ],
    missingSections: ["current_goal", "positioning", "writing_preferences"],
    typedSectionPresence: "some",
    customSectionCount: 1,
    competitorCount: 2,
    keyPageCount: 3,
    researchLog: { retainedCount: 4, retentionLimited: false },
  },
  freshness: {
    scope: "saved_growth_signals",
    latestSignalAt: "2026-08-31T09:00:00.000Z",
    byKind: [
      {
        evidenceKind: "gsc_period",
        capturedAt: "2026-08-31T09:00:00.000Z",
      },
    ],
  },
  latestRun: {
    id: "run_1",
    runType: "weekly_review",
    trigger: "scheduled",
    status: "completed",
    periodStart: "2026-08-24",
    periodEnd: "2026-08-30",
    startedAt: "2026-08-31T08:00:00.000Z",
    completedAt: "2026-08-31T09:00:00.000Z",
  },
  unresolvedRecommendations: {
    items: [
      {
        id: "recommendation_1",
        status: "proposed",
        title: {
          value: "Clarify the pricing page",
          redacted: false,
          truncated: false,
        },
        rationale: {
          value: "The page has demand but weak conversion intent.",
          redacted: false,
          truncated: false,
        },
        category: { value: "content", redacted: false, truncated: false },
        impact: 4,
        commercialRelevance: 5,
        effort: 2,
        urgency: 2,
        confidence: 0.8,
        priorityScore: 42,
        snoozedUntil: null,
        needsAction: false,
        createdAt: "2026-08-30T09:00:00.000Z",
      },
    ],
    hasMore: true,
  },
  currentActions: {
    items: [
      {
        id: "action_1",
        title: {
          value: "Ship pricing improvements",
          redacted: false,
          truncated: false,
        },
        category: { value: "content", redacted: false, truncated: false },
        priorityScore: 40,
        status: "ready",
        version: 1,
        dueAt: "2026-09-15T09:00:00.000Z",
        updatedAt: "2026-08-31T10:00:00.000Z",
      },
    ],
    hasMore: false,
  },
  recentSignals: {
    items: [
      {
        id: "signal_1",
        signalType: {
          value: "traffic_decline",
          redacted: false,
          truncated: false,
        },
        entityType: { value: "url", redacted: false, truncated: false },
        metric: {
          value: "search_clicks",
          redacted: false,
          truncated: false,
        },
        severity: "critical",
        confidence: 0.9,
        periodStart: "2026-08-24",
        periodEnd: "2026-08-30",
        baselineValue: 100,
        currentValue: 60,
        deltaValue: -40,
        deltaPercent: -40,
        evidenceKind: "gsc_period",
        runStatus: "completed",
        capturedAt: "2026-08-31T09:00:00.000Z",
      },
    ],
    hasMore: false,
  },
  dueMeasurements: {
    scanState: "complete",
    items: [
      {
        id: "plan_1",
        actionId: "action_1",
        actionTitle: {
          value: "Ship pricing improvements",
          redacted: false,
          truncated: false,
        },
        availableOn: "2026-09-01",
        reportTimezone: "Europe/London",
        actionStatus: "measuring",
        integrity: "consistent",
      },
    ],
    hasMore: false,
  },
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getProjectForOrganization.mockResolvedValue(project);
  mocks.getProjectSummary.mockResolvedValue(summary);
});

describe("growth_get_project_summary MCP tool", () => {
  it("declares one bounded, provider-free saved-record read", () => {
    expect(growthGetProjectSummaryTool.name).toBe("growth_get_project_summary");
    expect(growthGetProjectSummaryTool.config.annotations).toEqual({
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    });
    expect(growthGetProjectSummaryTool.config.description).toMatch(/saved/i);
    expect(growthGetProjectSummaryTool.config.description).toMatch(
      /zero credits/i,
    );
    expect(growthGetProjectSummaryTool.config.description).toMatch(
      /no provider calls/i,
    );
    expect(growthGetProjectSummaryTool.config.description).toMatch(
      /not an atomic historical snapshot/i,
    );
    expect(Object.keys(growthGetProjectSummaryTool.config.inputSchema)).toEqual(
      ["projectId"],
    );
  });

  it("denies a foreign project before summary storage is read", async () => {
    mocks.getProjectForOrganization.mockResolvedValue(null);
    const input = z
      .object(growthGetProjectSummaryTool.config.inputSchema)
      .parse({ projectId });

    await expect(
      growthGetProjectSummaryTool.handler(input, context),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.getProjectSummary).not.toHaveBeenCalled();
  });

  it("passes only the authorized project allowlist and returns strict output", async () => {
    const input = z
      .object(growthGetProjectSummaryTool.config.inputSchema)
      .parse({ projectId });
    const result = await growthGetProjectSummaryTool.handler(input, context);

    expect(mocks.getProjectForOrganization).toHaveBeenCalledWith(
      "org_123",
      projectId,
    );
    expect(mocks.getProjectSummary).toHaveBeenCalledWith({
      id: projectId,
      name: project.name,
      domain: project.domain,
      locationCode: project.locationCode,
      languageCode: project.languageCode,
      createdAt: project.createdAt,
    });
    expect(result.structuredContent).toEqual({
      summary,
      meta: {
        projectId,
        url: `https://open-seo.test/p/${projectId}/growth`,
      },
    });

    const output = objectSchema(
      growthGetProjectSummaryTool.config.outputSchema,
    );
    expect(output.safeParse(result.structuredContent).success).toBe(true);
    expect(
      output.safeParse({
        ...result.structuredContent,
        summary: { ...summary, organizationId: "private_org" },
      }).success,
    ).toBe(false);
  });

  it("summarizes only the bounded DTO and labels freshness and consistency", async () => {
    const result = await growthGetProjectSummaryTool.handler(
      { projectId },
      context,
    );
    const text = textContent(result);

    expect(text).toContain(summary.project.name.value);
    expect(text).toContain(summary.asOf);
    expect(text).toContain("not an atomic historical snapshot");
    expect(text).toContain("not live provider freshness");
    expect(text).toContain(
      summary.unresolvedRecommendations.items[0].title.value,
    );
    expect(text).toContain(summary.currentActions.items[0].title.value);
    expect(text).toContain(summary.recentSignals.items[0].metric.value);
    expect(text).toContain(summary.dueMeasurements.items[0].integrity);
    expect(text).not.toContain(
      summary.unresolvedRecommendations.items[0].rationale.value,
    );
    expect(text).not.toContain("org_123");
  });

  it("withholds a partial Measurement list on overflow", async () => {
    mocks.getProjectSummary.mockResolvedValue({
      ...summary,
      dueMeasurements: {
        scanState: "overflow",
        items: [],
        hasMore: true,
      },
    });
    const result = await growthGetProjectSummaryTool.handler(
      { projectId },
      context,
    );
    const text = textContent(result);

    expect(text).toMatch(/exceeded its safe bound/i);
    expect(text).toMatch(/no partial due list/i);
    expect(text).not.toContain("No due active Measurement window");
  });
});
