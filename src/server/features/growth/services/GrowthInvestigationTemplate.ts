import type { RecordGrowthSignalInput } from "@/types/schemas/growth";

export const GROWTH_INVESTIGATION_TEMPLATE_VERSION =
  "priority-page-investigation-v1";

export function investigationKeys(signalId: string) {
  return {
    insight: `${GROWTH_INVESTIGATION_TEMPLATE_VERSION}:insight:${signalId}`,
    recommendation: `${GROWTH_INVESTIGATION_TEMPLATE_VERSION}:recommendation:${signalId}`,
    action: `${GROWTH_INVESTIGATION_TEMPLATE_VERSION}:action:${signalId}`,
  };
}

export function priorityPageInvestigationTemplate(input: {
  projectId: string;
  runId: string;
  signal: RecordGrowthSignalInput & { id: string };
  keyPage: { url: string; commercialWeight: number | null };
}) {
  const keys = investigationKeys(input.signal.id);
  const url = input.keyPage.url;
  const observed = `Baseline clicks: ${input.signal.baselineValue}. Current clicks for ${input.signal.periodStart} to ${input.signal.periodEnd}: ${input.signal.currentValue} (${input.signal.deltaValue >= 0 ? "+" : ""}${input.signal.deltaValue}).`;
  return {
    insight: {
      projectId: input.projectId,
      runId: input.runId,
      creationKey: keys.insight,
      title: "Observed priority-page click decline",
      explanation: observed,
      hypothesis:
        "The cause is unknown. This rule-based observation requires investigation before any change is proposed.",
      confidence: 0,
      signalIds: [input.signal.id],
      model: null,
      promptVersion: null,
    },
    recommendation: {
      projectId: input.projectId,
      runId: input.runId,
      creationKey: keys.recommendation,
      title: "Investigate a priority-page search click decline",
      rationale: `${observed} Cause is unknown; this is a deterministic investigation suggestion, not a diagnosis or promised uplift.`,
      category: "investigation",
      impact: 1,
      commercialRelevance: Math.min(
        5,
        Math.max(1, input.keyPage.commercialWeight ?? 1),
      ),
      effort: 1,
      urgency: 1,
      confidence: 0,
      priorityScore: 0,
      targets: [{ type: "url" as const, value: url }],
      steps: [
        "Review saved Search Console page and query evidence.",
        "Inspect known changes and indexing signals for the target page.",
        "Decide whether a website change is warranted before proposing one.",
      ],
      model: null,
      promptVersion: null,
    },
  };
}
