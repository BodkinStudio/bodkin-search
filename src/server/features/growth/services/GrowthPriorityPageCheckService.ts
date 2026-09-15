import { GscConnectionRepository } from "@/server/features/gsc/repositories/GscConnectionRepository";
import { GrowthRunsRepository } from "@/server/features/growth/repositories/GrowthRunsRepository";
import { ProjectContextRepository } from "@/server/features/project-context/repositories/ProjectContextRepository";
import { AppError } from "@/server/lib/errors";
import type { GrowthCheckOverview } from "@/types/schemas/growth-checks";
import { assembleGrowthEvidencePacket } from "./GrowthEvidencePacketService";
import { growthEvidenceDisplayUrl } from "./GrowthEvidencePacket";
import { calendarDateInTimezone } from "./GrowthMeasurementFacts";
import { collectGrowthSearchPerformance } from "./GrowthSearchPerformanceAdapter";
import {
  detectPriorityPageClickDeclines,
  isPriorityPageClickDeclineDetectorVersion,
  PRIORITY_PAGE_CLICK_DECLINE_DETECTOR_VERSION,
  PRIORITY_PAGE_CLICK_DECLINE_DETECTOR_VERSIONS,
} from "./PriorityPageClickDeclineDetector";
import { GrowthRunsService } from "./GrowthRunsService";
import { GrowthOpportunityDecisionsService } from "./GrowthOpportunityDecisionsService";
import { GROWTH_INVESTIGATION_TEMPLATE_VERSION } from "./GrowthInvestigationTemplate";

const RUN_TYPE = "manual_analysis" as const;
const WINDOW_DAYS = 28;
const MAX_PAGE_REQUESTS = 25;
const CADENCE_SLOT_PREFIX = "priority-page-check:";

function subtractDays(date: string, days: number) {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() - days);
  return result.toISOString().slice(0, 10);
}

export function priorityPageCheckWindows(capturedAt: string) {
  const currentEnd = subtractDays(
    calendarDateInTimezone(capturedAt, "America/Los_Angeles"),
    3,
  );
  const currentStart = subtractDays(currentEnd, WINDOW_DAYS - 1);
  const baselineEnd = subtractDays(currentStart, 1);
  return {
    baselineWindow: {
      startDate: subtractDays(baselineEnd, WINDOW_DAYS - 1),
      endDate: baselineEnd,
    },
    currentWindow: { startDate: currentStart, endDate: currentEnd },
  };
}

function safeProviderFailure(error: unknown) {
  if (error instanceof AppError && error.code === "VALIDATION_ERROR") {
    return {
      code: "SOURCE_DATA_INVALID",
      message:
        "Search Console returned incomplete or invalid data. Check the connection and try a new check.",
    };
  }
  return {
    code: "SEARCH_CONSOLE_UNAVAILABLE",
    message:
      "Search Console could not be read. Reconnect it if needed, then start a new check.",
  };
}

