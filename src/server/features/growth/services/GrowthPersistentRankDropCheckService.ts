import { GrowthInsightsRepository } from "@/server/features/growth/repositories/GrowthInsightsRepository";
import { GrowthRunsRepository } from "@/server/features/growth/repositories/GrowthRunsRepository";
import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import {
  getRecentCompletedFullRuns,
  getSnapshotsForRuns,
} from "@/server/features/rank-tracking/repositories/snapshotQueries";
import { ProjectContextRepository } from "@/server/features/project-context/repositories/ProjectContextRepository";
import { AppError } from "@/server/lib/errors";
import { PERSISTENT_RANK_DROP_INVESTIGATION_TEMPLATE_VERSION } from "./GrowthInvestigationTemplate";
import { GrowthOpportunityDecisionsService } from "./GrowthOpportunityDecisionsService";
import { GrowthRunsService } from "./GrowthRunsService";
import {
  detectPersistentTrackedRankDrops,
  PERSISTENT_RANK_DROP_POLICY,
  PERSISTENT_TRACKED_RANK_DROP_DETECTOR_VERSION,
} from "./PersistentTrackedRankDropDetector";

const RUN_TYPE = "manual_analysis" as const;
const PREFIX = "persistent-rank-drop-check:";
type Run = Awaited<ReturnType<typeof GrowthRunsService.getRun>>;
type Decision = Awaited<
  ReturnType<
    typeof GrowthOpportunityDecisionsService.recordPersistentRankDropInvestigation
  >
>;

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
  run.detectorVersion === PERSISTENT_TRACKED_RANK_DROP_DETECTOR_VERSION &&
  run.cadenceSlot.startsWith(PREFIX);

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
      signal.signalType === "tracked_rank_drop" &&
      signal.entityType === "tracked_keyword" &&
      signal.metric === "organic_rank_position_floor" &&
      signal.evidenceKind === "rank_snapshot",
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

function date(value: string) {
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.valueOf())
    ? null
    : parsed.toISOString().slice(0, 10);
}

function configuredDevices(value: "both" | "desktop" | "mobile") {
  return value === "both" ? (["desktop", "mobile"] as const) : [value];
}

