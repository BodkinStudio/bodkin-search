/* eslint-disable max-lines -- the existing investigation lifecycle and its typed evidence projection stay colocated */
import { useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { getErrorCode } from "@/client/lib/error-messages";
import {
  approveGrowthInvestigation,
  getGrowthInvestigation,
  reviewGrowthInvestigation,
} from "@/serverFunctions/growthInvestigations";
import type {
  GrowthInvestigationReviewInput,
  GrowthInvestigationView,
} from "@/types/schemas/growth-investigations";
import { GrowthAiBriefPanel } from "./GrowthAiBriefPanel";
import { formatGrowthPreviewDate } from "./GrowthPreviewPresentation";
import { GrowthInvestigationForm } from "./GrowthInvestigationForm";
import {
  GrowthInvestigationReviewControls,
  GrowthInvestigationMutationFailure,
  GrowthInvestigationValidationFailure,
  growthDismissalReasonLabel,
} from "./GrowthInvestigationReviewControls";
import { GrowthSuppressedInvestigation } from "./GrowthSuppressedInvestigation";

type WithoutInvestigationRoute<T> = T extends unknown
  ? Omit<T, "projectId" | "signalId">
  : never;
type InvestigationReviewSubmission =
  WithoutInvestigationRoute<GrowthInvestigationReviewInput>;
type GrowthInvestigationControllerView = Extract<
  GrowthInvestigationView,
  { relationship: "controller" }
>;
type EvidenceSummary = NonNullable<
  GrowthInvestigationControllerView["evidenceSummary"]
>;
type QueryEvidenceSummary = Exclude<
  EvidenceSummary,
  | { kind: "persistent_tracked_rank_drop" }
  | { kind: "new_critical_audit_issue" }
>;
type RankDropEvidenceSummary = Extract<
  EvidenceSummary,
  { kind: "persistent_tracked_rank_drop" }
>;
type AuditIssueEvidenceSummary = Extract<
  EvidenceSummary,
  { kind: "new_critical_audit_issue" }
>;

function coveredEvidenceLabel(evidence: EvidenceSummary | undefined) {
  if (evidence?.kind === "new_critical_audit_issue")
    return evidence.targetUrl
      ? "audit issue, affected page and broken target"
      : "audit issue and affected page";
  if (
    evidence?.kind === "striking_distance_query" ||
    evidence?.kind === "high_impression_low_ctr_query" ||
    evidence?.kind === "persistent_tracked_rank_drop"
  )
    return "query and page";
  return "page";
}

function formatEvidenceValue(value: number, maximumFractionDigits: number) {
  return new Intl.NumberFormat("en-GB", { maximumFractionDigits }).format(
    value,
  );
}

function GrowthInvestigationEvidencePeriod({
  label,
  period,
  facts,
}: {
  label: string;
  period: QueryEvidenceSummary["baselinePeriod"];
  facts: QueryEvidenceSummary["baseline"];
}) {
  return (
    <section
      aria-label={`${label} evidence`}
      className="rounded-md border border-base-300 p-3"
    >
      <h6 className="font-medium">{label}</h6>
      <p className="mt-1 text-xs text-base-content/70">
        {formatGrowthPreviewDate(period.start)} –{" "}
        {formatGrowthPreviewDate(period.end)}
      </p>
      <dl
        className={`mt-2 grid gap-2 ${"ctr" in facts ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}
      >
        {"ctr" in facts ? (
          <div>
            <dt className="text-xs text-base-content/70">Click rate</dt>
            <dd className="font-medium">
              {formatEvidenceValue(facts.ctr * 100, 1)}%
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="text-xs text-base-content/70">Position</dt>
          <dd className="font-medium">
            {formatEvidenceValue(facts.position, 1)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-base-content/70">Impressions</dt>
          <dd className="font-medium">
            {formatEvidenceValue(facts.impressions, 0)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-base-content/70">Clicks</dt>
          <dd className="font-medium">
            {formatEvidenceValue(facts.clicks, 0)}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function GrowthStrikingDistanceEvidence({
  evidence,
}: {
  evidence: QueryEvidenceSummary;
}) {
  return (
    <section
      aria-label="Search Console numbers"
      className="rounded-md bg-base-200/60 p-3"
    >
      <h5 className="font-semibold">The numbers</h5>
      <dl className="mt-2 grid gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-base-content/70">Search</dt>
          <dd className="font-medium">{evidence.query}</dd>
        </div>
        <div>
          <dt className="text-xs text-base-content/70">Page</dt>
          <dd>{evidence.page}</dd>
        </div>
      </dl>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <GrowthInvestigationEvidencePeriod
          label="28 days before"
          period={evidence.baselinePeriod}
          facts={evidence.baseline}
        />
        <GrowthInvestigationEvidencePeriod
          label="Last 28 days"
          period={evidence.currentPeriod}
          facts={evidence.current}
        />
      </div>
    </section>
  );
}

function GrowthPersistentRankDropEvidence({
  evidence,
}: {
  evidence: RankDropEvidenceSummary;
}) {
  return (
    <section
      aria-label="Ranking history"
      className="rounded-md bg-base-200/60 p-3"
    >
      <h5 className="font-semibold">Ranking history</h5>
      <dl className="mt-2 grid gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-base-content/70">Keyword</dt>
          <dd className="font-medium">{evidence.keyword}</dd>
        </div>
        <div>
          <dt className="text-xs text-base-content/70">Device</dt>
          <dd className="capitalize">{evidence.device}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs text-base-content/70">Page</dt>
          <dd>{evidence.page}</dd>
        </div>
      </dl>
      <ol className="mt-3 grid gap-2 sm:grid-cols-4">
        {evidence.checks.map((check, index) => (
          <li
            key={check.checkedAt}
            className="rounded-md border border-base-300 p-3"
          >
            <p className="text-xs text-base-content/70">
              {index === 0 ? "First check" : `Check ${index + 1}`}
            </p>
            <p className="font-medium">
              {check.position === null
                ? `Outside top ${evidence.serpDepth}`
                : `Position ${check.position}`}
            </p>
            <p className="text-xs text-base-content/70">
              {formatGrowthPreviewDate(check.checkedAt.slice(0, 10))}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function GrowthCriticalAuditIssueEvidence({
  evidence,
}: {
  evidence: AuditIssueEvidenceSummary;
}) {
  return (
    <section
      aria-label="What the site audit found"
      className="rounded-md bg-base-200/60 p-3"
    >
      <h5 className="font-semibold">What the site audit found</h5>
      <dl className="mt-2 grid gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-base-content/70">Issue</dt>
          <dd className="font-medium">{evidence.title}</dd>
        </div>
        <div>
          <dt className="text-xs text-base-content/70">Affected page</dt>
          <dd>{evidence.page}</dd>
        </div>
        {evidence.targetUrl ? (
          <div className="sm:col-span-2">
            <dt className="text-xs text-base-content/70">Broken link to</dt>
            <dd>{evidence.targetUrl}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-xs text-base-content/70">Previous audit</dt>
          <dd>
            {formatGrowthPreviewDate(evidence.baselineAuditAt.slice(0, 10))}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-base-content/70">Latest audit</dt>
          <dd>
            {formatGrowthPreviewDate(evidence.currentAuditAt.slice(0, 10))}
          </dd>
        </div>
      </dl>
    </section>
  );
}

export function GrowthInvestigation({
  projectId,
  signalId,
}: {
  projectId: string;
  signalId: string;
}) {
  const [hasOpened, setHasOpened] = useState(false);
  return (
    <details
      className="mt-3 border-t border-base-300 pt-3"
      onToggle={(event) => {
        if (event.currentTarget.open) setHasOpened(true);
      }}
    >
      <summary className="cursor-pointer text-sm font-medium">
        See details
      </summary>
      {hasOpened ? (
        <GrowthInvestigationReview projectId={projectId} signalId={signalId} />
      ) : null}
    </details>
  );
}

export function GrowthInvestigationReview({
  projectId,
  signalId,
}: {
  projectId: string;
  signalId: string;
}) {
  const client = useQueryClient();
  const dispatching = useRef(false);
  const [submittedDueOn, setSubmittedDueOn] = useState<string | null>(null);
  const [submittedReview, setSubmittedReview] =
    useState<GrowthInvestigationReviewInput | null>(null);
  const queryKey = ["growthInvestigation", projectId, signalId];
  const query = useQuery({
    queryKey,
    queryFn: () => getGrowthInvestigation({ data: { projectId, signalId } }),
    retry: false,
  });
  const approve = useMutation({
    retry: false,
    mutationFn: (dueOn: string) =>
      approveGrowthInvestigation({ data: { projectId, signalId, dueOn } }),
    onSuccess: (action) => {
      client.setQueryData<GrowthInvestigationView | null>(queryKey, (saved) =>
        saved?.relationship === "controller"
          ? {
              ...saved,
              status: "accepted",
              actionId: action.id,
              dueOn: action.dueOn,
            }
          : saved,
      );
      void client.invalidateQueries({ queryKey: ["growthWork", projectId] });
      void client.invalidateQueries({
        queryKey: ["growthProjectSummary", projectId],
      });
      void client.invalidateQueries({
        queryKey: ["growthPriorityRecommendations", projectId],
      });
      void client.invalidateQueries({ queryKey });
    },
    onSettled: () => {
      dispatching.current = false;
    },
  });
  const review = useMutation({
    retry: false,
    mutationFn: (request: GrowthInvestigationReviewInput) =>
      reviewGrowthInvestigation({ data: request }),
    onSuccess: (investigation) => {
      setSubmittedReview(null);
      client.setQueryData<GrowthInvestigationView | null>(
        queryKey,
        investigation,
      );
      void client.invalidateQueries({
        queryKey: ["growthProjectSummary", projectId],
      });
      void client.invalidateQueries({
        queryKey: ["growthPriorityRecommendations", projectId],
      });
    },
    onError: (error) => {
      if (getErrorCode(error) === "VALIDATION_ERROR") {
        setSubmittedReview(null);
      }
    },
    onSettled: () => {
      dispatching.current = false;
    },
  });
  const submit = (dueOn: string) => {
    if (
      dispatching.current ||
      submittedDueOn ||
      approve.isPending ||
      review.isPending
    )
      return;
    dispatching.current = true;
    setSubmittedDueOn(dueOn);
    approve.mutate(dueOn);
  };
  const submitReview = (reviewInput: InvestigationReviewSubmission) => {
    if (
      dispatching.current ||
      submittedDueOn ||
      submittedReview ||
      approve.isPending ||
      review.isPending
    )
      return;
    const request = {
      projectId,
      signalId,
      ...reviewInput,
    } as GrowthInvestigationReviewInput;
    dispatching.current = true;
    setSubmittedReview(request);
    review.mutate(request);
  };

  if (query.isPending)
    return (
      <p role="status" aria-busy="true" className="mt-3 text-sm">
        Loading…
      </p>
    );
  if (query.isError && !query.data)
    return (
      <div role="alert" className="mt-3 space-y-2 text-sm">
        <p>This could not be loaded.</p>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => void query.refetch()}
        >
          Try again
        </button>
      </div>
    );
  if (!query.data)
    return (
      <p className="mt-3 text-sm text-base-content/70">
        No details were saved for this older finding.
      </p>
    );

  const saved = query.data;
  if (saved.relationship === "suppressed")
    return (
      <GrowthSuppressedInvestigation
        saved={saved}
        refreshFailed={query.isError}
        onRetry={() => void query.refetch()}
      />
    );
  const reviewLocked =
    approve.isPending ||
    review.isPending ||
    Boolean(submittedDueOn) ||
    Boolean(submittedReview);
  const reviewFailure =
    review.isError && getErrorCode(review.error) === "VALIDATION_ERROR" ? (
      <GrowthInvestigationValidationFailure error={review.error} />
    ) : review.isError && submittedReview ? (
      <GrowthInvestigationMutationFailure
        kind="review"
        error={review.error}
        pending={review.isPending}
        onRetry={() => {
          if (dispatching.current) return;
          dispatching.current = true;
          review.mutate(submittedReview);
        }}
        onRefresh={() => void query.refetch()}
      />
    ) : null;
  return (
    <div className="mt-3 space-y-3 text-sm [overflow-wrap:anywhere]">
      {query.isError ? (
        <div role="alert" className="space-y-2">
          <p>
            This could not be refreshed, so you are seeing the last saved
            version.
          </p>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => void query.refetch()}
          >
            Try again
          </button>
        </div>
      ) : null}
      <p className="whitespace-pre-wrap">{saved.rationale}</p>
      {saved.evidenceSummary?.kind === "persistent_tracked_rank_drop" ? (
        <GrowthPersistentRankDropEvidence evidence={saved.evidenceSummary} />
      ) : saved.evidenceSummary?.kind === "new_critical_audit_issue" ? (
        <GrowthCriticalAuditIssueEvidence evidence={saved.evidenceSummary} />
      ) : saved.evidenceSummary ? (
        <GrowthStrikingDistanceEvidence evidence={saved.evidenceSummary} />
      ) : null}
      {saved.evidenceSummary ? null : (
        <ul className="space-y-1 text-base-content/70">
          {saved.displayUrls.map((url, index) => (
            <li key={`${index}:${url}`}>{url ?? "Page address not shown"}</li>
          ))}
        </ul>
      )}
      <section aria-label="Suggested next steps">
        <h5 className="font-semibold">Suggested next steps</h5>
        <ol className="mt-1 list-decimal space-y-1 pl-5">
          {saved.steps.map((step, index) => (
            <li key={index}>{step}</li>
          ))}
        </ol>
      </section>
      <GrowthAiBriefPanel
        key={`${projectId}:${signalId}`}
        projectId={projectId}
        signalId={signalId}
        canApprove={saved.status === "proposed" && !reviewLocked}
        supported={
          saved.templateVersion.startsWith("priority-page-") ||
          saved.templateVersion.startsWith("striking-distance-")
        }
      />
      {saved.actionId ? (
        <p role="status">
          This is in your work list.
          {saved.dueOn
            ? ` Due ${formatGrowthPreviewDate(saved.dueOn)}.`
            : ""}{" "}
          <WorkLink projectId={projectId}>View work</WorkLink>
        </p>
      ) : saved.status === "accepted" ? (
        <p role="status">
          This was approved before work items were recorded, so there is nothing
          in the work list for it. Ask an admin to check it before adding new
          work.
        </p>
      ) : saved.status === "proposed" ? (
        <>
          <p className="text-base-content/70">
            Later checks of the same{" "}
            {coveredEvidenceLabel(saved.evidenceSummary)} are folded into this
            suggestion, so it will not repeat.{" "}
            <WorkLink projectId={projectId}>Check the work list</WorkLink> in
            case it is already covered.
          </p>
          {saved.actionId ? null : (
            <AssessmentPrerequisite projectId={projectId} />
          )}
          <details className="rounded-md border border-base-300 p-3">
            <summary className="cursor-pointer font-medium">
              Add the suggested steps to the work list
            </summary>
            <GrowthInvestigationForm
              disabled={reviewLocked}
              pending={approve.isPending}
              onSubmit={submit}
            />
          </details>
          <GrowthInvestigationReviewControls
            disabled={reviewLocked}
            pending={review.isPending}
            onDismiss={(dismissalReason) =>
              submitReview({
                expectedVersion: saved.reviewVersion,
                decision: "dismiss",
                dismissalReason,
              })
            }
            onSnooze={(snoozeUntil) =>
              submitReview({
                expectedVersion: saved.reviewVersion,
                decision: "snooze",
                snoozeUntil,
              })
            }
          />
          {approve.isError && submittedDueOn ? (
            <GrowthInvestigationMutationFailure
              kind="approval"
              error={approve.error}
              pending={approve.isPending}
              onRetry={() => {
                if (dispatching.current) return;
                dispatching.current = true;
                approve.mutate(submittedDueOn);
              }}
              onRefresh={() => void query.refetch()}
            />
          ) : null}
          {reviewFailure}
        </>
      ) : saved.status === "dismissed" ? (
        <p className="text-base-content/70">
          This suggestion was dismissed
          {saved.dismissalReason
            ? ` (${growthDismissalReasonLabel(saved.dismissalReason).toLowerCase()})`
            : ""}
          .
        </p>
      ) : saved.status === "snoozed" ? (
        <div className="space-y-3">
          <p className="text-base-content/70">
            This suggestion is snoozed
            {saved.snoozedUntil
              ? ` until ${formatGrowthPreviewDate(saved.snoozedUntil)}`
              : ""}
            . It stays hidden until you bring it back.
          </p>
          <button
            type="button"
            className="btn btn-outline"
            disabled={reviewLocked}
            onClick={() =>
              submitReview({
                expectedVersion: saved.reviewVersion,
                decision: "review_now",
              })
            }
          >
            {review.isPending ? "Saving…" : "Bring it back now"}
          </button>
          {reviewFailure}
        </div>
      ) : saved.status === "merged" || saved.status === "superseded" ? (
        <p className="text-base-content/70">
          A newer suggestion replaced this one.
        </p>
      ) : null}
    </div>
  );
}

function WorkLink({
  projectId,
  children,
}: {
  projectId: string;
  children: ReactNode;
}) {
  return (
    <Link
      to="/p/$projectId/growth/$section"
      params={{ projectId, section: "work" }}
      className="link font-medium"
    >
      {children}
    </Link>
  );
}

function AssessmentPrerequisite({ projectId }: { projectId: string }) {
  return (
    <p className="rounded border border-base-300 p-3 text-sm">
      Before this becomes work, agree why this page matters in a priority
      assessment: the business outcome, the evidence and why it comes first. You
      can read or draft an AI brief before that.{" "}
      <Link
        to="/p/$projectId/growth/$section"
        params={{ projectId, section: "priorities" }}
        hash="growth-assessment"
        className="link"
      >
        Open the priority assessment
      </Link>
    </p>
  );
}
