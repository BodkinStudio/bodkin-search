import { GscConnectionRepository } from "@/server/features/gsc/repositories/GscConnectionRepository";
import { GrowthRunsRepository } from "@/server/features/growth/repositories/GrowthRunsRepository";
import { GrowthInsightsRepository } from "@/server/features/growth/repositories/GrowthInsightsRepository";
import { ProjectContextRepository } from "@/server/features/project-context/repositories/ProjectContextRepository";
import { AppError } from "@/server/lib/errors";
import { collectGrowthStrikingDistanceInventory } from "./GrowthStrikingDistanceAdapter";
import {
  detectStrikingDistanceQueries,
  STRIKING_DISTANCE_QUERY_DETECTOR_VERSION,
} from "./StrikingDistanceQueryDetector";
import { GrowthRunsService } from "./GrowthRunsService";
import { GrowthOpportunityDecisionsService } from "./GrowthOpportunityDecisionsService";
import { STRIKING_DISTANCE_INVESTIGATION_TEMPLATE_VERSION } from "./GrowthInvestigationTemplate";
import { priorityPageCheckWindows } from "./GrowthPriorityPageCheckService";

const RUN_TYPE = "manual_analysis" as const;
const CADENCE_SLOT_PREFIX = "striking-distance-check:";

type RunRow = Awaited<ReturnType<typeof GrowthRunsService.getRun>>;

function runSummary(row: RunRow) {
  return {
    id: row.id,
    status: row.status,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    failureCode: row.failureCode,
    failureMessage: row.failureMessage,
  };
}

function isStrikingDistanceRun(run: RunRow) {
  return (
    run.runType === RUN_TYPE &&
    run.detectorVersion === STRIKING_DISTANCE_QUERY_DETECTOR_VERSION &&
    run.cadenceSlot.startsWith(CADENCE_SLOT_PREFIX)
  );
}

function safeProviderFailure(error: unknown) {
  if (error instanceof AppError && error.code === "VALIDATION_ERROR") {
    return {
      code: "SOURCE_DATA_INVALID",
      message:
        "Search Console returned incomplete or invalid query data. Check the connection and start a new ranking-opportunity check.",
    };
  }
  return {
    code: "SEARCH_CONSOLE_UNAVAILABLE",
    message:
      "Search Console query data could not be read. Reconnect it if needed, then start a new ranking-opportunity check.",
  };
}

type Decision = Awaited<
  ReturnType<
    typeof GrowthOpportunityDecisionsService.recordStrikingDistanceInvestigation
  >
>;

function decisionCounts(decisions: Array<Decision | null>) {
  return decisions.reduce(
    (counts, decision) => {
      if (decision?.relationship === "controller")
        counts.savedOpportunityCount += 1;
      if (decision?.relationship === "suppressed")
        counts.alreadyCoveredCount += 1;
      return counts;
    },
    { savedOpportunityCount: 0, alreadyCoveredCount: 0 },
  );
}

async function storedResult(
  run: RunRow,
  replayed: boolean,
  keyPage: { id: string; url: string } | null,
) {
  const signals = await GrowthRunsService.listSignals(run.projectId, run.id);
  const controllers = signals.filter(
    (signal) =>
      signal.signalType === "striking_distance_query" &&
      signal.entityType === "search_query" &&
      signal.metric === "gsc_impressions" &&
      signal.evidenceKind === "gsc_period",
  );
  const decisions = await Promise.all(
    controllers.map((signal) =>
      GrowthOpportunityDecisionsService.getDecision(
        run.projectId,
        run.id,
        signal.id,
      ),
    ),
  );
  return {
    run: runSummary(run),
    replayed,
    scope: keyPage,
    candidateCount: controllers.length,
    ...decisionCounts(decisions),
  };
}

function signalByMetric<
  T extends { metric: string },
  M extends "gsc_average_position" | "gsc_impressions" | "gsc_clicks",
>(signals: T[], metric: M): T {
  const signal = signals.find((candidate) => candidate.metric === metric);
  if (!signal)
    throw new AppError(
      "CONFLICT",
      "Ranking-opportunity evidence is incomplete",
    );
  return signal;
}

