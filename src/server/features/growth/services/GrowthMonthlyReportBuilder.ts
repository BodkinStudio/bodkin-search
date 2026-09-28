import { calendarDateInTimezone } from "./GrowthMeasurementFacts";
import {
  growthEvidenceDisplayActionText,
  growthEvidenceDisplayChangeDescription,
  growthEvidenceDisplayMeasurementSummary,
  growthEvidenceDisplayUrl,
} from "./GrowthEvidencePacket";
import {
  GROWTH_REPORT_SECTION_POSITIONS,
  type GrowthReportSection,
} from "@/types/schemas/growth-reports";

type Action = {
  id: string;
  title: string;
  description: string;
  status: string;
  priorityScore: number;
  dueAt: string;
  implementedAt: string | null;
};
type Change = {
  id: string;
  description: string;
  changeType: string;
  happenedAt: string;
};
type Result = {
  id: string;
  summary: string;
  outcome: string;
  confidence: number;
  evaluatedAt: string;
  action: Action;
};
type Sources = {
  performance: Result[];
  earlierResults: Result[];
  completed: Action[];
  risks: Action[];
  next: Action[];
  opportunities: Action[];
  changes: Change[];
  links: { changeEventId: string; actionId: string }[];
  actionUrls: { actionId: string; url: string }[];
  changeUrls: { changeEventId: string; url: string }[];
};

export const GROWTH_MONTHLY_REPORT_BUILDER_VERSION = "growth-monthly-report-v1";
const CAPS = {
  performance: 20,
  meaningful_changes: 12,
  work_completed: 12,
  results_from_earlier_work: 20,
  risks: 12,
  next_month: 12,
  opportunities: 12,
} as const;
const CHANGE_TYPE_LABELS: Record<string, string> = {
  content_updated: "Content updated",
  title_meta_updated: "Title or metadata updated",
  page_created: "Page created",
  page_removed: "Page removed",
  redirect_changed: "Redirect changed",
  internal_links_changed: "Internal links changed",
  template_changed: "Template changed",
  structured_data_changed: "Structured data changed",
  technical_fix: "Technical fix",
  design_restructure: "Design restructure",
  migration: "Migration",
  unknown: "Recorded change",
  mixed: "Multiple changes",
};
const OUTCOME_LABELS: Record<string, string> = {
  strong_positive: "Strong positive result",
  positive: "Positive result",
  inconclusive: "Inconclusive result",
  neutral: "Neutral result",
  negative: "Negative result",
  strong_negative: "Strong negative result",
  not_measurable: "Not measurable",
};
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const item = (
  position: number,
  title: string,
  summary: string,
  facts: { label: string; value: string | number | boolean | null }[],
  source: { type: "action" | "measurement_result"; id: string } | null,
) => ({
  key: `item-${position}`,
  position,
  title,
  summary,
  facts: facts.map((fact, index) => ({
    key: `fact-${index}`,
    position: index,
    ...fact,
  })),
  evidence: [],
  source,
});
function section(
  type: keyof typeof GROWTH_REPORT_SECTION_POSITIONS,
  items: ReturnType<typeof item>[],
  summary: string,
): GrowthReportSection {
  return {
    sectionType: type,
    position: GROWTH_REPORT_SECTION_POSITIONS[type],
    content: { summary, items },
  };
}
function capped<T>(values: T[], cap: number) {
  const selected = values.slice(0, cap);
  return {
    selected,
    summary:
      values.length > cap
        ? `Showing ${cap} of at least ${cap + 1}.`
        : selected.length
          ? `${selected.length} selected item${selected.length === 1 ? "" : "s"}.`
          : "No qualifying items in this period.",
  };
}

