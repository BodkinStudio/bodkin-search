import { useEffect, useRef, useState, type Ref } from "react";
import { useMutation, type QueryClient } from "@tanstack/react-query";
import {
  getGrowthMonthlyPublicationStatus,
  publishGrowthMonthlyReport,
} from "@/serverFunctions/growthReports";
import type { GrowthMonthlyReportDto } from "@/types/schemas/growth-monthly-reports";
import { formatGrowthReportMonth } from "./GrowthReportPresentation";

export type GrowthMonthlyPublicationRequest = {
  projectId: string;
  periodStart: string;
  periodEnd: string;
  reportTimezone: string;
  version: 1;
};

export type GrowthMonthlyPublicationControlProps = {
  request: GrowthMonthlyPublicationRequest | null;
  showTrigger: boolean;
  attempted: boolean;
  pending: boolean;
  busy: boolean;
  triggerRef?: Ref<HTMLButtonElement>;
  confirmationRef?: Ref<HTMLHeadingElement>;
  onStart: () => void;
  onConfirm: () => void;
  onCancel: () => void;
};

export type GrowthMonthlyPublicationRecoveryProps = {
  error: boolean;
  checkResult: "draft" | "failed" | null;
  checking: boolean;
  busy: boolean;
  errorRef?: Ref<HTMLDivElement>;
  onCheck: () => void;
  onRetry: () => void;
};

type PublicationHookOptions = {
  projectId: string;
  data: GrowthMonthlyReportDto | undefined;
  queryKey: readonly string[];
  client: QueryClient;
  dispatching: { current: boolean };
  onSuccess: (message: string) => void;
};

const coordinateFor = (
  projectId: string,
  data: GrowthMonthlyReportDto,
): GrowthMonthlyPublicationRequest => ({
  projectId,
  periodStart: data.periodStart,
  periodEnd: data.periodEnd,
  reportTimezone: data.reportTimezone,
  version: 1,
});

const sameCoordinate = (
  data: GrowthMonthlyReportDto,
  request: GrowthMonthlyPublicationRequest,
) =>
  data.periodStart === request.periodStart &&
  data.periodEnd === request.periodEnd &&
  data.reportTimezone === request.reportTimezone;

export function GrowthMonthlyPublicationControl({
  request,
  showTrigger,
  attempted,
  pending,
  busy,
  triggerRef,
  confirmationRef,
  onStart,
  onConfirm,
  onCancel,
}: GrowthMonthlyPublicationControlProps) {
  if (!request && !showTrigger) return null;
  return (
    <div className="mt-4 text-sm">
      {request ? (
        <div
          className="rounded-md border border-base-300 p-4"
          aria-labelledby="growth-publication-confirmation-title"
          aria-busy={pending || undefined}
        >
          <h3
            ref={confirmationRef}
            id="growth-publication-confirmation-title"
            tabIndex={-1}
            className="font-semibold"
          >
            Publish {formatGrowthReportMonth(request.periodStart)} summary?
          </h3>
          <p className="mt-2">
            Publication is final internal approval and cannot be undone. It does
            not share or send this report externally.
          </p>
          {pending ? (
            <p role="status" className="mt-3">
              Publishing {formatGrowthReportMonth(request.periodStart)} summary…
            </p>
          ) : null}
          {!attempted || pending ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={busy}
                onClick={onConfirm}
              >
                {pending ? "Publishing summary…" : "Confirm publication"}
              </button>
              {!attempted ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={pending}
                  onClick={onCancel}
                >
                  Cancel
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy}
          onClick={onStart}
        >
          Publish summary
        </button>
      )}
    </div>
  );
}

export function GrowthMonthlyPublicationRecovery({
  error,
  checkResult,
  checking,
  busy,
  errorRef,
  onCheck,
  onRetry,
}: GrowthMonthlyPublicationRecoveryProps) {
  return (
    <>
      {error ? (
        <div
          ref={errorRef}
          role="alert"
          tabIndex={-1}
          className="alert alert-error mt-4 flex-wrap"
        >
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              The publication could not be confirmed.
            </p>
            <p className="mt-1 text-sm">
              Check the exact saved summary first. Retrying uses the same frozen
              monthly coordinate.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-sm"
              disabled={busy}
              onClick={onCheck}
            >
              {checking ? "Checking saved summary…" : "Check saved summary"}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy}
              onClick={onRetry}
            >
              Retry same publication
            </button>
          </div>
        </div>
      ) : null}
      {checkResult === "draft" ? (
        <p role="alert" className="mt-4 text-sm">
          No published version was found. This exact publication remains locked;
          retry it unchanged or check again.
        </p>
      ) : null}
      {checkResult === "failed" ? (
        <p role="alert" className="mt-4 text-sm">
          Published status could not be checked. This publication remains
          locked; try Check saved summary again.
        </p>
      ) : null}
    </>
  );
}

