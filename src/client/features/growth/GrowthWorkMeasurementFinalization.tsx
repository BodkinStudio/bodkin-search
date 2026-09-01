import { useRef, useState, type MutableRefObject } from "react";
import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  finalizeGrowthWorkMeasurement,
  getGrowthWorkMeasurement,
} from "@/serverFunctions/growthWork";
import type { GrowthWorkOverview } from "@/types/schemas/growth-investigations";
import type {
  FinalizeGrowthWorkMeasurementInput,
  GrowthWorkMeasurementConfounderCandidate,
  GrowthWorkMeasurementOverview,
  GrowthWorkMeasurementPlan,
} from "@/types/schemas/growth-work";
import { formatGrowthPreviewDate } from "./GrowthPreviewPresentation";
import {
  GrowthWorkMeasurementFinalizationForm,
  type GrowthWorkMeasurementFinalizationDraft,
} from "./GrowthWorkMeasurementFinalizationForm";

type ReadyReview = GrowthWorkMeasurementPlan["review"] & {
  state: "ready" | "not_measurable_only";
};

type FrozenFinalization = {
  request: FinalizeGrowthWorkMeasurementInput;
  draft: GrowthWorkMeasurementFinalizationDraft;
  measurement: GrowthWorkMeasurementOverview;
  review: ReadyReview;
  candidates: GrowthWorkMeasurementConfounderCandidate[];
  candidateSelectionAvailable: boolean;
};

function growthWorkMeasurementFinalizationRecoveryKey(
  projectId: string,
  actionId: string,
) {
  return [
    "growthWorkMeasurementFinalizeRecovery",
    projectId,
    actionId,
  ] as const;
}

export function useGrowthWorkMeasurementFinalizationRecovery(
  projectId: string,
  actionId: string,
) {
  return useQuery<FrozenFinalization | null>({
    queryKey: growthWorkMeasurementFinalizationRecoveryKey(projectId, actionId),
    queryFn: async (): Promise<FrozenFinalization | null> => null,
    enabled: false,
    gcTime: Infinity,
    staleTime: Infinity,
    initialData: null,
  });
}

function isReadyReview(
  review: GrowthWorkMeasurementPlan["review"],
): review is ReadyReview {
  return review.state === "ready" || review.state === "not_measurable_only";
}

