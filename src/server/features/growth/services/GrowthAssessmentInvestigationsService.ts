import { NoObjectGeneratedError } from "ai";
import { writeInvestigationDecision } from "./GrowthInvestigationDecisionWriter";
import { readPages } from "@/server/lib/scrape";
import { AppError } from "@/server/lib/errors";
import { getProjectContext } from "../../project-context/services/ProjectContextService";
import { ProjectRepository } from "../../projects/repositories/ProjectRepository";
import { GrowthPageContextService } from "./GrowthPageContextService";
import { investigationView as view } from "./GrowthAssessmentInvestigationView";
import { GrowthAssessmentInvestigationsRepository as repo } from "../repositories/GrowthAssessmentInvestigationsRepository";
import { GrowthAssessmentsService } from "./GrowthAssessmentsService";
import {
  checkGrowthAssessmentAnalytics,
  type AssessmentFinding,
} from "./GrowthAssessmentAnalyticsCheck";

// The run makes bounded sequential page, measurement, search and model reads.
// Keep its fencing lease longer than those timeouts so a valid attempt cannot be
// replaced while its decision is still being persisted.
const STALE_MS = 8 * 60_000;

function now() {
  return new Date().toISOString();
}
function staleAfter() {
  return new Date(Date.now() + STALE_MS).toISOString();
}

function sameHost(first: string, second: string) {
  try {
    return (
      new URL(first).hostname.toLowerCase() ===
      new URL(second).hostname.toLowerCase()
    );
  } catch {
    return false;
  }
}

function truncate(value: string, maximum: number) {
  return value.replace(/\s+/g, " ").trim().slice(0, maximum);
}

function meaningfulExcerpt(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= 1_800) return normalized;
  const third = Math.floor(normalized.length / 3);
  const excerpts = [0, third, third * 2].map((start) =>
    normalized.slice(start, start + 560),
  );
  return `${excerpts.join(" … ")} [Three excerpts sampled from ${normalized.length} readable characters.]`;
}

function searchEvidenceText(search: {
  state: string;
  startDate?: string;
  endDate?: string;
  aggregate?: {
    state: string;
    clicks?: number;
    impressions?: number;
    ctr?: number;
    position?: number;
  };
  queries?: {
    items: Array<{
      query: { value: string };
      clicks: number;
      impressions: number;
      ctr: number;
      position: number;
    }>;
  };
}) {
  if (search.state !== "available")
    return `Exact-page Search Console report is ${search.state.replaceAll("_", " ")}; no page/query metrics were supplied.`;
  const aggregate =
    search.aggregate?.state === "reported"
      ? `${search.aggregate.clicks} clicks, ${search.aggregate.impressions} impressions, ${(search.aggregate.ctr! * 100).toFixed(1)}% CTR, average position ${search.aggregate.position?.toFixed(1)}`
      : "no aggregate row reported";
  const queries =
    search.queries?.items
      .map(
        (item) =>
          `“${item.query.value}”: ${item.clicks} clicks, ${item.impressions} impressions, ${(item.ctr * 100).toFixed(1)}% CTR, position ${item.position.toFixed(1)}`,
      )
      .join("\n") || "no query rows reported";
  return `Exact-page final web report for ${search.startDate} to ${search.endDate}: ${aggregate}. Returned query sample (not a complete demand report):\n${queries}.`;
}

async function getInvestigation(projectId: string, assessmentId: string) {
  const run = await repo.get(projectId, assessmentId);
  return run ? view(run) : null;
}

