import { GscConnectionRepository } from "@/server/features/gsc/repositories/GscConnectionRepository";
import { GrowthInsightsRepository } from "@/server/features/growth/repositories/GrowthInsightsRepository";
import { GrowthRunsRepository } from "@/server/features/growth/repositories/GrowthRunsRepository";
import { ProjectContextRepository } from "@/server/features/project-context/repositories/ProjectContextRepository";
import { AppError } from "@/server/lib/errors";
import { collectGrowthStrikingDistanceInventory } from "./GrowthStrikingDistanceAdapter";
import {
  detectHighImpressionLowCtrQueries,
  HIGH_IMPRESSION_LOW_CTR_DETECTOR_VERSION,
} from "./HighImpressionLowCtrDetector";
import { LOW_CTR_INVESTIGATION_TEMPLATE_VERSION } from "./GrowthInvestigationTemplate";
import { GrowthOpportunityDecisionsService } from "./GrowthOpportunityDecisionsService";
import { priorityPageCheckWindows } from "./GrowthPriorityPageCheckService";
import { GrowthRunsService } from "./GrowthRunsService";

const RUN_TYPE = "manual_analysis" as const;
const PREFIX = "low-ctr-check:";
type Run = Awaited<ReturnType<typeof GrowthRunsService.getRun>>;
const summary = (run: Run) => ({
  id: run.id,
  status: run.status,
  periodStart: run.periodStart,
  periodEnd: run.periodEnd,
  startedAt: run.startedAt,
  completedAt: run.completedAt,
  failureCode: run.failureCode,
  failureMessage: run.failureMessage,
});
const isRun = (run: Run) =>
  run.runType === RUN_TYPE &&
  run.detectorVersion === HIGH_IMPRESSION_LOW_CTR_DETECTOR_VERSION &&
  run.cadenceSlot.startsWith(PREFIX);
type Decision = Awaited<
  ReturnType<typeof GrowthOpportunityDecisionsService.recordLowCtrInvestigation>