export function GrowthWorkMeasurementFinalization({
  projectId,
  measurement,
  onLockChange,
  operationRef,
}: {
  projectId: string;
  measurement: GrowthWorkMeasurementOverview;
  onLockChange: (locked: boolean) => void;
  operationRef?: MutableRefObject<"collection" | "finalization" | null>;
}) {
  const client = useQueryClient();
  const dispatching = useRef(false);
  const [submitted, setSubmitted] = useState<FrozenFinalization | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [formVersion, setFormVersion] = useState(0);
  const queryKey = ["growthWorkMeasurement", projectId, measurement.actionId];
  const recoveryKey = growthWorkMeasurementFinalizationRecoveryKey(
    projectId,
    measurement.actionId,
  );
  const recovery = useGrowthWorkMeasurementFinalizationRecovery(
    projectId,
    measurement.actionId,
  );
  const frozenSubmitted = submitted ?? recovery.data ?? null;
  const workKey = ["growthWork", projectId];
  const historyKey = ["growthWorkHistory", projectId, measurement.actionId];
  const collecting =
    useIsMutating({
      mutationKey: [
        "growthWorkMeasurementCollect",
        projectId,
        measurement.actionId,
      ],
    }) > 0;
  const finalizing =
    useIsMutating({
      mutationKey: [
        "growthWorkMeasurementFinalize",
        projectId,
        measurement.actionId,
      ],
    }) > 0;
  const read = () =>
    getGrowthWorkMeasurement({
      data: { projectId, actionId: measurement.actionId },
    });
  const applySavedState = (saved: GrowthWorkMeasurementOverview) => {
    client.setQueryData<GrowthWorkMeasurementOverview>(queryKey, (current) =>
      current && current.stateVersion >= saved.stateVersion ? current : saved,
    );
    client.setQueryData<GrowthWorkOverview>(workKey, (current) =>
      current
        ? {
            ...current,
            actions: current.actions.map((item) =>
              item.id === saved.actionId &&
              item.stateVersion <= saved.stateVersion
                ? {
                    ...item,
                    status: saved.actionStatus,
                    stateVersion: saved.stateVersion,
                  }
                : item,
            ),
          }
        : current,
    );
  };
  const save = useMutation({
    mutationKey: [
      "growthWorkMeasurementFinalize",
      projectId,
      measurement.actionId,
    ],
    mutationFn: (data: FinalizeGrowthWorkMeasurementInput) =>
      finalizeGrowthWorkMeasurement({ data }),
    retry: false,
    onMutate: async () => {
      await Promise.all([
        client.cancelQueries({ queryKey }),
        client.cancelQueries({ queryKey: workKey }),
      ]);
      setNotice(null);
      setRefreshFailed(false);
    },
    onSuccess: (saved) => {
      applySavedState(saved);
      setSubmitted(null);
      client.removeQueries({ queryKey: recoveryKey, exact: true });
      setFormVersion((value) => value + 1);
      setNotice(
        "Measured result saved. This observational review is now immutable and the Work is Evaluated.",
      );
      if (operationRef?.current === "finalization") {
        operationRef.current = null;
      }
      onLockChange(false);
      void client.invalidateQueries({ queryKey: workKey });
      void client.invalidateQueries({ queryKey: historyKey });
    },
    onSettled: () => {
      dispatching.current = false;
    },
  });

  const plan = measurement.plan;
  const submit = (draft: GrowthWorkMeasurementFinalizationDraft) => {
    if (
      dispatching.current ||
      frozenSubmitted ||
      save.isPending ||
      collecting ||
      finalizing ||
      operationRef?.current != null ||
      !plan ||
      plan.status !== "active" ||
      !isReadyReview(plan.review) ||
      !plan.review.revision
    )
      return;
    const candidateSelectionAvailable = plan.confounders.state === "complete";
    const candidates = candidateSelectionAvailable
      ? plan.confounders.candidates
      : [];
    const candidateIds = new Set(candidates.map(({ id }) => id));
    if (
      draft.confoundingChangeEventIds.some(
        (changeEventId) => !candidateIds.has(changeEventId),
      )
    )
      return;
    const normalizedDraft = {
      ...draft,
      summary: draft.summary.trim(),
      confoundingChangeEventIds: [
        ...new Set(draft.confoundingChangeEventIds),
      ].toSorted(),
    };
    const request: FinalizeGrowthWorkMeasurementInput = {
      projectId,
      actionId: measurement.actionId,
      expectedActionVersion: measurement.stateVersion,
      reviewRevision: plan.review.revision,
      ...normalizedDraft,
    };
    dispatching.current = true;
    if (operationRef) operationRef.current = "finalization";
    setNotice(null);
    setRefreshFailed(false);
    const frozen = {
      request,
      draft: normalizedDraft,
      measurement,
      review: plan.review,
      candidates,
      candidateSelectionAvailable,
    };
    setSubmitted(frozen);
    client.setQueryData<FrozenFinalization>(recoveryKey, frozen);
    onLockChange(true);
    save.mutate(request);
  };

  const checkSavedResult = async () => {
    if (dispatching.current || !frozenSubmitted) return;
    dispatching.current = true;
    setChecking(true);
    setRefreshFailed(false);
    try {
      await client.cancelQueries({ queryKey });
      const refreshed = await client.fetchQuery({
        queryKey,
        queryFn: read,
        staleTime: 0,
        retry: false,
      });
      applySavedState(refreshed);
      if (refreshed.plan?.status === "completed" && refreshed.plan.result) {
        setSubmitted(null);
        client.removeQueries({ queryKey: recoveryKey, exact: true });
        setFormVersion((value) => value + 1);
        save.reset();
        setNotice("Saved measured result confirmed. The Work is Evaluated.");
        if (operationRef?.current === "finalization") {
          operationRef.current = null;
        }
        onLockChange(false);
      } else {
        setNotice(
          "No measured result is saved. This exact review remains locked; retry it unchanged or check again.",
        );
      }
      void client.invalidateQueries({ queryKey: workKey });
      void client.invalidateQueries({ queryKey: historyKey });
    } catch {
      setRefreshFailed(true);
    } finally {
      setChecking(false);
      dispatching.current = false;
    }
  };

  if (!plan || plan.status === "completed" || plan.review.state === "closed")
    return notice ? <p role="status">{notice}</p> : null;

  const review = frozenSubmitted?.review ?? plan.review;
  const candidates =
    frozenSubmitted?.candidates ??
    (plan.confounders.state === "complete" ? plan.confounders.candidates : []);
  const candidateSelectionAvailable =
    frozenSubmitted?.candidateSelectionAvailable ??
    plan.confounders.state === "complete";
  const recoveryPending = save.isPending || finalizing;
  const locked =
    Boolean(frozenSubmitted) ||
    recoveryPending ||
    checking ||
    collecting ||
    finalizing;
  const retryFrozenFinalization = () => {
    if (
      dispatching.current ||
      !frozenSubmitted ||
      recoveryPending ||
      checking ||
      (operationRef?.current != null && operationRef.current !== "finalization")
    )
      return;
    dispatching.current = true;
    if (operationRef) operationRef.current = "finalization";
    save.mutate(frozenSubmitted.request);
  };

  return (
    <div className="mt-5 border-t border-base-300 pt-4">
      <h4 className="font-semibold">Review measured result</h4>
      {review.state === "waiting" ? (
        <p className="mt-2 text-base-content/70">
          Review becomes available on{" "}
          <span className="font-medium tabular-nums">
            {formatGrowthPreviewDate(review.availableOn)}
          </span>
          , after the final configured measurement window has ended.
        </p>
      ) : null}
      {collecting ? (
        <p role="status" aria-busy="true" className="mt-2">
          Finish collecting Search Console evidence before finalizing.
        </p>
      ) : null}
      {isReadyReview(review) ? (
        <GrowthWorkMeasurementFinalizationForm
          key={formVersion}
          review={review}
          candidates={candidates}
          candidateSelectionAvailable={candidateSelectionAvailable}
          draft={frozenSubmitted?.draft}
          disabled={locked}
          pending={recoveryPending}
          onSubmit={submit}
        />
      ) : null}
      {recoveryPending ? (
        <p role="status" aria-busy="true" className="mt-3">
          Saving the measured result…
        </p>
      ) : null}
      {frozenSubmitted && !recoveryPending ? (
        <div role="alert" className="mt-3 space-y-2">
          <p>The measured result save could not be confirmed.</p>
          <p className="text-base-content/70">
            Keep this exact review locked. Retry it unchanged or check the
            authoritative saved result before editing anything.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-sm"
              disabled={recoveryPending || checking}
              onClick={retryFrozenFinalization}
            >
              Retry same finalization
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={recoveryPending || checking}
              onClick={() => void checkSavedResult()}
            >
              {checking ? "Checking saved result…" : "Check saved result"}
            </button>
          </div>
        </div>
      ) : null}
      {refreshFailed ? (
        <p role="alert" className="mt-3">
          The saved result could not be checked. This review remains locked; try
          Check saved result again.
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="mt-3">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
