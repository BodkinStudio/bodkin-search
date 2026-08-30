import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getErrorCode } from "@/client/lib/error-messages";
import { getGrowthWork } from "@/serverFunctions/growthInvestigations";
import {
  getGrowthWorkHistory,
  updateGrowthWorkStatus,
} from "@/serverFunctions/growthWork";
import type {
  GrowthWorkItem,
  GrowthWorkOverview,
} from "@/types/schemas/growth-investigations";
import type { UpdateGrowthWorkStatusInput } from "@/types/schemas/growth-work";
import { GrowthWorkHistoryList } from "./GrowthWorkHistory";
import { growthWorkNextStatuses } from "./GrowthWorkPresentation";
import {
  GrowthWorkStatusForm,
  type GrowthWorkStatusDraft,
} from "./GrowthWorkStatusForm";

export function GrowthWorkDelivery({
  projectId,
  action,
}: {
  projectId: string;
  action: GrowthWorkItem;
}) {
  const [opened, setOpened] = useState(false);
  return (
    <details
      className="mt-3 border-t border-base-300 pt-3"
      onToggle={(event) => {
        if (event.currentTarget.open) setOpened(true);
      }}
    >
      <summary className="cursor-pointer font-medium">
        {growthWorkNextStatuses(action.status).length
          ? "Update status and view history"
          : "View status history"}
      </summary>
      {opened ? (
        <GrowthWorkDeliveryPanel projectId={projectId} action={action} />
      ) : null}
    </details>
  );
}

export function GrowthWorkDeliveryPanel({
  projectId,
  action,
}: {
  projectId: string;
  action: GrowthWorkItem;
}) {
  const client = useQueryClient();
  const dispatching = useRef(false);
  const [submitted, setSubmitted] =
    useState<UpdateGrowthWorkStatusInput | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [formVersion, setFormVersion] = useState(0);
  const workKey = ["growthWork", projectId];
  const historyKey = ["growthWorkHistory", projectId, action.id];
  const history = useQuery({
    queryKey: historyKey,
    queryFn: () =>
      getGrowthWorkHistory({ data: { projectId, actionId: action.id } }),
    retry: false,
  });
  const save = useMutation({
    mutationKey: ["growthWorkStatus", projectId],
    mutationFn: (data: UpdateGrowthWorkStatusInput) =>
      updateGrowthWorkStatus({ data }),
    retry: false,
    onMutate: () => client.cancelQueries({ queryKey: workKey }),
    onSuccess: async (saved) => {
      await client.cancelQueries({ queryKey: workKey });
      client.setQueryData<GrowthWorkOverview>(workKey, (current) =>
        current
          ? {
              ...current,
              actions: current.actions.map((item) =>
                item.id === saved.id && item.stateVersion <= saved.stateVersion
                  ? saved
                  : item,
              ),
            }
          : current,
      );
      setSubmitted(null);
      setFormVersion((value) => value + 1);
      setNotice(
        "Status update saved. The current saved status is shown above.",
      );
    },
    onSettled: () => {
      dispatching.current = false;
      void client.invalidateQueries({ queryKey: workKey });
      void client.invalidateQueries({ queryKey: historyKey });
    },
  });
  const submit = (draft: GrowthWorkStatusDraft) => {
    if (dispatching.current || submitted) return;
    const note = draft.note.trim();
    const request: UpdateGrowthWorkStatusInput = {
      projectId,
      actionId: action.id,
      expectedStatus: action.status,
      expectedVersion: action.stateVersion,
      status: draft.status,
      ...(note ? { note } : {}),
    };
    dispatching.current = true;
    setNotice(null);
    setRefreshFailed(false);
    setSubmitted(request);
    save.mutate(request);
  };
  const checkSavedStatus = async () => {
    if (dispatching.current) return;
    dispatching.current = true;
    setChecking(true);
    setRefreshFailed(false);
    try {
      await client.cancelQueries({ queryKey: workKey });
      await client.fetchQuery({
        queryKey: workKey,
        queryFn: () => getGrowthWork({ data: { projectId } }),
        staleTime: 0,
        retry: false,
      });
      setSubmitted(null);
      setFormVersion((value) => value + 1);
      save.reset();
      setNotice(
        "Saved status refreshed. Review it and the history before making another update.",
      );
      void history.refetch();
    } catch {
      setRefreshFailed(true);
    } finally {
      setChecking(false);
      dispatching.current = false;
    }
  };
  const canUpdate = growthWorkNextStatuses(action.status).length > 0;

  return (
    <div className="mt-3 space-y-4 text-sm">
      {canUpdate || submitted ? (
        <GrowthWorkStatusForm
          key={`${submitted?.expectedVersion ?? action.stateVersion}:${formVersion}`}
          currentStatus={submitted?.expectedStatus ?? action.status}
          disabled={Boolean(submitted) || checking || save.isPending}
          pending={save.isPending}
          onSubmit={submit}
        />
      ) : (
        <p className="text-base-content/70">
          {action.status === "implemented"
            ? "This work is recorded as implemented. Measurement and evaluation are separate steps; they cannot be started here."
            : action.status === "measuring"
              ? "This work is being measured. Its delivery status cannot be changed here."
              : "This work cannot be reopened here. Its saved history remains available below."}
        </p>
      )}
      {save.isPending ? (
        <p role="status" aria-busy="true">
          Saving status…
        </p>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
      {save.isError && submitted ? (
        <div role="alert" className="space-y-2">
          <p>
            {getErrorCode(save.error) === "CONFLICT"
              ? "This work changed, or the update differs from one already saved."
              : "The status update could not be confirmed."}
          </p>
          <p>
            Check saved status before making another update, or retry the same
            status and note. Refreshing or reloading never submits an update.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-sm"
              disabled={save.isPending || checking}
              onClick={() => {
                if (dispatching.current) return;
                dispatching.current = true;
                save.mutate(submitted);
              }}
            >
              Retry same update
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={save.isPending || checking}
              onClick={() => void checkSavedStatus()}
            >
              {checking ? "Checking saved status…" : "Check saved status"}
            </button>
          </div>
        </div>
      ) : null}
      {refreshFailed ? (
        <p role="alert">
          Saved status could not be refreshed. Your submitted details are still
          locked; try Check saved status again.
        </p>
      ) : null}
      <div className="border-t border-base-300 pt-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-semibold">Recent status history</h4>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={history.isFetching || save.isPending || checking}
            onClick={() => void history.refetch()}
          >
            Refresh history
          </button>
        </div>
        {history.isPending ? (
          <p role="status" aria-busy="true">
            Loading status history…
          </p>
        ) : null}
        {history.isError ? (
          <p role="alert" className="mb-3">
            Status history could not be refreshed. Use Refresh history to try
            again.
          </p>
        ) : null}
        {history.data ? <GrowthWorkHistoryList data={history.data} /> : null}
      </div>
    </div>
  );
}
