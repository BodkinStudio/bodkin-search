import { decisionProseNeedsRefresh } from "@/types/growth-investigation-quality";
import { and, asc, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import {
  growthAssessmentInvestigationFindings,
  growthAssessmentInvestigationEvidence,
  growthAssessmentInvestigations,
} from "@/db/schema";

const stages = {
  pageStatus: "pending",
  analyticsStatus: "pending",
  findingsStatus: "pending",
} as const;

async function get(projectId: string, assessmentId: string) {
  const rows = await db
    .select()
    .from(growthAssessmentInvestigations)
    .where(
      and(
        eq(growthAssessmentInvestigations.projectId, projectId),
        eq(growthAssessmentInvestigations.assessmentId, assessmentId),
      ),
    )
    .limit(1);
  const run = rows[0];
  if (!run) return null;
  const findings = await db
    .select()
    .from(growthAssessmentInvestigationFindings)
    .where(
      and(
        eq(growthAssessmentInvestigationFindings.projectId, projectId),
        eq(growthAssessmentInvestigationFindings.investigationId, run.id),
        eq(growthAssessmentInvestigationFindings.attemptId, run.attemptId),
      ),
    )
    .orderBy(asc(growthAssessmentInvestigationFindings.ordinal));
  const evidence = await db
    .select()
    .from(growthAssessmentInvestigationEvidence)
    .where(
      and(
        eq(growthAssessmentInvestigationEvidence.projectId, projectId),
        eq(growthAssessmentInvestigationEvidence.investigationId, run.id),
        eq(growthAssessmentInvestigationEvidence.attemptId, run.attemptId),
      ),
    )
    .orderBy(asc(growthAssessmentInvestigationEvidence.ordinal));
  return { ...run, findings, evidence };
}

async function claim(input: {
  projectId: string;
  assessmentId: string;
  assessmentVersion: number;
  now: string;
  staleAfter: string;
  retryLimited: boolean;
}) {
  const attemptId = crypto.randomUUID();
  const existing = await get(input.projectId, input.assessmentId);
  if (
    existing?.status === "completed" &&
    existing.decisionVerdict !== null &&
    !decisionProseNeedsRefresh(existing) &&
    (!input.retryLimited ||
      (existing.pageStatus !== "limited" &&
        existing.analyticsStatus !== "limited"))
  )
    return { run: existing, claimed: false };
  if (existing?.status === "running" && existing.staleAfter > input.now)
    return { run: existing, claimed: false };
  if (existing) {
    await db
      .update(growthAssessmentInvestigations)
      .set({
        status: "running",
        assessmentVersion: input.assessmentVersion,
        attemptId,
        ...stages,
        sourceUrl: null,
        sourceTitle: null,
        sourceObservedAt: null,
        decisionVerdict: null,
        decisionHeadline: null,
        decisionWhyThisPage: null,
        decisionRationale: null,
        decisionNextAction: null,
        decisionExpectedOutcome: null,
        decisionMeasurement: null,
        decisionCaveat: null,
        startedAt: input.now,
        completedAt: null,
        failedAt: null,
        staleAfter: input.staleAfter,
        failureMessage: null,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(growthAssessmentInvestigations.projectId, input.projectId),
          eq(growthAssessmentInvestigations.id, existing.id),
          eq(growthAssessmentInvestigations.status, existing.status),
          existing.status === "running"
            ? lt(growthAssessmentInvestigations.staleAfter, input.now)
            : undefined,
        ),
      );
    const claimed = await get(input.projectId, input.assessmentId);
    return { run: claimed!, claimed: claimed?.attemptId === attemptId };
  }
  const id = crypto.randomUUID();
  try {
    await db.insert(growthAssessmentInvestigations).values({
      id,
      projectId: input.projectId,
      assessmentId: input.assessmentId,
      assessmentVersion: input.assessmentVersion,
      attemptId,
      status: "running",
      ...stages,
      sourceUrl: null,
      sourceTitle: null,
      sourceObservedAt: null,
      decisionVerdict: null,
      decisionHeadline: null,
      decisionWhyThisPage: null,
      decisionRationale: null,
      decisionNextAction: null,
      decisionExpectedOutcome: null,
      decisionMeasurement: null,
      decisionCaveat: null,
      startedAt: input.now,
      completedAt: null,
      failedAt: null,
      staleAfter: input.staleAfter,
      failureMessage: null,
      updatedAt: input.now,
    });
  } catch (error) {
    // A concurrent request owns the unique (project, assessment) row.
    const raced = await get(input.projectId, input.assessmentId);
    if (raced) return { run: raced, claimed: false };
    throw error;
  }
  return {
    run: (await get(input.projectId, input.assessmentId))!,
    claimed: true,
  };
}

async function complete(input: {
  id: string;
  projectId: string;
  assessmentId: string;
  now: string;
  attemptId: string;
  pageStatus: "completed" | "limited";
  analyticsStatus: "completed" | "limited";
  findingsStatus: "completed" | "limited";
  sourceUrl: string | null;
  sourceTitle: string | null;
  sourceObservedAt: string | null;
  findings: Array<{
    title: string;
    whyItMatters: string;
    evidence: string;
    sourceUrl: string;
    observedAt: string;
    recommendedNextStep: string;
    unverified: string;
  }>;
  evidence: Array<{
    id: string;
    source: string;
    title: string;
    text: string;
    url: string | null;
    observedAt: string;
    scope: string;
  }>;
  decision: {
    verdict: "change" | "investigate" | "deprioritise";
    headline: string;
    whyThisPage: string;
    rationale: string;
    nextAction: string;
    expectedOutcome: string;
    measurement: string;
    caveat: string;
    evidenceIds: string[];
  };
}) {
  const runningAttempt = and(
    eq(growthAssessmentInvestigations.projectId, input.projectId),
    eq(growthAssessmentInvestigations.id, input.id),
    eq(growthAssessmentInvestigations.attemptId, input.attemptId),
    eq(growthAssessmentInvestigations.status, "running"),
  );
  const completedAttempt = and(
    eq(growthAssessmentInvestigations.projectId, input.projectId),
    eq(growthAssessmentInvestigations.id, input.id),
    eq(growthAssessmentInvestigations.attemptId, input.attemptId),
    eq(growthAssessmentInvestigations.status, "completed"),
  );
  // The update and its dependent inserts share one D1/Postgres transaction.
  // If a newer attempt owns the run, the update selects no row and the guarded
  // inserts select no row, so stale attempts leave no orphaned evidence.
  await runBatch((tx) => [
    tx
      .update(growthAssessmentInvestigations)
      .set({
        status: "completed",
        pageStatus: input.pageStatus,
        analyticsStatus: input.analyticsStatus,
        findingsStatus: input.findingsStatus,
        sourceUrl: input.sourceUrl,
        sourceTitle: input.sourceTitle,
        sourceObservedAt: input.sourceObservedAt,
        decisionVerdict: input.decision.verdict,
        decisionHeadline: input.decision.headline,
        decisionWhyThisPage: input.decision.whyThisPage,
        decisionRationale: input.decision.rationale,
        decisionNextAction: input.decision.nextAction,
        decisionExpectedOutcome: input.decision.expectedOutcome,
        decisionMeasurement: input.decision.measurement,
        decisionCaveat: input.decision.caveat,
        completedAt: input.now,
        failedAt: null,
        failureMessage: null,
        updatedAt: input.now,
      })
      .where(runningAttempt),
    ...input.findings.map((finding, ordinal) =>
      tx.insert(growthAssessmentInvestigationFindings).select(
        tx
          .select({
            id: sql<string>`${crypto.randomUUID()}`.as("id"),
            projectId: growthAssessmentInvestigations.projectId,
            investigationId: growthAssessmentInvestigations.id,
            attemptId: growthAssessmentInvestigations.attemptId,
            ordinal: sql<number>`${ordinal}`.as("ordinal"),
            title: sql<string>`${finding.title}`.as("title"),
            whyItMatters: sql<string>`${finding.whyItMatters}`.as(
              "why_it_matters",
            ),
            evidence: sql<string>`${finding.evidence}`.as("evidence"),
            sourceUrl: sql<string>`${finding.sourceUrl}`.as("source_url"),
            observedAt: sql<string>`${finding.observedAt}`.as("observed_at"),
            recommendedNextStep: sql<string>`${finding.recommendedNextStep}`.as(
              "recommended_next_step",
            ),
            unverified: sql<string>`${finding.unverified}`.as("unverified"),
          })
          .from(growthAssessmentInvestigations)
          .where(completedAttempt),
      ),
    ),
    ...input.evidence.map((item, ordinal) =>
      tx.insert(growthAssessmentInvestigationEvidence).select(
        tx
          .select({
            id: sql<string>`${item.id}`.as("id"),
            projectId: growthAssessmentInvestigations.projectId,
            investigationId: growthAssessmentInvestigations.id,
            attemptId: growthAssessmentInvestigations.attemptId,
            ordinal: sql<number>`${ordinal}`.as("ordinal"),
            source: sql<string>`${item.source}`.as("source"),
            title: sql<string>`${item.title}`.as("title"),
            evidenceText: sql<string>`${item.text}`.as("evidence_text"),
            sourceUrl: sql<string | null>`${item.url}`.as("source_url"),
            observedAt: sql<string>`${item.observedAt}`.as("observed_at"),
            scope: sql<string>`${item.scope}`.as("scope"),
            citedByDecision: sql<boolean>`${input.decision.evidenceIds.includes(
              item.id,
            )}`.as("cited_by_decision"),
          })
          .from(growthAssessmentInvestigations)
          .where(completedAttempt),
      ),
    ),
  ]);
  return get(input.projectId, input.assessmentId);
}

async function renewActiveLease(input: {
  projectId: string;
  id: string;
  attemptId: string;
  now: string;
  staleAfter: string;
}) {
  const renewed = await db
    .update(growthAssessmentInvestigations)
    .set({ staleAfter: input.staleAfter, updatedAt: input.now })
    .where(
      and(
        eq(growthAssessmentInvestigations.projectId, input.projectId),
        eq(growthAssessmentInvestigations.id, input.id),
        eq(growthAssessmentInvestigations.attemptId, input.attemptId),
        eq(growthAssessmentInvestigations.status, "running"),
        sql`${growthAssessmentInvestigations.staleAfter} > ${input.now}`,
      ),
    )
    .returning({ id: growthAssessmentInvestigations.id });
  return renewed.length === 1;
}

async function updateStage(input: {
  id: string;
  projectId: string;
  now: string;
  attemptId: string;
  pageStatus?: "completed" | "limited";
  analyticsStatus?: "completed" | "limited";
  sourceUrl?: string | null;
  sourceTitle?: string | null;
  sourceObservedAt?: string | null;
}) {
  const { id, projectId, now, attemptId, ...stage } = input;
  await db
    .update(growthAssessmentInvestigations)
    .set({ ...stage, updatedAt: now })
    .where(
      and(
        eq(growthAssessmentInvestigations.projectId, projectId),
        eq(growthAssessmentInvestigations.id, id),
        eq(growthAssessmentInvestigations.attemptId, attemptId),
        eq(growthAssessmentInvestigations.status, "running"),
      ),
    );
}

async function fail(
  projectId: string,
  id: string,
  attemptId: string,
  now: string,
  message: string,
) {
  await db
    .update(growthAssessmentInvestigations)
    .set({
      status: "failed",
      pageStatus: "failed",
      analyticsStatus: "failed",
      findingsStatus: "failed",
      failedAt: now,
      failureMessage: message.slice(0, 1000),
      updatedAt: now,
    })
    .where(
      and(
        eq(growthAssessmentInvestigations.projectId, projectId),
        eq(growthAssessmentInvestigations.id, id),
        eq(growthAssessmentInvestigations.attemptId, attemptId),
        eq(growthAssessmentInvestigations.status, "running"),
      ),
    );
  return db
    .select()
    .from(growthAssessmentInvestigations)
    .where(
      and(
        eq(growthAssessmentInvestigations.projectId, projectId),
        eq(growthAssessmentInvestigations.id, id),
      ),
    )
    .then((rows) => rows[0] ?? null);
}

export const GrowthAssessmentInvestigationsRepository = {
  get,
  claim,
  complete,
  renewActiveLease,
  updateStage,
  fail,
} as const;