>;
function counts(decisions: Array<Decision | null>) {
  return decisions.reduce(
    (value, decision) => ({
      savedOpportunityCount:
        value.savedOpportunityCount +
        (decision?.relationship === "controller" ? 1 : 0),
      alreadyCoveredCount:
        value.alreadyCoveredCount +
        (decision?.relationship === "suppressed" ? 1 : 0),
    }),
    { savedOpportunityCount: 0, alreadyCoveredCount: 0 },
  );
}
async function saved(run: Run, replayed: boolean) {
  const signals = await GrowthRunsService.listSignals(run.projectId, run.id);
  const controllers = signals.filter(
    (signal) =>
      signal.signalType === "ctr_below_expected" &&
      signal.entityType === "search_query" &&
      signal.metric === "gsc_ctr" &&
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
    run: summary(run),
    replayed,
    candidateCount: controllers.length,
    ...counts(decisions),
  };
}
async function fail(
  projectId: string,
  runId: string,
  code: string,
  message: string,
) {
  const run = await GrowthRunsService.failRun({
    projectId,
    runId,
    failureCode: code,
    failureMessage: message,
  });
  return {
    run: summary(run),
    replayed: false,
    candidateCount: 0,
    savedOpportunityCount: 0,
    alreadyCoveredCount: 0,
  };
}
async function execute(input: { projectId: string; requestKey: string }) {
  const cadenceSlot = `${PREFIX}${input.requestKey}`;
  const existing = await GrowthRunsRepository.getRunBySlot(
    input.projectId,
    RUN_TYPE,
    cadenceSlot,
  );
  if (existing) {
    if (!isRun(existing))
      throw new AppError("CONFLICT", "Low-CTR request slot is occupied");
    return saved(existing, true);
  }
  const [connection, keyPages, site] = await Promise.all([
    GscConnectionRepository.getByProjectId(input.projectId),
    ProjectContextRepository.listKeyPages(input.projectId),
    GrowthInsightsRepository.projectDomain(input.projectId),
  ]);
  if (!connection)
    throw new AppError(
      "VALIDATION_ERROR",
      "Connect Search Console before finding low-CTR opportunities",
    );
  if (!keyPages.length)
    throw new AppError(
      "VALIDATION_ERROR",
      "Add at least one key page before finding low-CTR opportunities",
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
    detectorVersion: HIGH_IMPRESSION_LOW_CTR_DETECTOR_VERSION,
  });
  if (!isRun(claim.run))
    throw new AppError("CONFLICT", "Low-CTR request slot is occupied");
  if (!claim.claimed) return saved(claim.run, true);
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
  } catch {
    return fail(
      input.projectId,
      claim.run.id,
      "SEARCH_CONSOLE_UNAVAILABLE",
      "Search Console query data could not be read. Reconnect it if needed, then start a new low-CTR check.",
    );
  }
  if (
    inventory.baseline.retrievalStatus !== "exhausted" ||
    inventory.current.retrievalStatus !== "exhausted"
  ) {
    const run = await GrowthRunsService.completeRunWithErrors({
      projectId: input.projectId,
      runId: claim.run.id,
      failureCode: "INCOMPLETE_QUERY_INVENTORY",
      failureMessage:
        "Search Console returned more query rows than this bounded check could verify. No low-CTR opportunity was saved.",
    });
    return {
      run: summary(run),
      replayed: false,
      candidateCount: 0,
      savedOpportunityCount: 0,
      alreadyCoveredCount: 0,
    };
  }
  let outcomes: Awaited<ReturnType<typeof detectHighImpressionLowCtrQueries>>;
  try {
    outcomes = await detectHighImpressionLowCtrQueries({
      projectId: input.projectId,
      runId: claim.run.id,
      site,
      keyPages: keyPages.map(({ id, projectId, url, commercialWeight }) => ({
        id,
        projectId,
        url,
        commercialWeight,
      })),
      inventory,
    });
  } catch {
    return fail(
      input.projectId,
      claim.run.id,
      "SOURCE_DATA_INVALID",
      "The saved Search Console query inventory could not be validated. No low-CTR opportunity was saved.",
    );
  }
  const candidates = outcomes.filter(
    (outcome) => outcome.status === "candidate",
  );
  const decisions: Decision[] = [];
  const controllerSignalIds: string[] = [];
  try {
    for (const candidate of candidates) {
      const signals = await Promise.all(
        candidate.signalDrafts.map((signal) =>
          GrowthRunsService.recordSignal(signal),
        ),
      );
      const byMetric = new Map(
        signals.map((signal) => [signal.metric, signal]),
      );
      const ctr = byMetric.get("gsc_ctr"),
        clicks = byMetric.get("gsc_clicks"),
        impressions = byMetric.get("gsc_impressions"),
        averagePosition = byMetric.get("gsc_average_position");
      if (!ctr || !clicks || !impressions || !averagePosition)
        throw new AppError("CONFLICT", "Low-CTR evidence is incomplete");
      controllerSignalIds.push(ctr.id);
      decisions.push(
        await GrowthOpportunityDecisionsService.recordLowCtrInvestigation({
          projectId: input.projectId,
          runId: claim.run.id,
          signals: { ctr, clicks, impressions, averagePosition },
          query: candidate.query,
          page: candidate.canonicalPageUrl,
          site: candidate.site,
          commercialWeight: candidate.commercialWeight,
        }),
      );
    }
    if (candidates.length)
      await GrowthRunsService.setAnalysisVersion({
        projectId: input.projectId,
        runId: claim.run.id,
        analysisVersion: LOW_CTR_INVESTIGATION_TEMPLATE_VERSION,
      });
    const run = await GrowthRunsService.completeRun({
      projectId: input.projectId,
      runId: claim.run.id,
    });
    return {
      run: summary(run),
      replayed: false,
      candidateCount: candidates.length,
      ...counts(decisions),
    };
  } catch {
    const durable = (
      await Promise.all(
        controllerSignalIds.map((signalId) =>
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
    if (durable.length)
      await GrowthRunsService.setAnalysisVersion({
        projectId: input.projectId,
        runId: claim.run.id,
        analysisVersion: LOW_CTR_INVESTIGATION_TEMPLATE_VERSION,
      });
    const run = durable.length
      ? await GrowthRunsService.completeRunWithErrors({
          projectId: input.projectId,
          runId: claim.run.id,
          failureCode: "INVESTIGATION_GENERATION_FAILED",
          failureMessage: "Some low-CTR suggestions could not be saved.",
        })
      : await GrowthRunsService.failRun({
          projectId: input.projectId,
          runId: claim.run.id,
          failureCode: "INVESTIGATION_GENERATION_FAILED",
          failureMessage: "No low-CTR suggestion could be saved.",
        });
    return {
      run: summary(run),
      replayed: false,
      candidateCount: candidates.length,
      ...counts(durable),
    };
  }
}
export const GrowthLowCtrCheckService = { runCheck: execute } as const;
