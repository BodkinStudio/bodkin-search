import { GrowthAiBriefEvidence } from "./GrowthAiBriefEvidence";
import { GrowthAiProposalEditor } from "./GrowthAiProposalEditor";
import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getErrorCode,
  getStandardErrorMessage,
} from "@/client/lib/error-messages";
import {
  generateGrowthAiInvestigationBrief,
  getSavedGrowthAiBrief,
} from "@/serverFunctions/growthInvestigations";

export function GrowthAiBriefPanel({
  projectId,
  signalId,
  supported = true,
  canApprove = false,
  readOnly = false,
}: {
  projectId: string;
  signalId: string;
  supported?: boolean;
  canApprove?: boolean;
  readOnly?: boolean;
}) {
  const client = useQueryClient();
  const queryKey = ["growthAiBrief", projectId, signalId];
  const query = useQuery({
    queryKey,
    queryFn: () => getSavedGrowthAiBrief({ data: { projectId, signalId } }),
    enabled: supported,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
  const dispatching = useRef(false);
  const generate = useMutation({
    retry: false,
    mutationFn: () =>
      generateGrowthAiInvestigationBrief({ data: { projectId, signalId } }),
    onSuccess: (brief) => client.setQueryData(queryKey, brief),
    onSettled: () => {
      dispatching.current = false;
    },
  });
  const startGeneration = () => {
    if (dispatching.current || generate.isPending || query.data) return;
    dispatching.current = true;
    generate.mutate();
  };
  if (!supported) return null;
  return (
    <section
      className="rounded-md border border-base-300 p-3"
      aria-label="AI brief"
    >
      <h5 className="font-semibold">AI brief</h5>
      {query.isPending ? (
        <p role="status" className="mt-2">
          Loading the brief…
        </p>
      ) : null}
      {query.isError ? (
        <div role="alert" className="mt-2 space-y-2">
          <p>{getStandardErrorMessage(query.error)}</p>
          <button
            className="btn btn-sm"
            type="button"
            onClick={() => void query.refetch()}
          >
            Try again
          </button>
        </div>
      ) : null}
      {query.isSuccess && !query.data && !readOnly ? (
        <>
          <p className="mt-1 text-base-content/70">
            AI reads the page and these numbers, then suggests what to change
            and why. It uses a little AI credit. Nothing is added to your work
            until you approve it.
          </p>
          <button
            className="btn btn-sm mt-3"
            type="button"
            disabled={generate.isPending}
            onClick={startGeneration}
          >
            {generate.isPending ? "Writing the brief…" : "Write an AI brief"}
          </button>
          {generate.isError ? (
            <div role="alert" className="mt-3 space-y-2">
              <p>{getStandardErrorMessage(generate.error)}</p>
              {getErrorCode(generate.error) !== "INSUFFICIENT_CREDITS" ? (
                <button
                  className="btn btn-sm btn-outline"
                  type="button"
                  disabled={generate.isPending}
                  onClick={startGeneration}
                >
                  Try again
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
      {query.data ? (
        <>
          <GrowthAiBriefEvidence brief={query.data} />
          <GrowthAiProposalEditor
            key={`${query.data.id}:${query.data.proposal.version}:${query.data.approval?.actionId ?? "draft"}`}
            brief={query.data}
            readOnly={readOnly}
            canApprove={canApprove && !query.isError}
            onSaved={(brief) => client.setQueryData(queryKey, brief)}
            onReload={async () => !(await query.refetch()).isError}
          />
        </>
      ) : null}
    </section>
  );
}
