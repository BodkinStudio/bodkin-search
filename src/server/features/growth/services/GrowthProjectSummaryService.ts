import { AppError } from "@/server/lib/errors";
import { getProjectContext } from "@/server/features/project-context/services/ProjectContextService";
import { PROJECT_CONTEXT_SECTION_KEYS } from "@/types/schemas/projectContext";
import {
  growthProjectSummaryDtoSchema,
  type GrowthProjectSummaryDto,
} from "@/types/schemas/growth-project-summary";
import { GrowthProjectSummaryRepository } from "../repositories/GrowthProjectSummaryRepository";
import { GrowthDueMeasurementsService } from "./GrowthDueMeasurementsService";
import { GrowthSettingsService } from "./GrowthSettingsService";
import { canonicalTimestamp } from "./GrowthMeasurementFacts";
import {
  growthEvidenceDisplayActionText,
  growthEvidenceDisplayUrl,
} from "./GrowthEvidencePacket";

const DISPLAY_LIMIT = 5;

type UnresolvedRecommendationRow = Awaited<
  ReturnType<
    typeof GrowthProjectSummaryRepository.listUnresolvedRecommendations
  >
>[number];
type CurrentActionRow = Awaited<
  ReturnType<typeof GrowthProjectSummaryRepository.listCurrentActions>
>[number];
type RecentSignalRow = Awaited<
  ReturnType<typeof GrowthProjectSummaryRepository.listRecentSignals>
>[number];
type SignalFreshnessRow = Awaited<
  ReturnType<typeof GrowthProjectSummaryRepository.listSignalFreshness>
>[number];
type AuthorizedProject = {
  id: string;
  name: string;
  domain: string | null;
  locationCode: number | null;
  languageCode: string | null;
  createdAt: string;
};

function boundedText(value: string, max: number) {
  const projected = growthEvidenceDisplayActionText(value);
  return {
    value: projected.content.slice(0, max),
    redacted: projected.redacted,
    truncated: projected.truncated || projected.content.length > max,
  };
}

function canonical(value: string | null | undefined, label: string) {
  return value == null ? null : canonicalTimestamp(value, label);
}

function requireCanonical(value: string, label: string) {
  const result = canonical(value, label);
  if (!result) throw new AppError("INTERNAL_ERROR", `${label} is missing`);
  return result;
}

function derivedProjectUrl(domain: string | null) {
  if (!domain) return null;
  const candidate =
    domain.startsWith("http://") || domain.startsWith("https://")
      ? domain
      : `https://${domain}`;
  const projection = growthEvidenceDisplayUrl(candidate);
  return {
    value: projection.value,
    queryOrFragmentOmitted: projection.omitted,
    withheld: projection.withheld,
  };
}

function projectContext(
  context: Awaited<ReturnType<typeof getProjectContext>>,
) {
  const byKey = new Map(
    context.sections.map((section) => [section.key, section]),
  );
  const sections = PROJECT_CONTEXT_SECTION_KEYS.map((key) => {
    const section = byKey.get(key);
    return {
      key,
      content: section ? boundedText(section.content, 800) : null,
      updatedAt: section
        ? requireCanonical(section.updatedAt, "Context updatedAt")
        : null,
    };
  });
  const missingSections = PROJECT_CONTEXT_SECTION_KEYS.filter(
    (key) => !byKey.has(key),
  );
  return {
    sections,
    missingSections,
    scope: "typed_sections_with_other_context_counts_only" as const,
    typedSectionPresence:
      missingSections.length === PROJECT_CONTEXT_SECTION_KEYS.length
        ? ("none" as const)
        : missingSections.length === 0
          ? ("all" as const)
          : ("some" as const),
    customSectionCount: context.customSections.length,
    competitorCount: context.competitors.length,
    keyPageCount: context.keyPages.length,
    researchLog: {
      retainedCount: context.researchLog.length,
      // The service intentionally reads the retained 20-row rolling window.
      retentionLimited: context.researchLog.length >= 20,
    },
  };
}

function unresolvedRecommendation(row: UnresolvedRecommendationRow) {
  return {
    id: row.id,
    status: row.status,
    title: boundedText(row.title, 300),
    rationale: boundedText(row.rationale, 400),
    category: boundedText(row.category, 100),
    impact: row.impact,
    commercialRelevance: row.commercialRelevance,
    effort: row.effort,
    urgency: row.urgency,
    confidence: row.confidence,
    priorityScore: row.priorityScore,
    snoozedUntil: canonical(row.snoozedUntil, "Recommendation snoozedUntil"),
    needsAction: row.status === "accepted",
    createdAt: requireCanonical(row.createdAt, "Recommendation createdAt"),
  };
}

function currentAction(row: CurrentActionRow) {
  return {
    id: row.id,
    title: boundedText(row.title, 300),
    category: boundedText(row.category, 100),
    priorityScore: row.priorityScore,
    status: row.status,
    version: row.stateVersion,
    dueAt: requireCanonical(row.dueAt, "Action dueAt"),
    updatedAt: requireCanonical(row.updatedAt, "Action updatedAt"),
  };
}

