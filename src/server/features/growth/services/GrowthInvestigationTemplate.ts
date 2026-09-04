import type { RecordGrowthSignalInput } from "@/types/schemas/growth";
import {
  investigationKeysForDescriptor,
  priorityPageInvestigationDescriptor,
  strikingDistanceInvestigationDescriptor,
  lowCtrInvestigationDescriptor,
  persistentRankDropInvestigationDescriptor,
  newCriticalAuditIssueInvestigationDescriptor,
} from "./GrowthInvestigationTemplateDescriptor";

export const GROWTH_INVESTIGATION_TEMPLATE_VERSION =
  "priority-page-investigation-v1";

export function investigationKeys(signalId: string) {
  return investigationKeysForDescriptor(
    priorityPageInvestigationDescriptor,
    signalId,
  );
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

export const STRIKING_DISTANCE_INVESTIGATION_TEMPLATE_VERSION =
  strikingDistanceInvestigationDescriptor.templateVersion;

function strikingDistanceInvestigationKeys(signalId: string) {
  return investigationKeysForDescriptor(
    strikingDistanceInvestigationDescriptor,
    signalId,
  );
}

type SavedSignal = RecordGrowthSignalInput & { id: string };

export function strikingDistanceInvestigationTemplate(input: {
  projectId: string;
  runId: string;
  signals: {
    averagePosition: SavedSignal;
    impressions: SavedSignal;
    clicks: SavedSignal;
  };
  query: string;
  page: string;
  site: string;
  commercialWeight: number | null;
}) {
  const keys = strikingDistanceInvestigationKeys(input.signals.impressions.id);
  const position = input.signals.averagePosition;
  const impressions = input.signals.impressions;
  const clicks = input.signals.clicks;
  const observed = `The query “${input.query}” averaged position ${position.currentValue.toFixed(1)} with ${impressions.currentValue} impressions and ${clicks.currentValue} clicks from ${position.periodStart} to ${position.periodEnd}.`;
  return {
    insight: {
      projectId: input.projectId,
      runId: input.runId,
      creationKey: keys.insight,
      title: "Observed striking-distance search query",
      explanation: observed,
      hypothesis:
        "The cause is unknown. This rule-based observation requires investigation before any change is proposed.",
      confidence: 0,
      signalIds: [position.id, impressions.id, clicks.id],
      model: null,
      promptVersion: null,
    },
    recommendation: {
      projectId: input.projectId,
      runId: input.runId,
      creationKey: keys.recommendation,
      title: "Investigate a striking-distance search query",
      rationale: `${observed} Review the query and affected page before deciding whether a website change is warranted; this is an investigation suggestion, not a diagnosis or promised uplift.`,
      category: "investigation",
      impact: 1,
      commercialRelevance: Math.min(
        5,
        Math.max(1, input.commercialWeight ?? 1),
      ),
      effort: 1,
      urgency: 1,
      confidence: 0,
      priorityScore: 0,
      targets: [
        { type: "keyword" as const, value: input.query },
        { type: "url" as const, value: input.page },
        { type: "site" as const, value: input.site },
      ],
      steps: [
        "Review saved Search Console query and page evidence.",
        "Inspect the target page, search intent and competing results.",
        "Decide whether a website change is warranted before proposing one.",
      ],
      model: null,
      promptVersion: null,
    },
  };
}

export const LOW_CTR_INVESTIGATION_TEMPLATE_VERSION =
  lowCtrInvestigationDescriptor.templateVersion;
export function lowCtrInvestigationTemplate(input: {
  projectId: string;
  runId: string;
  signals: {
    ctr: SavedSignal;
    averagePosition: SavedSignal;
    impressions: SavedSignal;
    clicks: SavedSignal;
  };
  query: string;
  page: string;
  site: string;
  commercialWeight: number | null;
}) {
  const keys = investigationKeysForDescriptor(
    lowCtrInvestigationDescriptor,
    input.signals.ctr.id,
  );
  const observed = `The query “${input.query}” had CTR ${(input.signals.ctr.baselineValue * 100).toFixed(1)}% in the preceding period and ${(input.signals.ctr.currentValue * 100).toFixed(1)}% (${input.signals.clicks.currentValue} clicks from ${input.signals.impressions.currentValue} impressions) at average position ${input.signals.averagePosition.currentValue.toFixed(1)} from ${input.signals.ctr.periodStart} to ${input.signals.ctr.periodEnd}.`;
  return {
    insight: {
      projectId: input.projectId,
      runId: input.runId,
      creationKey: keys.insight,
      title: "Observed high-impression CTR decline",
      explanation: observed,
      hypothesis:
        "The cause is unknown. This rule-based observation requires investigation before any change is proposed.",
      confidence: 0,
      signalIds: [
        input.signals.ctr.id,
        input.signals.clicks.id,
        input.signals.impressions.id,
        input.signals.averagePosition.id,
      ],
      model: null,
      promptVersion: null,
    },
    recommendation: {
      projectId: input.projectId,
      runId: input.runId,
      creationKey: keys.recommendation,
      title: "Investigate a high-impression CTR decline",
      rationale: `${observed} Review the query and affected page before deciding whether a website change is warranted; this is an investigation suggestion, not a diagnosis or promised uplift.`,
      category: "investigation",
      impact: 1,
      commercialRelevance: Math.min(
        5,
        Math.max(1, input.commercialWeight ?? 1),
      ),
      effort: 1,
      urgency: 1,
      confidence: 0,
      priorityScore: 0,
      targets: [
        { type: "keyword" as const, value: input.query },
        { type: "url" as const, value: input.page },
        { type: "site" as const, value: input.site },
      ],
      steps: [
        "Review saved Search Console query and page evidence.",
        "Inspect the target page and competing search results.",
        "Decide whether a website change is warranted before proposing one.",
      ],
      model: null,
      promptVersion: null,
    },
  };
}

export const PERSISTENT_RANK_DROP_INVESTIGATION_TEMPLATE_VERSION =
  persistentRankDropInvestigationDescriptor.templateVersion;

export function persistentRankDropInvestigationTemplate(input: {
  projectId: string;
  runId: string;
  signal: SavedSignal;
  keyword: string;
  device: "desktop" | "mobile";
  page: string;
  site: string;
  commercialWeight: number | null;
  serpDepth: number;
  positions: Array<number | null>;
}) {
  const keys = investigationKeysForDescriptor(
    persistentRankDropInvestigationDescriptor,
    input.signal.id,
  );
  const shown = input.positions.map((position) =>
    position === null
      ? `outside the top ${input.serpDepth}`
      : `position ${position}`,
  );
  const observed = `The tracked keyword “${input.keyword}” on ${input.device} moved from ${shown[0]} to ${shown.slice(1).join(", then ")} across three consecutive later checks.`;
  return {
    insight: {
      projectId: input.projectId,
      runId: input.runId,
      creationKey: keys.insight,
      title: "Observed persistent tracked-rank drop",
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
      title: "Investigate a persistent tracked-rank drop",
      rationale: `${observed} Review the affected page and search results before deciding whether a website change is warranted; this is an investigation suggestion, not a diagnosis or promised recovery.`,
      category: "investigation",
      impact: 1,
      commercialRelevance: Math.min(
        5,
        Math.max(1, input.commercialWeight ?? 1),
      ),
      effort: 1,
      urgency: input.signal.severity === "critical" ? 2 : 1,
      confidence: 0,
      priorityScore: 0,
      targets: [
        { type: "keyword" as const, value: input.keyword },
        { type: "url" as const, value: input.page },
        { type: "site" as const, value: input.site },
      ],
      steps: [
        "Review the four saved rank snapshots and the affected priority page.",
        "Inspect recent page, indexing and search-result changes for the keyword.",
        "Decide whether a website change is warranted before proposing one.",
      ],
      model: null,
      promptVersion: null,
    },
  };
}

export const NEW_CRITICAL_AUDIT_ISSUE_INVESTIGATION_TEMPLATE_VERSION =
  newCriticalAuditIssueInvestigationDescriptor.templateVersion;

export function newCriticalAuditIssueInvestigationTemplate(input: {
  projectId: string;
  runId: string;
  signal: SavedSignal;
  issueTitle: string;
  issueExplanation: string;
  howToFix: string;
  page: string;
  site: string;
  targetUrl: string | null;
}) {
  const keys = investigationKeysForDescriptor(
    newCriticalAuditIssueInvestigationDescriptor,
    input.signal.id,
  );
  const target = input.targetUrl
    ? ` The broken target is ${input.targetUrl}.`
    : "";
  const observed = `${input.issueTitle} first appears on ${input.page} in the latest comparable saved audit.${target}`;
  return {
    insight: {
      projectId: input.projectId,
      runId: input.runId,
      creationKey: keys.insight,
      title: `Observed new critical audit issue: ${input.issueTitle}`,
      explanation: `${observed} ${input.issueExplanation}`,
      hypothesis:
        "The cause is unknown. This rule-based comparison requires investigation before any change is proposed.",
      confidence: 0,
      signalIds: [input.signal.id],
      model: null,
      promptVersion: null,
    },
    recommendation: {
      projectId: input.projectId,
      runId: input.runId,
      creationKey: keys.recommendation,
      title: `Investigate new critical audit issue: ${input.issueTitle}`,
      rationale: `${observed} This is a deterministic investigation suggestion, not a diagnosis or promised outcome.`,
      category: "investigation",
      impact: 2,
      commercialRelevance: 1,
      effort: 1,
      urgency: 2,
      confidence: 0,
      priorityScore: 0,
      targets: [
        { type: "url" as const, value: input.page },
        { type: "site" as const, value: input.site },
      ],
      steps: [
        "Review the saved baseline and current audit evidence for this page.",
        input.howToFix,
        "Confirm the issue is resolved in a later audit before closing the work.",
      ],
      model: null,
      promptVersion: null,
    },
  };
}