// eslint-disable-next-line complexity -- this is the fenced orchestration boundary.
async function runInvestigation(
  projectId: string,
  assessmentId: string,
  retryLimited = false,
  actor?: { organizationId: string; userId: string; userEmail: string },
) {
  const { assessment, selected, page } =
    await GrowthAssessmentsService.requireReadyForInvestigation(
      projectId,
      assessmentId,
    );
  const claimed = await repo.claim({
    projectId,
    assessmentId,
    assessmentVersion: assessment.version,
    now: now(),
    staleAfter: staleAfter(),
    retryLimited,
  });
  if (!claimed.claimed) return view(claimed.run);
  try {
    const observedAt = now();
    const pageRead = await readPages([page.url], 1);
    const candidate = pageRead.pages[0];
    const ownedPage =
      candidate && sameHost(page.url, candidate.resolvedUrl) ? candidate : null;
    const findings: AssessmentFinding[] = [];
    await repo.updateStage({
      id: claimed.run.id,
      projectId,
      attemptId: claimed.run.attemptId,
      now: now(),
      pageStatus: ownedPage ? "completed" : "limited",
      sourceUrl: ownedPage?.resolvedUrl ?? null,
      sourceTitle: ownedPage?.title ?? null,
      sourceObservedAt: ownedPage ? observedAt : null,
    });
    const analytics = await checkGrowthAssessmentAnalytics({
      projectId,
      pageUrl: ownedPage?.resolvedUrl ?? page.url,
      observedAt: now(),
    });
    findings.push(...analytics.findings);
    const analyticsStatus = analytics.status;
    await repo.updateStage({
      id: claimed.run.id,
      projectId,
      attemptId: claimed.run.attemptId,
      now: now(),
      analyticsStatus,
    });
    if (!ownedPage && analyticsStatus === "limited") {
      const failed = await repo.fail(
        projectId,
        claimed.run.id,
        claimed.run.attemptId,
        now(),
        "The selected page could not be read and connected Analytics was unavailable; retry after either source is available.",
      );
      return view({ ...failed, findings: [], evidence: [] });
    }
    if (!ownedPage)
      throw new AppError(
        "VALIDATION_ERROR",
        "The selected page could not be read as an owned HTML page; retry after it is available.",
      );
    const [project, context] = await Promise.all([
      ProjectRepository.getProjectById(projectId),
      getProjectContext(projectId),
    ]);
    if (!project)
      throw new AppError("NOT_FOUND", "Project not found for investigation");
    const pageContext = await GrowthPageContextService.getPageContext(
      { id: project.id, domain: project.domain },
      ownedPage.resolvedUrl,
    );
    const commercialPage = context.keyPages.find(
      (item) =>
        item.url !== ownedPage.resolvedUrl &&
        (item.role === "money" || item.commercialWeight !== null) &&
        sameHost(ownedPage.resolvedUrl, item.url),
    );
    const commercialRead = commercialPage
      ? await readPages([commercialPage.url], 1)
      : null;
    const commercialCandidate = commercialRead?.pages[0];
    const comparableCommercialPage =
      commercialCandidate &&
      sameHost(commercialPage!.url, commercialCandidate.resolvedUrl)
        ? commercialCandidate
        : null;
    const evidence = [
      {
        id: crypto.randomUUID(),
        source: "accepted_assessment",
        title: "Accepted business context",
        text: truncate(
          `Goal: ${assessment.objective}. Market: ${assessment.market}. Audience: ${assessment.audience}. Success measure: ${assessment.successMeasure}. Selected because: ${selected.observation}`,
          1800,
        ),
        url: null,
        observedAt,
        scope: "Latest accepted assessment and selected option",
      },
      {
        id: crypto.randomUUID(),
        source: "owned_page",
        title: ownedPage.title || "Readable selected page",
        text: meaningfulExcerpt(ownedPage.text),
        url: ownedPage.resolvedUrl,
        observedAt,
        scope:
          "Owned HTML page read; rendered interaction and visitor behaviour are not observed",
      },
      {
        id: crypto.randomUUID(),
        source: "search_performance",
        title: "Exact page search evidence",
        text: searchEvidenceText(pageContext.searchPerformance),
        url: null,
        observedAt: pageContext.asOf,
        scope:
          "Search Console exact requested page, final web data; query sample is incomplete and cannot establish the highest-demand queries",
      },
      {
        id: crypto.randomUUID(),
        source: "project_context",
        title: "Saved market and competitor context",
        text: context.competitors.length
          ? `Saved competitors: ${context.competitors
              .slice(0, 6)
              .map((item) =>
                item.name ? `${item.name} (${item.domain})` : item.domain,
              )
              .join(
                ", ",
              )}. No competitor-page comparison was supplied for this investigation.`
          : "No saved competitors or competitor-page comparison were supplied for this investigation.",
        url: null,
        observedAt,
        scope:
          "Saved project context; competitors listed here are not evaluated competitor evidence",
      },
      {
        id: crypto.randomUUID(),
        source: "commercial_page",
        title:
          comparableCommercialPage?.title || "Comparable saved commercial page",
        text: comparableCommercialPage
          ? meaningfulExcerpt(comparableCommercialPage.text)
          : commercialPage
            ? `Saved commercial page ${commercialPage.url} could not be read as an owned HTML page.`
            : "No other same-host commercial key page is saved for comparison.",
        url:
          comparableCommercialPage?.resolvedUrl ?? commercialPage?.url ?? null,
        observedAt,
        scope: comparableCommercialPage
          ? "One saved same-host commercial key page; readable HTML excerpt only"
          : "Commercial-page comparison gap",
      },
    ];
    // Renew immediately before the paid provider call. The renewed lease is
    // longer than the provider timeout, so another request cannot reclaim this
    // attempt while the call is in flight. A superseded or expired attempt
    // returns the newer state without spending provider credits.
    const ownsPaidWork = await repo.renewActiveLease({
      projectId,
      id: claimed.run.id,
      attemptId: claimed.run.attemptId,
      now: now(),
      staleAfter: staleAfter(),
    });
    if (!ownsPaidWork) {
      const current = await repo.get(projectId, assessmentId);
      if (!current)
        throw new AppError(
          "NOT_FOUND",
          "Investigation disappeared before model work",
        );
      return view(current);
    }
    const search = pageContext.searchPerformance;
    const visibility =
      search.state === "available" && search.aggregate.state === "reported"
        ? `Search Console recorded ${search.aggregate.impressions.toLocaleString("en-GB")} impressions and ${search.aggregate.clicks.toLocaleString("en-GB")} clicks for this exact page from ${search.startDate} to ${search.endDate}.`
        : "An exact-page Search Console report is not available for this investigation.";
    const whyThisPage = `Saved research linked this page to the agreed topic. ${visibility} This identifies a candidate to assess; it does not prove that a rewrite is the best next step.`;
    const decision = await writeInvestigationDecision(
      projectId,
      evidence,
      actor,
      whyThisPage,
    );
    const completed = await repo.complete({
      id: claimed.run.id,
      projectId,
      assessmentId,
      attemptId: claimed.run.attemptId,
      now: now(),
      pageStatus: ownedPage ? "completed" : "limited",
      analyticsStatus,
      findingsStatus: findings.length ? "completed" : "limited",
      sourceUrl: ownedPage?.resolvedUrl ?? null,
      sourceTitle: ownedPage?.title ?? null,
      sourceObservedAt: ownedPage ? observedAt : null,
      findings,
      evidence,
      decision,
    });
    return view(completed!);
  } catch (error) {
    const message = NoObjectGeneratedError.isInstance(error)
      ? error.finishReason === "length"
        ? "The AI response was cut short before the recommendation was complete. No recommendation was saved. Please retry the investigation."
        : "The AI returned an incomplete or incorrectly formatted recommendation. No recommendation was saved. Please retry the investigation."
      : error instanceof AppError || error instanceof Error
        ? error.message
        : "The investigation could not finish.";
    const failed = await repo.fail(
      projectId,
      claimed.run.id,
      claimed.run.attemptId,
      now(),
      message,
    );
    if (!failed) throw error;
    return view({ ...failed, findings: [], evidence: [] });
  }
}

export const GrowthAssessmentInvestigationsService = {
  getInvestigation,
  runInvestigation,
} as const;
