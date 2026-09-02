import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { formatGrowthPreviewDate } from "./GrowthPreviewPresentation";
import { GrowthInvestigationForm } from "./GrowthInvestigationForm";
import {
  GrowthInvestigationReviewControls,
  GrowthInvestigationMutationFailure,
  GrowthInvestigationValidationFailure,
  growthDismissalReasonLabel,
} from "./GrowthInvestigationReviewControls";

type WithoutInvestigationRoute<T> = T extends unknown
  ? Omit<T, "projectId" | "signalId">
  : never;
type InvestigationReviewSubmission =
  WithoutInvestigationRoute<GrowthInvestigationReviewInput>;

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
        Review investigation
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
        saved
          ? {
              ...saved,
              status: "accepted",
              actionId: action.id,
              dueOn: action.dueOn,
            }
          : saved,
      );
      void client.invalidateQueries({ queryKey: ["growthWork", projectId] });
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
        Loading saved investigation…
      </p>
    );
  if (query.isError && !query.data)
    return (
      <div role="alert" className="mt-3 space-y-2 text-sm">
        <p>Saved investigation could not be loaded.</p>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => void query.refetch()}
        >
          Retry investigation
        </button>
      </div>
    );
  if (!query.data)
    return (
      <p className="mt-3 text-sm text-base-content/70">
        This check has no saved investigation. New checks can save suggestions;
        older results are not rewritten.
      </p>
    );

  const saved = query.data;
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
            This investigation could not be refreshed. The last saved version is
            shown below.
          </p>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => void query.refetch()}
          >
            Retry investigation
          </button>
        </div>
      ) : null}
      <h4 className="font-semibold">{saved.title}</h4>
      <p className="text-base-content/70">
        Rule-based investigation. No AI was used.
      </p>
      <p className="whitespace-pre-wrap">{saved.rationale}</p>
      <ul className="space-y-1 text-base-content/70">
        {saved.displayUrls.map((url, index) => (
          <li key={`${index}:${url}`}>{url ?? "Saved page URL withheld"}</li>
        ))}
      </ul>
      <ol className="list-decimal space-y-1 pl-5">
        {saved.steps.map((step, index) => (
          <li key={index}>{step}</li>
        ))}
      </ol>
      <p className="text-xs text-base-content/70">
        Saved template: {saved.templateVersion}
      </p>
      {saved.actionId ? (
        <p role="status">
          This investigation is in your work list.
          {saved.dueOn
            ? ` Due ${formatGrowthPreviewDate(saved.dueOn)} (UTC).`
            : ""}{" "}
          <a className="link font-medium" href="#growth-work">
            View work
          </a>
        </p>
      ) : saved.status === "accepted" ? (
        <p role="status">
          This older approval has no saved action. Its original due date and
          approving user were not recorded. Ask a project administrator to
          review it before creating work.
        </p>
      ) : saved.status === "proposed" ? (
        <>
          <p className="text-base-content/70">
            Separate checks may suggest work for the same page.{" "}
            <a className="link" href="#growth-work">
              Check existing work
            </a>{" "}
            before approving.
          </p>
          <GrowthInvestigationForm
            disabled={reviewLocked}
            pending={approve.isPending}
            onSubmit={submit}
          />
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
            ? ` as ${growthDismissalReasonLabel(saved.dismissalReason).toLowerCase()}`
            : ""}
          . It is read-only.
        </p>
      ) : saved.status === "snoozed" ? (
        <div className="space-y-3">
          <p className="text-base-content/70">
            This suggestion is snoozed
            {saved.snoozedUntil
              ? ` until ${formatGrowthPreviewDate(saved.snoozedUntil)} (UTC)`
              : ""}
            . It will stay snoozed until you explicitly return it to review.
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
            {review.isPending ? "Saving review…" : "Review now"}
          </button>
          {reviewFailure}
        </div>
      ) : saved.status === "merged" || saved.status === "superseded" ? (
        <p className="text-base-content/70">
          This saved suggestion is {saved.status} and is read-only here.
        </p>
      ) : null}
    </div>
  );
}
