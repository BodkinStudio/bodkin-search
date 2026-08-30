import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  approveGrowthInvestigation,
  getGrowthInvestigation,
} from "@/serverFunctions/growthInvestigations";
import type { GrowthInvestigationView } from "@/types/schemas/growth-investigations";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { formatGrowthPreviewDate } from "./GrowthPreviewPresentation";
import { GrowthInvestigationForm } from "./GrowthInvestigationForm";

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
  const submit = (dueOn: string) => {
    if (dispatching.current || submittedDueOn) return;
    dispatching.current = true;
    setSubmittedDueOn(dueOn);
    approve.mutate(dueOn);
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
            disabled={Boolean(submittedDueOn)}
            pending={approve.isPending}
            onSubmit={submit}
          />
          {approve.isError && submittedDueOn ? (
            <div role="alert" className="space-y-2">
              <p className="text-[color:color-mix(in_oklch,var(--color-error),var(--color-base-content)_35%)]">
                {getStandardErrorMessage(
                  approve.error,
                  "The approval could not be confirmed.",
                )}
              </p>
              <p>
                Retry with the same due date, or refresh to check what was
                saved. Reloading will not submit anything automatically.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={approve.isPending}
                  onClick={() => {
                    if (dispatching.current) return;
                    dispatching.current = true;
                    approve.mutate(submittedDueOn);
                  }}
                >
                  Retry approval
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={approve.isPending}
                  onClick={() => void query.refetch()}
                >
                  Refresh saved investigation
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <p className="text-base-content/70">
          This saved suggestion is {saved.status.replaceAll("_", " ")} and
          cannot be approved here.
        </p>
      )}
    </div>
  );
}
