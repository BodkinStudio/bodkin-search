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
  PRIORITY_PAGE_CLICK_DECLINE_DETECTOR_VERSION,
} from "./PriorityPageClickDeclineDetector";
import { GrowthRunsService } from "./GrowthRunsService";

const RUN_TYPE = "manual_analysis" as const;
const WINDOW_DAYS = 28;
const MAX_PAGE_REQUESTS = 25;
const CADENCE_SLOT_PREFIX = "priority-page-check:";
const SOURCE_TIMEZONE = "America/Los_Angeles";

function subtractDays(date: string, days: number) {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() - days);
  return result.toISOString().slice(0, 10);
}

export function priorityPageCheckWindows(capturedAt: string) {
  const currentEnd = subtractDays(
    calendarDateInTimezone(capturedAt, SOURCE_TIMEZONE),
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
) {
  return (
    run.runType === RUN_TYPE &&
    run.detectorVersion === PRIORITY_PAGE_CLICK_DECLINE_DETECTOR_VERSION &&
    run.cadenceSlot.startsWith(CADENCE_SLOT_PREFIX)
  );
}

async function getOverview(projectId: string): Promise<GrowthCheckOverview> {
  const [connection, keyPages, runs] = await Promise.all([
    GscConnectionRepository.getByProjectId(projectId),
    ProjectContextRepository.listKeyPages(projectId),
    GrowthRunsService.listRecentRunsForDetector(
      projectId,
      RUN_TYPE,
      PRIORITY_PAGE_CLICK_DECLINE_DETECTOR_VERSION,
      CADENCE_SLOT_PREFIX,
      20,
    ),
  ]);
  return {
    setup: !connection
      ? "missing_connection"
      : keyPages.length === 0
        ? "missing_key_pages"
        : "ready",
    keyPageCount: keyPages.length,
    runs: runs.map(runSummary),
  };
}

async function runCheck(input: { projectId: string; requestKey: string }) {
  const cadenceSlot = `${CADENCE_SLOT_PREFIX}${input.requestKey}`;
  const existing = await GrowthRunsRepository.getRunBySlot(
    input.projectId,
    RUN_TYPE,
    cadenceSlot,
  );
  if (existing) {
    if (!isPriorityPageCheckRun(existing)) {
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
  const claim = await GrowthRunsService.claimManualRun({
    projectId: input.projectId,
    runType: RUN_TYPE,
    cadenceSlot,
    periodStart: baselineWindow.startDate,
    periodEnd: currentWindow.endDate,
    detectorVersion: PRIORITY_PAGE_CLICK_DECLINE_DETECTOR_VERSION,
  });
  if (!claim.claimed) {
    if (!isPriorityPageCheckRun(claim.run)) {
      throw new AppError("CONFLICT", "Growth check request slot is occupied");
    }
    return { run: runSummary(claim.run), replayed: true };
  }
  try {
    const snapshot = await collectGrowthSearchPerformance({
      projectId: input.projectId,
      startDate: baselineWindow.startDate,
      endDate: currentWindow.endDate,
      capturedAt,
      includeSiteContext: true,
      maxPageRequests: MAX_PAGE_REQUESTS,
    });
    const outcomes = await detectPriorityPageClickDeclines({
      projectId: input.projectId,
      runId: claim.run.id,
      snapshot,
      baselineWindow,
      currentWindow,
    });
    for (const outcome of outcomes) {
      if (outcome.status === "signal" && outcome.signal) {
        await GrowthRunsService.recordSignal(outcome.signal);
      }
    }
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
  getRunDetail,
  getEvidence,
} as const;