function runSummary(row: Awaited<ReturnType<typeof GrowthRunsService.getRun>>) {
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

function isPriorityPageCheckRun(
  run: Awaited<ReturnType<typeof GrowthRunsService.getRun>>,
  trigger?: "manual" | "scheduled",
) {
  return (
    run.runType === RUN_TYPE &&
    (trigger === undefined || run.trigger === trigger) &&
    isPriorityPageClickDeclineDetectorVersion(run.detectorVersion) &&
    run.cadenceSlot.startsWith(CADENCE_SLOT_PREFIX)
  );
}

async function getOverview(projectId: string): Promise<GrowthCheckOverview> {
  const [connection, keyPages, runGroups] = await Promise.all([
    GscConnectionRepository.getByProjectId(projectId),
    ProjectContextRepository.listKeyPages(projectId),
    Promise.all(
      PRIORITY_PAGE_CLICK_DECLINE_DETECTOR_VERSIONS.map((version) =>
        GrowthRunsService.listRecentRunsForDetector(
          projectId,
          RUN_TYPE,
          version,
          CADENCE_SLOT_PREFIX,
          20,
        ),
      ),
    ),
  ]);
  const runs = runGroups
    .flat()
    .toSorted(
      (left, right) =>
        right.startedAt.localeCompare(left.startedAt) ||
        right.id.localeCompare(left.id),
    )
    .slice(0, 20);
  return {
    setup: !connection
      ? "missing_connection"
      : keyPages.length === 0
        ? "missing_key_pages"
        : "ready",
    keyPageCount: keyPages.length,
    keyPages: keyPages.map((page) => ({ id: page.id, url: page.url })),
    runs: runs.map(runSummary),
  };
}

async function runCheck(input: { projectId: string; requestKey: string }) {
  return executeCheck(input, { trigger: "manual" });
}

async function runScheduledCheck(input: {
  projectId: string;
  requestKey: string;
  settingsRevision: number;
}) {
  return executeCheck(input, {
    trigger: "scheduled",
    settingsRevision: input.settingsRevision,
  });
}

async function executeCheck(
  input: { projectId: string; requestKey: string },
  execution:
    | { trigger: "manual" }
    | { trigger: "scheduled"; settingsRevision: number },
) {
  const cadenceSlot = `${CADENCE_SLOT_PREFIX}${input.requestKey}`;
  const existing = await GrowthRunsRepository.getRunBySlot(
    input.projectId,
    RUN_TYPE,
    cadenceSlot,
  );
  if (existing) {
    if (!isPriorityPageCheckRun(existing, execution.trigger)) {
      throw new AppError("CONFLICT", "Growth check request slot is occupied");
    }
    return { run: runSummary(existing), replayed: true };
  }
  const [connection, keyPages] = await Promise.all([
    GscConnectionRepository.getByProjectId(input.projectId),
    ProjectContextRepository.listKeyPages(input.projectId),
  ]);
  if (!connection) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Connect Search Console before running a priority-page check",
    );
  }
  if (keyPages.length === 0) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Add at least one key page before running a priority-page check",
    );
  }
  const capturedAt = new Date().toISOString();
  const { baselineWindow, currentWindow } =
    priorityPageCheckWindows(capturedAt);
  const creation = {
    projectId: input.projectId,
    runType: RUN_TYPE,
    cadenceSlot,
    periodStart: baselineWindow.startDate,
    periodEnd: currentWindow.endDate,
    detectorVersion: PRIORITY_PAGE_CLICK_DECLINE_DETECTOR_VERSION,
  };
  const claim =
    execution.trigger === "scheduled"
      ? await GrowthRunsService.claimScheduledRun({
          ...creation,
          settingsRevision: execution.settingsRevision,
          reportCadence: "monthly",
        })
      : await GrowthRunsService.claimManualRun(creation);
  if (!claim.run)
    throw new AppError(
      "CONFLICT",
      "Growth settings changed before the scheduled check started",
    );
  if (!claim.claimed) {
    if (!isPriorityPageCheckRun(claim.run, execution.trigger)) {
      throw new AppError("CONFLICT", "Growth check request slot is occupied");
    }
    return { run: runSummary(claim.run), replayed: true };
  }
  let outcomes: Awaited<ReturnType<typeof detectPriorityPageClickDeclines>>;
  let snapshot: Awaited<ReturnType<typeof collectGrowthSearchPerformance>>;
  let committedDecision = false;
  let savedSignalIds: string[] = [];
  try {
    snapshot = await collectGrowthSearchPerformance({
      projectId: input.projectId,
      startDate: baselineWindow.startDate,
      endDate: currentWindow.endDate,
      capturedAt,
      includeSiteContext: true,
      maxPageRequests: MAX_PAGE_REQUESTS,
    });
    outcomes = await detectPriorityPageClickDeclines({
      projectId: input.projectId,
      runId: claim.run.id,
      snapshot,
      baselineWindow,
      currentWindow,
    });
  } catch (error) {
    const failure = safeProviderFailure(error);
    const terminal = await GrowthRunsService.failRun({
      projectId: input.projectId,
      runId: claim.run.id,
      failureCode: failure.code,
      failureMessage: failure.message,
    });
    return { run: runSummary(terminal), replayed: false };
  }

  try {
    const savedSignals = await Promise.all(
      outcomes
        .filter(
          (
            outcome,
          ): outcome is typeof outcome & {
            status: "signal";
            signal: NonNullable<typeof outcome.signal>;
          } => outcome.status === "signal" && outcome.signal !== undefined,
        )
        .map((outcome) => GrowthRunsService.recordSignal(outcome.signal)),
    );
    savedSignalIds = savedSignals.map((signal) => signal.id);
    const keyPagesById = new Map(
      savedSignals.length === 0
        ? []
        : snapshot.keyPages.map((page) => [page.id, page]),
    );
    for (const signal of savedSignals) {
      const keyPage = keyPagesById.get(signal.entityRef);
      if (!keyPage) {
        throw new AppError(
          "CONFLICT",
          "Growth investigation source page is unavailable",
        );
      }
      await GrowthOpportunityDecisionsService.recordPriorityPageInvestigation({
        projectId: input.projectId,
        runId: claim.run.id,
        signal,
        keyPage,
      });
      committedDecision = true;
    }
    if (savedSignals.length > 0)
      await GrowthRunsService.setAnalysisVersion({
        projectId: input.projectId,
        runId: claim.run.id,
        analysisVersion: GROWTH_INVESTIGATION_TEMPLATE_VERSION,
      });
    const hasIncompleteSource = outcomes.some((outcome) => {
      const reason = outcome.suppressionReason;
      return (
        outcome.status === "suppressed" &&
        reason !== undefined &&
        [
          "retrieval_capped",
          "site_context_incomplete",
          "missing_observation",
        ].includes(reason)
      );
    });
    const terminal = hasIncompleteSource
      ? await GrowthRunsService.completeRunWithErrors({
          projectId: input.projectId,
          runId: claim.run.id,
          failureCode: "INCOMPLETE_SOURCE_DATA",
          failureMessage:
            "Search Console data was limited or incomplete; no all-clear conclusion was made.",
        })
      : await GrowthRunsService.completeRun({
          projectId: input.projectId,
          runId: claim.run.id,
        });
    return { run: runSummary(terminal), replayed: false };
  } catch {
    const durableDecision = committedDecision
      ? true
      : (
          await Promise.all(
            savedSignalIds.map((signalId) =>
              GrowthOpportunityDecisionsService.getDecision(
                input.projectId,
                claim.run.id,
                signalId,
              ),
            ),
          )
        ).some((decision) => decision !== null);
    if (durableDecision) {
      await GrowthRunsService.setAnalysisVersion({
        projectId: input.projectId,
        runId: claim.run.id,
        analysisVersion: GROWTH_INVESTIGATION_TEMPLATE_VERSION,
      });
    }
    const terminal = durableDecision
      ? await GrowthRunsService.completeRunWithErrors({
          projectId: input.projectId,
          runId: claim.run.id,
          failureCode: "INVESTIGATION_GENERATION_FAILED",
          failureMessage:
            "Some investigation suggestions could not be saved; saved decisions remain available.",
        })
      : await GrowthRunsService.failRun({
          projectId: input.projectId,
          runId: claim.run.id,
          failureCode: "INVESTIGATION_GENERATION_FAILED",
          failureMessage:
            "The check data was collected, but its investigation suggestions could not be saved.",
        });
    return { run: runSummary(terminal), replayed: false };
  }
}