function normalizedKeyword(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

async function collectSequences(projectId: string) {
  const configs = await RankTrackingRepository.getConfigsForProject(projectId);
  const histories = await Promise.all(
    configs.map(async (config) => {
      const [runs, keywords] = await Promise.all([
        getRecentCompletedFullRuns(
          config.id,
          PERSISTENT_RANK_DROP_POLICY.requiredRuns,
        ),
        RankTrackingRepository.getKeywordsForConfig(config.id),
      ]);
      const orderedRuns = runs.toReversed();
      const snapshots = await getSnapshotsForRuns(
        orderedRuns.map(({ id }) => id),
      );
      return { config, runs: orderedRuns, keywords, snapshots };
    }),
  );
  const ready = histories.filter(
    ({ runs }) => runs.length === PERSISTENT_RANK_DROP_POLICY.requiredRuns,
  );
  let incompleteSequenceCount = 0;
  const sequences = ready.flatMap(({ config, runs, keywords, snapshots }) => {
    const byCoordinate = new Map<
      string,
      Map<string, (typeof snapshots)[number]>
    >();
    const activeIds = new Set(keywords.map(({ id }) => id));
    for (const snapshot of snapshots) {
      if (!activeIds.has(snapshot.trackingKeywordId)) continue;
      const coordinate = `${snapshot.trackingKeywordId}\u0000${snapshot.device}`;
      const byRun =
        byCoordinate.get(coordinate) ??
        new Map<string, (typeof snapshots)[number]>();
      byRun.set(snapshot.runId, snapshot);
      byCoordinate.set(coordinate, byRun);
    }
    return keywords.flatMap((keyword) =>
      configuredDevices(config.devices).flatMap((device) => {
        const coordinate = `${keyword.id}\u0000${device}`;
        const byRun = byCoordinate.get(coordinate);
        if (!byRun) {
          incompleteSequenceCount += 1;
          return [];
        }
        const ordered = runs.map((run) => byRun.get(run.id));
        if (
          ordered.some(
            (snapshot) =>
              !snapshot ||
              normalizedKeyword(snapshot.keyword) !==
                normalizedKeyword(keyword.keyword),
          )
        ) {
          incompleteSequenceCount += 1;
          return [];
        }
        return [
          {
            configId: config.id,
            domain: config.domain,
            serpDepth: config.serpDepth,
            trackingKeywordId: keyword.id,
            keyword: keyword.keyword,
            searchVolume: keyword.searchVolume,
            device,
            snapshots: ordered.map((snapshot, index) => ({
              id: snapshot!.id,
              runId: snapshot!.runId,
              checkedAt: runs[index].startedAt,
              position: snapshot!.position,
              url: snapshot!.url,
            })),
          },
        ];
      }),
    );
  });
  const runDates = ready.flatMap(({ runs }) =>
    runs.map(({ startedAt }) => date(startedAt)),
  );
  return {
    configCount: configs.length,
    readyConfigCount: ready.length,
    activeKeywordCount: ready.reduce(
      (count, history) => count + history.keywords.length,
      0,
    ),
    incompleteSequenceCount,
    sequences,
    periodStart: runDates
      .filter((value): value is string => Boolean(value))
      .toSorted()[0],
    periodEnd: runDates
      .filter((value): value is string => Boolean(value))
      .toSorted()
      .at(-1),
  };
}

async function runCheck(input: { projectId: string; requestKey: string }) {
  const cadenceSlot = `${PREFIX}${input.requestKey}`;
  const existing = await GrowthRunsRepository.getRunBySlot(
    input.projectId,
    RUN_TYPE,
    cadenceSlot,
  );
  if (existing) {
    if (!isRun(existing))
      throw new AppError("CONFLICT", "Rank-drop request slot is occupied");
    return saved(existing, true);
  }
  const [keyPages, site, inventory] = await Promise.all([
    ProjectContextRepository.listKeyPages(input.projectId),
    GrowthInsightsRepository.projectDomain(input.projectId),
    collectSequences(input.projectId),
  ]);
  if (!site) throw new AppError("NOT_FOUND", "Growth project not found");
  if (!keyPages.length)
    throw new AppError(
      "VALIDATION_ERROR",
      "Add at least one key page before finding persistent rank drops",
    );
  if (!inventory.configCount)
    throw new AppError(
      "VALIDATION_ERROR",
      "Configure rank tracking before finding persistent rank drops",
    );
  const today = new Date().toISOString().slice(0, 10);
  const claim = await GrowthRunsService.claimManualRun({
    projectId: input.projectId,
    runType: RUN_TYPE,
    cadenceSlot,
    periodStart: inventory.periodStart ?? today,
    periodEnd: inventory.periodEnd ?? today,
    detectorVersion: PERSISTENT_TRACKED_RANK_DROP_DETECTOR_VERSION,
  });
  if (!isRun(claim.run))
    throw new AppError("CONFLICT", "Rank-drop request slot is occupied");
  if (!claim.claimed) return saved(claim.run, true);
  if (!inventory.readyConfigCount) {
    const terminal = await GrowthRunsService.completeRunWithErrors({
      projectId: input.projectId,
      runId: claim.run.id,
      failureCode: "INSUFFICIENT_RANK_HISTORY",
      failureMessage:
        "Rank tracking needs four completed full checks before persistent drops can be detected.",
    });
    return {
      run: summary(terminal),
      replayed: false,
      candidateCount: 0,
      savedOpportunityCount: 0,
      alreadyCoveredCount: 0,
    };
  }
  if (!inventory.activeKeywordCount) {
    const terminal = await GrowthRunsService.completeRunWithErrors({
      projectId: input.projectId,
      runId: claim.run.id,
      failureCode: "NO_TRACKED_KEYWORDS",
      failureMessage:
        "Add an active tracked keyword before checking for persistent rank drops.",
    });
    return {
      run: summary(terminal),
      replayed: false,
      candidateCount: 0,
      savedOpportunityCount: 0,
      alreadyCoveredCount: 0,
    };
  }
  if (inventory.incompleteSequenceCount > 0) {
    const terminal = await GrowthRunsService.completeRunWithErrors({
      projectId: input.projectId,
      runId: claim.run.id,
      failureCode: "INCOMPLETE_RANK_HISTORY",
      failureMessage:
        "The latest four full checks do not contain a complete keyword and device sequence. No investigation was saved.",
    });
    return {
      run: summary(terminal),
      replayed: false,
      candidateCount: 0,
      savedOpportunityCount: 0,
      alreadyCoveredCount: 0,
    };
  }
  const capturedAt = new Date().toISOString();
  let candidates: ReturnType<typeof detectPersistentTrackedRankDrops>;
  try {
    candidates = detectPersistentTrackedRankDrops({
      projectId: input.projectId,
      runId: claim.run.id,
      site,
      capturedAt,
      keyPages: keyPages.map(({ id, projectId, url, commercialWeight }) => ({
        id,
        projectId,
        url,
        commercialWeight,
      })),
      sequences: inventory.sequences,
    });
  } catch {
    const terminal = await GrowthRunsService.failRun({
      projectId: input.projectId,
      runId: claim.run.id,
      failureCode: "RANK_HISTORY_INVALID",
      failureMessage:
        "Saved rank history could not be validated. No investigation was saved.",
    });
    return {
      run: summary(terminal),
      replayed: false,
      candidateCount: 0,
      savedOpportunityCount: 0,
      alreadyCoveredCount: 0,
    };
  }
  const decisions: Decision[] = [];
  const signalIds: string[] = [];
  try {
    for (const candidate of candidates) {
      const signal = await GrowthRunsService.recordSignal(candidate.signal);
      signalIds.push(signal.id);
      const { signal: _signal, status: _status, ...facts } = candidate;
      decisions.push(
        await GrowthOpportunityDecisionsService.recordPersistentRankDropInvestigation(
          {
            projectId: input.projectId,
            runId: claim.run.id,
            signal,
            candidate: facts,
          },
        ),
      );
    }
    if (candidates.length)
      await GrowthRunsService.setAnalysisVersion({
        projectId: input.projectId,
        runId: claim.run.id,
        analysisVersion: PERSISTENT_RANK_DROP_INVESTIGATION_TEMPLATE_VERSION,
      });
    const terminal = await GrowthRunsService.completeRun({
      projectId: input.projectId,
      runId: claim.run.id,
    });
    return {
      run: summary(terminal),
      replayed: false,
      candidateCount: candidates.length,
      ...counts(decisions),
    };
  } catch {
    const durable = (
      await Promise.all(
        signalIds.map((signalId) =>
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
        analysisVersion: PERSISTENT_RANK_DROP_INVESTIGATION_TEMPLATE_VERSION,
      });
    const terminal = durable.length
      ? await GrowthRunsService.completeRunWithErrors({
          projectId: input.projectId,
          runId: claim.run.id,
          failureCode: "INVESTIGATION_GENERATION_FAILED",
          failureMessage:
            "Some rank-drop investigations could not be saved; completed decisions remain available.",
        })
      : await GrowthRunsService.failRun({
          projectId: input.projectId,
          runId: claim.run.id,
          failureCode: "INVESTIGATION_GENERATION_FAILED",
          failureMessage:
            "Rank-drop facts were saved, but no investigation could be completed.",
        });
    return {
      run: summary(terminal),
      replayed: false,
      candidateCount: candidates.length,
      ...counts(durable),
    };
  }
}

export const GrowthPersistentRankDropCheckService = { runCheck } as const;