function recentSignal(row: RecentSignalRow, asOf: string) {
  const capturedAt = requireCanonical(row.capturedAt, "Signal capturedAt");
  if (capturedAt > asOf) return null;
  return {
    id: row.id,
    signalType: boundedText(row.signalType, 100),
    entityType: boundedText(row.entityType, 100),
    metric: boundedText(row.metric, 200),
    severity: row.severity,
    confidence: row.confidence,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    baselineValue: row.baselineValue,
    currentValue: row.currentValue,
    deltaValue: row.deltaValue,
    deltaPercent: row.deltaPercent,
    evidenceKind: row.evidenceKind,
    runStatus: row.runStatus,
    capturedAt,
  };
}

async function getProjectSummary(
  project: AuthorizedProject,
  options: { now?: Date } = {},
): Promise<GrowthProjectSummaryDto> {
  const now = options.now ?? new Date();
  if (Number.isNaN(now.valueOf()))
    throw new AppError("VALIDATION_ERROR", "Summary clock is invalid");
  const asOf = now.toISOString();
  const [
    settings,
    context,
    recommendations,
    actions,
    signals,
    signalFreshness,
    latestRun,
    dueMeasurements,
  ] = await Promise.all([
    GrowthSettingsService.getSettings(project.id),
    getProjectContext(project.id),
    GrowthProjectSummaryRepository.listUnresolvedRecommendations(
      project.id,
      DISPLAY_LIMIT + 1,
    ),
    GrowthProjectSummaryRepository.listCurrentActions(
      project.id,
      DISPLAY_LIMIT + 1,
    ),
    GrowthProjectSummaryRepository.listRecentSignals(
      project.id,
      asOf,
      DISPLAY_LIMIT + 1,
    ),
    GrowthProjectSummaryRepository.listSignalFreshness(project.id, asOf),
    GrowthProjectSummaryRepository.getLatestRun(project.id, asOf),
    GrowthDueMeasurementsService.getDueMeasurements(project.id, { now }),
  ]);
  const safeSignals = signals.map((signal) => recentSignal(signal, asOf));
  if (safeSignals.some((signal) => signal === null))
    throw new AppError(
      "INTERNAL_ERROR",
      "Signal read returned data after the summary cutoff",
    );

  const byKind = signalFreshness.map((row: SignalFreshnessRow) => {
    const capturedAt = requireCanonical(
      row.capturedAt,
      "Signal freshness capturedAt",
    );
    if (capturedAt > asOf)
      throw new AppError(
        "INTERNAL_ERROR",
        "Signal freshness returned data after the summary cutoff",
      );
    return { evidenceKind: row.evidenceKind, capturedAt };
  });
  const latestSignalAt = byKind.reduce<string | null>(
    (latest, row) =>
      !latest || row.capturedAt > latest ? row.capturedAt : latest,
    null,
  );
  return growthProjectSummaryDtoSchema.parse({
    asOf,
    consistency: "current_not_snapshot",
    project: {
      id: project.id,
      name: boundedText(project.name, 120),
      url: derivedProjectUrl(project.domain),
      market: {
        locationCode: project.locationCode,
        languageCode: project.languageCode,
      },
      createdAt: requireCanonical(project.createdAt, "Project createdAt"),
    },
    settings: {
      growthEnabled: settings.growthEnabled,
      reportTimezone: settings.reportTimezone,
      reportCadence: settings.reportCadence,
      reportDay: settings.reportDay,
      defaultBaselineDays: settings.defaultBaselineDays,
      defaultCooldownDays: settings.defaultCooldownDays,
      defaultPrimaryWindowDays: settings.defaultPrimaryWindowDays,
      defaultLongWindowDays: settings.defaultLongWindowDays,
      persisted: settings.persisted,
      updatedAt: canonical(settings.updatedAt, "Settings updatedAt"),
    },
    context: projectContext(context),
    freshness: {
      scope: "saved_growth_signals",
      latestSignalAt,
      byKind,
    },
    latestRun:
      latestRun == null
        ? null
        : {
            id: latestRun.id,
            runType: latestRun.runType,
            trigger: latestRun.trigger,
            status: latestRun.status,
            periodStart: latestRun.periodStart,
            periodEnd: latestRun.periodEnd,
            startedAt: requireCanonical(latestRun.startedAt, "Run startedAt"),
            completedAt: canonical(latestRun.completedAt, "Run completedAt"),
          },
    unresolvedRecommendations: {
      items: recommendations
        .slice(0, DISPLAY_LIMIT)
        .map(unresolvedRecommendation),
      hasMore: recommendations.length > DISPLAY_LIMIT,
    },
    currentActions: {
      items: actions.slice(0, DISPLAY_LIMIT).map(currentAction),
      hasMore: actions.length > DISPLAY_LIMIT,
    },
    recentSignals: {
      items: safeSignals.slice(0, DISPLAY_LIMIT),
      hasMore: signals.length > DISPLAY_LIMIT,
    },
    dueMeasurements,
  });
}

export const GrowthProjectSummaryService = { getProjectSummary } as const;