async function getRunDetail(projectId: string, runId: string) {
  const [run, signals, keyPages] = await Promise.all([
    GrowthRunsService.getRun(projectId, runId),
    GrowthRunsService.listSignals(projectId, runId),
    ProjectContextRepository.listKeyPages(projectId),
  ]);
  if (!isPriorityPageCheckRun(run)) {
    throw new AppError("NOT_FOUND", "Growth run not found");
  }
  const displayUrls = new Map(
    keyPages.map((page) => [page.id, growthEvidenceDisplayUrl(page.url).value]),
  );
  return {
    run: runSummary(run),
    signals: signals
      .filter(
        (signal) =>
          signal.signalType === "priority_page_click_decline" &&
          signal.entityType === "key_page" &&
          signal.metric === "gsc_clicks" &&
          signal.evidenceKind === "gsc_period",
      )
      .map((signal) => ({
        id: signal.id,
        entityRef: signal.entityRef,
        displayUrl: displayUrls.get(signal.entityRef) ?? null,
        severity: signal.severity,
        baselineValue: signal.baselineValue,
        currentValue: signal.currentValue,
        deltaValue: signal.deltaValue,
        deltaPercent: signal.deltaPercent,
        capturedAt: signal.capturedAt,
        baselinePeriod: {
          startDate: run.periodStart,
          endDate: subtractDays(signal.periodStart, 1),
        },
        currentPeriod: {
          startDate: signal.periodStart,
          endDate: signal.periodEnd,
        },
      })),
  };
}

async function getEvidence(input: {
  projectId: string;
  organizationId: string;
  signalId: string;
}) {
  const signal = await GrowthRunsRepository.getSignal(
    input.projectId,
    input.signalId,
  );
  if (
    !signal ||
    signal.signalType !== "priority_page_click_decline" ||
    signal.entityType !== "key_page" ||
    signal.metric !== "gsc_clicks" ||
    signal.evidenceKind !== "gsc_period"
  ) {
    throw new AppError("NOT_FOUND", "Growth Signal not found");
  }
  await getRunDetail(input.projectId, signal.runId);
  return assembleGrowthEvidencePacket({
    ...input,
    assembledAt: new Date().toISOString(),
  });
}

export const GrowthPriorityPageCheckService = {
  getOverview,
  runCheck,
  runScheduledCheck,
  getRunDetail,
  getEvidence,
} as const;