async function runCheck(input: {
  projectId: string;
  requestKey: string;
  keyPageId?: string;
}) {
  const keyPages = await ProjectContextRepository.listKeyPages(input.projectId);
  const selectedKeyPage = input.keyPageId
    ? keyPages.find((page) => page.id === input.keyPageId)
    : null;
  if (input.keyPageId && !selectedKeyPage)
    throw new AppError("VALIDATION_ERROR", "Choose a saved priority page");
  const scope = selectedKeyPage
    ? { id: selectedKeyPage.id, url: selectedKeyPage.url }
    : null;
  const cadenceSlot = selectedKeyPage
    ? `${CADENCE_SLOT_PREFIX}${selectedKeyPage.id}:${input.requestKey}`
    : `${CADENCE_SLOT_PREFIX}${input.requestKey}`;
  const existing = await GrowthRunsRepository.getRunBySlot(
    input.projectId,
    RUN_TYPE,
    cadenceSlot,
  );
  if (existing) {
    if (!isStrikingDistanceRun(existing))
      throw new AppError(
        "CONFLICT",
        "Ranking-opportunity request slot is occupied",
      );
    return storedResult(existing, true, scope);
  }

  const [connection, site] = await Promise.all([
    GscConnectionRepository.getByProjectId(input.projectId),
    GrowthInsightsRepository.projectDomain(input.projectId),
  ]);
  if (!connection)
    throw new AppError(
      "VALIDATION_ERROR",
      "Connect Search Console before finding ranking opportunities",
    );
  if (keyPages.length === 0)
    throw new AppError(
      "VALIDATION_ERROR",
      "Add at least one key page before finding ranking opportunities",
    );
  if (!site) throw new AppError("NOT_FOUND", "Growth project not found");

  const capturedAt = new Date().toISOString();
  const { baselineWindow, currentWindow } =
    priorityPageCheckWindows(capturedAt);
  const claim = await GrowthRunsService.claimManualRun({
    projectId: input.projectId,
    runType: RUN_TYPE,
    cadenceSlot,
    periodStart: baselineWindow.startDate,
    periodEnd: currentWindow.endDate,
    detectorVersion: STRIKING_DISTANCE_QUERY_DETECTOR_VERSION,
  });
  if (!isStrikingDistanceRun(claim.run))
    throw new AppError(
      "CONFLICT",
      "Ranking-opportunity request slot is occupied",
    );
  if (!claim.claimed) return storedResult(claim.run, true, scope);

  let inventory: Awaited<
    ReturnType<typeof collectGrowthStrikingDistanceInventory>
  >;
  try {
    inventory = await collectGrowthStrikingDistanceInventory({
      projectId: input.projectId,
      baselineWindow,
      currentWindow,
      capturedAt,
    });
  } catch (error) {
    const failure = safeProviderFailure(error);
    const terminal = await GrowthRunsService.failRun({
      projectId: input.projectId,
      runId: claim.run.id,
      failureCode: failure.code,
      failureMessage: failure.message,
    });
    return {
      run: runSummary(terminal),
      replayed: false,
      scope,
      candidateCount: 0,
      savedOpportunityCount: 0,
      alreadyCoveredCount: 0,
    };
  }

  if (
    inventory.baseline.retrievalStatus !== "exhausted" ||
    inventory.current.retrievalStatus !== "exhausted"
  ) {
    const terminal = await GrowthRunsService.completeRunWithErrors({
      projectId: input.projectId,
      runId: claim.run.id,
      failureCode: "INCOMPLETE_QUERY_INVENTORY",
      failureMessage:
        "Search Console returned more query rows than this bounded check could verify. No ranking opportunity was saved.",
    });
    return {
      run: runSummary(terminal),
      replayed: false,
      scope,
      candidateCount: 0,
      savedOpportunityCount: 0,
      alreadyCoveredCount: 0,
    };
  }

  let outcomes: Awaited<ReturnType<typeof detectStrikingDistanceQueries>>;
  try {
    outcomes = await detectStrikingDistanceQueries({
      projectId: input.projectId,
      runId: claim.run.id,
      site,
      keyPages: (selectedKeyPage ? [selectedKeyPage] : keyPages).map(
        ({ id, projectId, url, commercialWeight }) => ({
          id,
          projectId,
          url,
          commercialWeight,
        }),
      ),
      inventory,
    });
  } catch {
    const terminal = await GrowthRunsService.failRun({
      projectId: input.projectId,
      runId: claim.run.id,
      failureCode: "SOURCE_DATA_INVALID",
      failureMessage:
        "The saved Search Console query inventory could not be validated. No ranking opportunity was saved.",
    });
    return {
      run: runSummary(terminal),
      replayed: false,
      scope,
      candidateCount: 0,
      savedOpportunityCount: 0,
      alreadyCoveredCount: 0,
    };
  }

  const candidates = outcomes.filter(
    (outcome) => outcome.status === "candidate",
  );
  const primarySignalIds: string[] = [];
  const decisions: Decision[] = [];
  try {
    for (const candidate of candidates) {
      const savedSignals = await Promise.all(
        candidate.signalDrafts.map((signal) =>
          GrowthRunsService.recordSignal(signal),
        ),
      );
      const averagePosition = signalByMetric(
        savedSignals,
        "gsc_average_position",
      );
      const impressions = signalByMetric(savedSignals, "gsc_impressions");
      const clicks = signalByMetric(savedSignals, "gsc_clicks");
      primarySignalIds.push(impressions.id);
      decisions.push(
        await GrowthOpportunityDecisionsService.recordStrikingDistanceInvestigation(
          {
            projectId: input.projectId,
            runId: claim.run.id,
            signals: { averagePosition, impressions, clicks },
            query: candidate.query,
            page: candidate.canonicalPageUrl,
            site: candidate.site,
            commercialWeight: candidate.commercialWeight,
          },
        ),
      );
    }
    if (candidates.length > 0)
      await GrowthRunsService.setAnalysisVersion({
        projectId: input.projectId,
        runId: claim.run.id,
        analysisVersion: STRIKING_DISTANCE_INVESTIGATION_TEMPLATE_VERSION,
      });
    const terminal = await GrowthRunsService.completeRun({
      projectId: input.projectId,
      runId: claim.run.id,
    });
    return {
      run: runSummary(terminal),
      replayed: false,
      scope,
      candidateCount: candidates.length,
      ...decisionCounts(decisions),
    };
  } catch {
    const durable = (
      await Promise.all(
        primarySignalIds.map((signalId) =>
          GrowthOpportunityDecisionsService.getDecision(
            input.projectId,
            claim.run.id,
            signalId,
          ),
        ),
      )
    ).filter((decision): decision is NonNullable<typeof decision> =>
      Boolean(decision),
    );
    if (durable.length > 0)
      await GrowthRunsService.setAnalysisVersion({
        projectId: input.projectId,
        runId: claim.run.id,
        analysisVersion: STRIKING_DISTANCE_INVESTIGATION_TEMPLATE_VERSION,
      });
    const terminal = durable.length
      ? await GrowthRunsService.completeRunWithErrors({
          projectId: input.projectId,
          runId: claim.run.id,
          failureCode: "INVESTIGATION_GENERATION_FAILED",
          failureMessage:
            "Some ranking-opportunity suggestions could not be saved; completed decisions remain available.",
        })
      : await GrowthRunsService.failRun({
          projectId: input.projectId,
          runId: claim.run.id,
          failureCode: "INVESTIGATION_GENERATION_FAILED",
          failureMessage:
            "The query facts were saved, but no ranking-opportunity suggestion could be completed.",
        });
    return {
      run: runSummary(terminal),
      replayed: false,
      scope,
      candidateCount: candidates.length,
      ...decisionCounts(durable),
    };
  }
}

export const GrowthStrikingDistanceCheckService = { runCheck } as const;