export function useGrowthMonthlyPublication({
  projectId,
  data,
  queryKey,
  client,
  dispatching,
  onSuccess,
}: PublicationHookOptions) {
  const [request, setRequest] =
    useState<GrowthMonthlyPublicationRequest | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<"draft" | "failed" | null>(
    null,
  );
  const [focusConfirmation, setFocusConfirmation] = useState(false);
  const [focusError, setFocusError] = useState(false);
  const [focusTrigger, setFocusTrigger] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const confirmationRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const publicationDispatching = useRef(false);
  const publish = useMutation({
    mutationKey: ["growthMonthlyReportPublish", projectId],
    mutationFn: (input: GrowthMonthlyPublicationRequest) =>
      publishGrowthMonthlyReport({ data: input }),
    retry: false,
    onMutate: async () => client.cancelQueries({ queryKey }),
    onSuccess: (saved) => {
      client.setQueryData(queryKey, saved);
      setRequest(null);
      setAttempted(false);
      setCheckResult(null);
      dispatching.current = false;
      onSuccess(
        "Monthly summary published. Version 1 is final and cannot be unpublished.",
      );
    },
    onError: () => setFocusError(true),
    onSettled: () => {
      publicationDispatching.current = false;
    },
  });

  useEffect(() => {
    if (!focusConfirmation) return;
    confirmationRef.current?.focus();
    setFocusConfirmation(false);
  }, [focusConfirmation]);
  useEffect(() => {
    if (!focusError) return;
    errorRef.current?.focus();
    setFocusError(false);
  }, [focusError]);
  useEffect(() => {
    if (!focusTrigger) return;
    triggerRef.current?.focus();
    setFocusTrigger(false);
  }, [focusTrigger]);

  const start = () => {
    if (
      !data ||
      data.state !== "report" ||
      data.report.status !== "draft" ||
      dispatching.current ||
      publish.isPending
    )
      return;
    dispatching.current = true;
    publish.reset();
    setRequest(coordinateFor(projectId, data));
    setAttempted(false);
    setCheckResult(null);
    setFocusError(false);
    setFocusConfirmation(true);
  };
  const cancel = () => {
    if (attempted || publish.isPending) return;
    setRequest(null);
    setCheckResult(null);
    publicationDispatching.current = false;
    dispatching.current = false;
    setFocusTrigger(true);
  };
  const confirm = () => {
    if (!request || publish.isPending || publicationDispatching.current) return;
    publicationDispatching.current = true;
    setAttempted(true);
    publish.mutate(request);
  };
  const check = async () => {
    if (!request || checking || publicationDispatching.current) return;
    publicationDispatching.current = true;
    setChecking(true);
    setCheckResult(null);
    try {
      const saved = await getGrowthMonthlyPublicationStatus({ data: request });
      if (
        saved.state === "report" &&
        saved.report.status === "published" &&
        saved.report.version === request.version &&
        sameCoordinate(saved, request)
      ) {
        client.setQueryData(queryKey, saved);
        setRequest(null);
        publish.reset();
        setAttempted(false);
        dispatching.current = false;
        onSuccess("Published summary confirmed.");
      } else if (
        saved.state === "report" &&
        saved.report.status === "draft" &&
        saved.report.version === request.version &&
        sameCoordinate(saved, request)
      ) {
        client.setQueryData(queryKey, saved);
        setCheckResult("draft");
      } else setCheckResult("failed");
    } catch {
      setCheckResult("failed");
    } finally {
      publicationDispatching.current = false;
      setChecking(false);
    }
  };

  return {
    active: Boolean(request),
    pending: publish.isPending,
    checking,
    control: {
      request,
      showTrigger: data?.state === "report" && data.report.status === "draft",
      attempted,
      pending: publish.isPending,
      triggerRef,
      confirmationRef,
      onStart: start,
      onConfirm: confirm,
      onCancel: cancel,
    },
    recovery: {
      error: publish.isError && Boolean(request),
      checkResult,
      checking,
      errorRef,
      onCheck: () => void check(),
      onRetry: confirm,
    },
  };
}
