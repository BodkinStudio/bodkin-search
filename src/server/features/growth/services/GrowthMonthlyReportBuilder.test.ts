import { describe, expect, it } from "vitest";
import { buildGrowthMonthlyReportSections } from "./GrowthMonthlyReportBuilder";

type TestAction = {
  id: string;
  title: string;
  description: string;
  status: string;
  priorityScore: number;
  dueAt: string;
  implementedAt: string | null;
};

const action: TestAction = {
  id: "action_1",
  title: "Safe Action",
  description: "Work description",
  status: "ready",
  priorityScore: 10,
  dueAt: "2026-09-10T12:00:00.000Z",
  implementedAt: null,
};
const actionFor = (id: string, overrides: Partial<TestAction> = {}) => ({
  ...action,
  id,
  ...overrides,
});

const baseInput = {
  periodStart: "2026-08-01",
  periodEnd: "2026-08-31",
  dataCutoffAt: "2026-09-01T08:00:00.000Z",
  reportTimezone: "UTC",
} as const;

describe("buildGrowthMonthlyReportSections", () => {
  it("keeps all canonical sections, makes the executive item unsourced, and caps safe URLs", () => {
    const sections = buildGrowthMonthlyReportSections({
      performance: [],
      earlierResults: [],
      completed: [],
      risks: [],
      next: [],
      opportunities: [action],
      changes: [
        {
          id: "change_1",
          description: "Changed",
          changeType: "content_updated",
          happenedAt: "2026-08-10T12:00:00.000Z",
        },
      ],
      links: [],
      actionUrls: ["f", "a", "d", "b", "e", "c"].map((suffix) => ({
        actionId: action.id,
        url: `https://example.com/${suffix}?secret=1`,
      })),
      changeUrls: ["f", "a", "d", "b", "e", "c"].map((suffix) => ({
        changeEventId: "change_1",
        url: `https://example.com/change/${suffix}?secret=1`,
      })),
      ...baseInput,
    });
    expect(sections).toHaveLength(8);
    expect(sections?.[0].content.items[0].source).toBeNull();
    const facts =
      sections?.find(({ sectionType }) => sectionType === "opportunities")
        ?.content.items[0].facts ?? [];
    expect(facts.filter(({ label }) => label.startsWith("URL "))).toHaveLength(
      5,
    );
    expect(facts).toContainEqual(
      expect.objectContaining({ label: "Additional URLs", value: 1 }),
    );
    expect(facts.find(({ label }) => label === "URL 1")?.value).toBe(
      "https://example.com/a",
    );
    const changeFacts =
      sections?.find(({ sectionType }) => sectionType === "meaningful_changes")
        ?.content.items[0]?.facts ?? [];
    expect(
      changeFacts.filter(({ label }) => label.startsWith("URL ")),
    ).toHaveLength(5);
    expect(changeFacts).toContainEqual(
      expect.objectContaining({ label: "Additional URLs", value: 1 }),
    );
  });

  it("does not qualify a change-only candidate, even when it has one Action link", () => {
    expect(
      buildGrowthMonthlyReportSections({
        performance: [],
        earlierResults: [],
        completed: [],
        risks: [],
        next: [],
        opportunities: [],
        changes: [
          {
            id: "change_1",
            description: "Changed",
            changeType: "content_updated",
            happenedAt: "2026-08-10T12:00:00.000Z",
          },
        ],
        links: [{ changeEventId: "change_1", actionId: action.id }],
        actionUrls: [],
        changeUrls: [],
        ...baseInput,
      }),
    ).toBeNull();
  });

  it("renders closed-vocabulary change and measurement labels without raw enum values", () => {
    const sections = buildGrowthMonthlyReportSections({
      performance: [
        {
          id: "result_1",
          summary: "Measured",
          outcome: "strong_positive",
          confidence: 0.9,
          evaluatedAt: "2026-08-10T12:00:00.000Z",
          action,
        },
      ],
      earlierResults: [],
      completed: [],
      risks: [],
      next: [],
      opportunities: [],
      changes: [
        {
          id: "change_1",
          description: "Changed",
          changeType: "content_updated",
          happenedAt: "2026-08-10T12:00:00.000Z",
        },
      ],
      links: [],
      actionUrls: [],
      changeUrls: [],
      ...baseInput,
    });
    expect(
      sections?.find(({ sectionType }) => sectionType === "performance")
        ?.content.items[0]?.title,
    ).toBe("Measurement: Strong positive result");
    expect(
      sections?.find(({ sectionType }) => sectionType === "meaningful_changes")
        ?.content.items[0]?.title,
    ).toBe("Content updated");
  });

  it("projects only safe narrative and URL facts from action, change, and result inputs", () => {
    const privateEmail = "private.person@example.com";
    const privateToken = "VALUE_SHOULD_NOT_LEAK";
    const resultAction = {
      ...action,
      actorId: "actor_internal_only",
      evidenceRef: "evidence_internal_only",
    };
    const opportunityAction = {
      ...action,
      title: `Contact ${privateEmail}`,
      description:
        "Review https://example.com/encoded%40narrative.example?preview=1",
      sourceId: "source_internal_only",
    };
    const credentialAction = {
      ...action,
      id: "action_credential",
      title: "Credential-bearing Action",
      description: `api_key: ${privateToken}`,
    };
    const change = {
      id: "change_1",
      description: `Changed by ${privateEmail}; Authorization: Bearer ${privateToken}`,
      changeType: "content_updated",
      happenedAt: "2026-08-10T12:00:00.000Z",
      evidenceId: "change_evidence_internal_only",
    };
    const sections = buildGrowthMonthlyReportSections({
      performance: [
        {
          id: "result_1",
          summary: `Authorization: Bearer ${privateToken} ${privateEmail}`,
          outcome: "positive",
          confidence: 0.9,
          evaluatedAt: "2026-08-10T12:00:00.000Z",
          action: resultAction,
        },
      ],
      earlierResults: [],
      completed: [],
      risks: [],
      next: [],
      opportunities: [opportunityAction, credentialAction],
      changes: [change],
      links: [],
      actionUrls: [
        { actionId: action.id, url: "https://example.com/safe?preview=1" },
        {
          actionId: action.id,
          url: `https://example.com/${privateEmail}`,
        },
        {
          actionId: action.id,
          url: "https://example.com/private%40example.com",
        },
      ],
      changeUrls: [
        { changeEventId: "change_1", url: "https://example.com/change#top" },
        {
          changeEventId: "change_1",
          url: "https://user:password@example.com/private",
        },
      ],
      ...baseInput,
    });

    const output = JSON.stringify(sections);
    for (const privateValue of [
      privateEmail,
      privateToken,
      "actor_internal_only",
      "evidence_internal_only",
      "source_internal_only",
      "change_evidence_internal_only",
      "encoded%40narrative.example",
    ])
      expect(output).not.toContain(privateValue);
    expect(output).toContain("https://example.com/safe");
    expect(output).toContain("https://example.com/change");
    expect(output).not.toContain("private%40example.com");
  });

  it("applies every section cap and freezes overflow disclosure", () => {
    const actions = Array.from({ length: 13 }, (_, index) =>
      actionFor(`action_${String(index).padStart(2, "0")}`),
    );
    const results = Array.from({ length: 21 }, (_, index) => ({
      id: `result_${String(index).padStart(2, "0")}`,
      summary: `Measured ${index}`,
      outcome: "positive",
      confidence: 0.8,
      evaluatedAt: "2026-08-10T12:00:00.000Z",
      action: actionFor(`result_action_${index}`, {
        implementedAt: "2026-07-10T12:00:00.000Z",
      }),
    }));
    const sections = buildGrowthMonthlyReportSections({
      performance: results,
      earlierResults: results,
      completed: actions.map((value) => ({
        ...value,
        status: "implemented",
        implementedAt: "2026-08-10T12:00:00.000Z",
      })),
      risks: actions.map((value) => ({ ...value, status: "blocked" })),
      next: actions,
      opportunities: actions,
      changes: actions.map((value) => ({
        id: `change_${value.id}`,
        description: `Changed ${value.id}`,
        changeType: "content_updated",
        happenedAt: "2026-08-10T12:00:00.000Z",
      })),
      links: [],
      actionUrls: [],
      changeUrls: [],
      ...baseInput,
    });
    const expectedCaps = {
      performance: 20,
      meaningful_changes: 12,
      work_completed: 12,
      results_from_earlier_work: 20,
      risks: 12,
      opportunities: 12,
      next_month: 12,
    } as const;
    for (const [sectionType, cap] of Object.entries(expectedCaps)) {
      const section = sections?.find(
        (candidate) => candidate.sectionType === sectionType,
      );
      expect(section?.content.items).toHaveLength(cap);
      expect(section?.content.summary).toContain(
        `Showing ${cap} of at least ${cap + 1}.`,
      );
    }
  });

  it("uses code-unit IDs after every documented section sort key", () => {
    const tiedActions = [actionFor("z"), actionFor("A")];
    const tiedResults = ["z", "A"].map((id) => ({
      id,
      summary: `Result ${id}`,
      outcome: "positive",
      confidence: 0.8,
      evaluatedAt: "2026-08-10T12:00:00.000Z",
      action: actionFor(`result_action_${id}`, {
        implementedAt: "2026-07-10T12:00:00.000Z",
      }),
    }));
    const sections = buildGrowthMonthlyReportSections({
      performance: tiedResults,
      earlierResults: tiedResults,
      completed: tiedActions.map((value) => ({
        ...value,
        status: "implemented",
        implementedAt: "2026-08-10T12:00:00.000Z",
      })),
      risks: tiedActions.map((value) => ({ ...value, status: "blocked" })),
      next: tiedActions,
      opportunities: tiedActions,
      changes: tiedActions.map((value) => ({
        id: value.id,
        description: `Change ${value.id}`,
        changeType: "content_updated",
        happenedAt: "2026-08-10T12:00:00.000Z",
      })),
      links: [],
      actionUrls: [],
      changeUrls: [],
      ...baseInput,
    });
    const sourceIds = (sectionType: string) =>
      sections
        ?.find((candidate) => candidate.sectionType === sectionType)
        ?.content.items.map((candidate) => candidate.source?.id);
    for (const sectionType of [
      "work_completed",
      "risks",
      "opportunities",
      "next_month",
    ])
      expect(sourceIds(sectionType)).toEqual(["A", "z"]);
    for (const sectionType of ["performance", "results_from_earlier_work"])
      expect(sourceIds(sectionType)).toEqual(["A", "z"]);
    expect(
      sections
        ?.find(({ sectionType }) => sectionType === "meaningful_changes")
        ?.content.items.map(({ summary }) => summary),
    ).toEqual(["Change A", "Change z"]);
  });
});
