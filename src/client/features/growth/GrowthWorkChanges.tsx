import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getGrowthWorkChanges,
  linkGrowthWorkChange,
} from "@/serverFunctions/growthWork";
import type {
  GrowthWorkChangesOverview,
  LinkGrowthWorkChangeInput,
} from "@/types/schemas/growth-work";
import { GrowthChangeHistory } from "./GrowthChangeHistory";
import { GrowthWorkChangeForm } from "./GrowthWorkChangeForm";

type SubmittedLink = {
  request: LinkGrowthWorkChangeInput;
  change: GrowthWorkChangesOverview["availableChanges"][number];
};

export function GrowthWorkChanges({
  projectId,
  actionId,
}: {
  projectId: string;
  actionId: string;
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
        Related page changes
      </summary>
      {opened ? (
        <GrowthWorkChangesPanel
          key={`${projectId}:${actionId}`}
          projectId={projectId}
          actionId={actionId}
        />
      ) : null}
    </details>
  );
}

export function GrowthWorkChangesPanel({
  projectId,
  actionId,
}: {
  projectId: string;
  actionId: string;
}) {
  const client = useQueryClient();
  const queryKey = ["growthWorkChanges", projectId, actionId];
  const dispatching = useRef(false);
  const [submitted, setSubmitted] = useState<SubmittedLink | null>(null);
  const [saved, setSaved] = useState(false);
  const [formVersion, setFormVersion] = useState(0);
  const query = useQuery({
    queryKey,
    queryFn: () => getGrowthWorkChanges({ data: { projectId, actionId } }),
    retry: false,
  });
  const save = useMutation({
    mutationKey: ["growthWorkChangeLink", projectId, actionId],
    mutationFn: (data: LinkGrowthWorkChangeInput) =>
      linkGrowthWorkChange({ data }),
    retry: false,
    onMutate: () => client.cancelQueries({ queryKey }),
    onSuccess: () => {
      setSubmitted(null);
      setSaved(true);
      setFormVersion((value) => value + 1);
      void client.invalidateQueries({
        queryKey: ["growthWorkMeasurement", projectId, actionId],
      });
    },
    onSettled: () => {
      dispatching.current = false;
      void client.invalidateQueries({ queryKey });
    },
  });
  const submit = (changeEventId: string) => {
    if (dispatching.current || submitted || query.isError) return;
    const change = query.data?.availableChanges.find(
      (item) => item.id === changeEventId,
    );
    if (!change) return;
    const request = { projectId, actionId, changeEventId };
    dispatching.current = true;
    setSaved(false);
    setSubmitted({ request, change });
    save.mutate(request);
  };

  return (
    <div className="mt-3 space-y-4 text-sm">
      <p className="max-w-prose text-base-content/70">
        Link a saved manual change to this investigation. This keeps the records
        together; it does not change the work status or show an SEO impact.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={query.isFetching || save.isPending}
          onClick={() => void query.refetch()}
        >
          Refresh saved links
        </button>
        <a href="#growth-change-log" className="link">
          Open change log
        </a>
      </div>
      {query.isPending ? (
        <p role="status" aria-busy="true">
          Loading related changes…
        </p>
      ) : null}
      {query.isError ? (
        <p role="alert">
          Related changes could not be refreshed. Use Refresh saved links to try
          again.
        </p>
      ) : null}
      {saved ? (
        <p role="status">
          Change linked. The original record and work status are unchanged.
        </p>
      ) : null}
      {save.isPending ? (
        <p role="status" aria-busy="true">
          Linking saved change…
        </p>
      ) : null}
      {save.isError && submitted ? (
        <div role="alert" className="space-y-2">
          <p>
            The link could not be confirmed. Refresh saved links to check, or
            retry the same record.
          </p>
          <p className="text-base-content/70">
            Choosing another change does not remove any link already saved.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-sm"
              disabled={save.isPending}
              onClick={() => {
                if (dispatching.current) return;
                dispatching.current = true;
                save.mutate(submitted.request);
              }}
            >
              Retry link
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={save.isPending}
              onClick={() => {
                setSubmitted(null);
                setFormVersion((value) => value + 1);
                save.reset();
              }}
            >
              Choose another change
            </button>
          </div>
        </div>
      ) : null}
      {query.data ? (
        <>
          <GrowthChangeHistory
            changes={query.data.linkedChanges}
            limit={query.data.limit}
            title="Linked manual changes"
            headingLevel={4}
            emptyMessage="No manual page changes linked to this work yet."
          />
          {query.data.availableChanges.length > 0 || submitted ? (
            <GrowthWorkChangeForm
              key={formVersion}
              changes={
                submitted ? [submitted.change] : query.data.availableChanges
              }
              selectedId={submitted?.request.changeEventId}
              limit={query.data.limit}
              disabled={Boolean(submitted) || save.isPending || query.isError}
              pending={save.isPending}
              onSubmit={submit}
            />
          ) : (
            <p className="text-base-content/70">
              No recent manual changes available. Record a page change in the
              change log, then refresh saved links.
            </p>
          )}
        </>
      ) : null}
    </div>
  );
}
