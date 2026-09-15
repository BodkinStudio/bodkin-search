import { decisionProseNeedsRefresh } from "@/types/growth-investigation-quality";
import type { GrowthAssessmentInvestigationView } from "@/types/schemas/growth-assessment-investigations";
import { growthAssessmentInvestigationViewSchema } from "@/types/schemas/growth-assessment-investigations";
import type { GrowthAssessmentInvestigationsRepository as repo } from "../repositories/GrowthAssessmentInvestigationsRepository";

export function investigationView(
  run: NonNullable<Awaited<ReturnType<typeof repo.get>>>,
): GrowthAssessmentInvestigationView {
  const needsRefresh =
    Boolean(run.decisionVerdict) && decisionProseNeedsRefresh(run);
  const limitations: string[] = [];
  if (run.pageStatus === "limited")
    limitations.push(
      "The selected project page could not be read as an owned HTML page, so its offer and contact content remains unverified.",
    );
  if (run.analyticsStatus === "limited")
    limitations.push(
      "Google Analytics configuration was unavailable for this run; this does not establish whether the page has conversion measurement.",
    );
  return growthAssessmentInvestigationViewSchema.parse({
    id: run.id,
    projectId: run.projectId,
    assessmentId: run.assessmentId,
    assessmentVersion: run.assessmentVersion,
    status: run.status,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    failedAt: run.failedAt,
    staleAfter: run.staleAfter,
    stages: {
      page: run.pageStatus,
      analytics: run.analyticsStatus,
      findings: run.findingsStatus,
    },
    source: {
      url: run.sourceUrl,
      observedAt: run.sourceObservedAt,
      title: run.sourceTitle,
    },
    findings: run.findings.map((finding) => ({
      title: finding.title,
      whyItMatters: finding.whyItMatters,
      evidence: finding.evidence,
      sourceUrl: finding.sourceUrl,
      observedAt: finding.observedAt,
      recommendedNextStep: finding.recommendedNextStep,
      unverified: finding.unverified,
    })),
    evidence: (run.evidence ?? []).map((item) => ({
      id: item.id,
      source: item.source,
      title: item.title,
      text: item.evidenceText,
      url: item.sourceUrl,
      observedAt: item.observedAt,
      scope: item.scope,
    })),
    decisionNeedsRefresh: needsRefresh,
    decision:
      !needsRefresh &&
      run.decisionVerdict &&
      run.decisionHeadline &&
      run.decisionWhyThisPage &&
      run.decisionRationale &&
      run.decisionNextAction &&
      run.decisionExpectedOutcome &&
      run.decisionMeasurement &&
      run.decisionCaveat
        ? {
            verdict: run.decisionVerdict,
            headline: run.decisionHeadline,
            whyThisPage: run.decisionWhyThisPage,
            rationale: run.decisionRationale,
            nextAction: run.decisionNextAction,
            expectedOutcome: run.decisionExpectedOutcome,
            measurement: run.decisionMeasurement,
            caveat: run.decisionCaveat,
            evidenceIds: (run.evidence ?? [])
              .filter((item) => item.citedByDecision)
              .map((item) => item.id),
          }
        : null,
    limitations,
    failureMessage: run.failureMessage?.startsWith("No object generated:")
      ? "The AI returned an incomplete or incorrectly formatted recommendation. No recommendation was saved. Please retry the investigation."
      : run.failureMessage,
  });
}