export function buildGrowthMonthlyReportSections(
  input: Sources & {
    periodStart: string;
    periodEnd: string;
    dataCutoffAt: string;
    reportTimezone: string;
  },
) {
  const date = (value: string) =>
    calendarDateInTimezone(value, input.reportTimezone);
  const urlFacts = (urls: string[]) => {
    const safe = [
      ...new Set(
        urls
          .map((url) => growthEvidenceDisplayUrl(url).value)
          .filter((url): url is string => url != null),
      ),
    ].toSorted(cmp);
    return [
      ...safe
        .slice(0, 5)
        .map((value, index) => ({ label: `URL ${index + 1}`, value })),
      ...(safe.length > 5
        ? [{ label: "Additional URLs", value: safe.length - 5 }]
        : []),
    ];
  };
  const actionItem = (action: Action, position: number) =>
    item(
      position,
      growthEvidenceDisplayActionText(action.title).content,
      growthEvidenceDisplayActionText(action.description).content,
      [
        { label: "Status", value: action.status },
        { label: "Due date", value: date(action.dueAt) },
        ...urlFacts(
          input.actionUrls
            .filter(({ actionId }) => actionId === action.id)
            .map(({ url }) => url),
        ),
      ],
      { type: "action", id: action.id },
    );
  const resultItem = (result: Result, position: number) =>
    item(
      position,
      `Measurement: ${OUTCOME_LABELS[result.outcome] ?? "Recorded result"}`,
      growthEvidenceDisplayMeasurementSummary(result.summary).content,
      [
        { label: "Evaluated", value: date(result.evaluatedAt) },
        { label: "Confidence", value: result.confidence },
        ...urlFacts(
          input.actionUrls
            .filter(({ actionId }) => actionId === result.action.id)
            .map(({ url }) => url),
        ),
      ],
      { type: "measurement_result", id: result.id },
    );
  const results = [...input.performance].toSorted(
    (left, right) =>
      right.evaluatedAt.localeCompare(left.evaluatedAt) ||
      cmp(left.id, right.id),
  );
  const completed = [...input.completed].toSorted(
    (left, right) =>
      right.implementedAt!.localeCompare(left.implementedAt!) ||
      right.priorityScore - left.priorityScore ||
      cmp(left.id, right.id),
  );
  const changeLinks = new Map<string, string[]>();
  for (const link of input.links) {
    const list = changeLinks.get(link.changeEventId) ?? [];
    list.push(link.actionId);
    changeLinks.set(link.changeEventId, list);
  }
  const changes = [...input.changes].toSorted(
    (left, right) =>
      right.happenedAt.localeCompare(left.happenedAt) || cmp(left.id, right.id),
  );
  const risks = [...input.risks].toSorted(
    (left, right) =>
      Number(right.status === "blocked") - Number(left.status === "blocked") ||
      left.dueAt.localeCompare(right.dueAt) ||
      right.priorityScore - left.priorityScore ||
      cmp(left.id, right.id),
  );
  const next = [...input.next].toSorted(
    (left, right) =>
      left.dueAt.localeCompare(right.dueAt) ||
      right.priorityScore - left.priorityScore ||
      cmp(left.id, right.id),
  );
  const opportunities = [...input.opportunities].toSorted(
    (left, right) =>
      right.priorityScore - left.priorityScore ||
      left.dueAt.localeCompare(right.dueAt) ||
      cmp(left.id, right.id),
  );
  const perf = capped(results, CAPS.performance),
    completedCap = capped(completed, CAPS.work_completed),
    earlier = capped(
      [...input.earlierResults].toSorted(
        (left, right) =>
          right.evaluatedAt.localeCompare(left.evaluatedAt) ||
          cmp(left.id, right.id),
      ),
      CAPS.results_from_earlier_work,
    ),
    risk = capped(risks, CAPS.risks),
    nextCap = capped(next, CAPS.next_month),
    opp = capped(opportunities, CAPS.opportunities);
  const changesCap = capped(changes, CAPS.meaningful_changes);
  const changeItems = changesCap.selected.map((c, i) => {
    const linked = changeLinks.get(c.id) ?? [];
    const source =
      linked.length === 1 ? { type: "action" as const, id: linked[0] } : null;
    return item(
      i,
      CHANGE_TYPE_LABELS[c.changeType] ?? "Recorded change",
      growthEvidenceDisplayChangeDescription(c.description).content,
      [
        { label: "Changed", value: date(c.happenedAt) },
        ...urlFacts(
          input.changeUrls
            .filter(({ changeEventId }) => changeEventId === c.id)
            .map(({ url }) => url),
        ),
      ],
      source,
    );
  });
  const directSource =
    perf.selected.length > 0 ||
    completedCap.selected.length > 0 ||
    risk.selected.length > 0 ||
    nextCap.selected.length > 0 ||
    opp.selected.length > 0 ||
    earlier.selected.length > 0;
  if (!directSource) return null;
  return [
    section(
      "executive_summary",
      [
        item(
          0,
          "Monthly Growth summary",
          `${completedCap.selected.length} completed Actions shown and ${perf.selected.length} saved Measurement Results shown in the period.`,
          [
            {
              label: "Completed Actions shown",
              value: completedCap.selected.length,
            },
            { label: "Measurement Results shown", value: perf.selected.length },
          ],
          null,
        ),
      ],
      "A bounded summary of saved Growth facts; it does not make whole-site or causal claims.",
    ),
    section(
      "performance",
      perf.selected.map(resultItem),
      `Saved Growth Measurements. ${perf.summary}`,
    ),
    section("meaningful_changes", changeItems, changesCap.summary),
    section(
      "work_completed",
      completedCap.selected.map(actionItem),
      completedCap.summary,
    ),
    section(
      "results_from_earlier_work",
      earlier.selected.map(resultItem),
      earlier.summary,
    ),
    section("risks", risk.selected.map(actionItem), risk.summary),
    section("opportunities", opp.selected.map(actionItem), opp.summary),
    section("next_month", nextCap.selected.map(actionItem), nextCap.summary),
  ];
}
