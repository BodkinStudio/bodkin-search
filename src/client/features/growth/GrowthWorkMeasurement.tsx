import { useRef, useState } from "react";
import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  getGrowthWorkMeasurement,
  startGrowthWorkMeasurement,
} from "@/serverFunctions/growthWork";
import type {
  GrowthWorkItem,
  GrowthWorkOverview,
} from "@/types/schemas/growth-investigations";
import type {
  GrowthWorkMeasurementCandidate,
  GrowthWorkMeasurementOverview,
  StartGrowthWorkMeasurementInput,
} from "@/types/schemas/growth-work";
import { GrowthWorkMeasurementContent } from "./GrowthWorkMeasurementPresentation";
import { GrowthWorkMeasurementCollection } from "./GrowthWorkMeasurementCollection";
import {
  GrowthWorkMeasurementFinalization,
  useGrowthWorkMeasurementFinalizationRecovery,
} from "./GrowthWorkMeasurementFinalization";

type SubmittedMeasurement = {
  request: StartGrowthWorkMeasurementInput;
  candidate: GrowthWorkMeasurementCandidate;
};

const MEASUREMENT_LABELS = {
  implemented: "Start measurement",
  measuring: "View measurement",
  evaluated: "View measured result",
} as const;

export function GrowthWorkMeasurement({
  projectId,
  action,
}: {
  projectId: string;
  action: GrowthWorkItem;
}) {
  const [opened, setOpened] = useState(false);
  const label =
    action.status === "implemented" ||
    action.status === "measuring" ||
    action.status === "evaluated"
      ? MEASUREMENT_LABELS[action.status]
      : null;
  if (!label) return null;
  return (
    <details
      className="mt-3 border-t border-base-300 pt-3"
      onToggle={(event) => {
        if (event.currentTarget.open) setOpened(true);
      }}
    >
      <summary className="cursor-pointer font-medium">{label}</summary>
      {opened ? (
        <GrowthWorkMeasurementPanel
          key={`${projectId}:${action.id}`}
          projectId={projectId}
          action={action}
        />
      ) : null}
    </details>
  );
}

export function GrowthWorkMeasurementPanel({
  projectId,
  action,
}: {
  projectId: string;
  action: GrowthWorkItem;
}) {
  const client = useQueryClient();
  const dispatching = useRef(false);
  const operationRef = useRef<"collection" | "finalization" | null>(null);
  const [submitted, setSubmitted] = useState<SubmittedMeasurement | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [formVersion, setFormVersion] = useState(0);
  const [finalizationLocked, setFinalizationLocked] = useState(false);
  const queryKey = ["growthWorkMeasurement", projectId, action.id];
  const collecting = useIsMutating({
    mutationKey: ["growthWorkMeasurementCollect", projectId, action.id],
  });
  const finalizing = useIsMutating({
    mutationKey: ["growthWorkMeasurementFinalize", projectId, action.id],
  });
  const finalizationRecovery = useGrowthWorkMeasurementFinalizationRecovery(
    projectId,
    action.id,
  );
  const recoveredMeasurement = finalizationRecovery.data?.measurement;
  const workKey = ["growthWork", projectId];
  const historyKey = ["growthWorkHistory", projectId, action.id];
  const read = () =>
    getGrowthWorkMeasurement({ data: { projectId, actionId: action.id } });
  const query = useQuery({
    queryKey,
    queryFn: read,
    enabled: !recoveredMeasurement,
    gcTime: recoveredMeasurement ? Infinity : 5 * 60 * 1000,
    retry: false,
    refetchOnMount: !recoveredMeasurement,
    refetchOnReconnect: !recoveredMeasurement,
    refetchOnWindowFocus:
      collecting === 0 &&
      finalizing === 0 &&
      !finalizationLocked &&
      !recoveredMeasurement,
  });
  const presentedMeasurement = recoveredMeasurement ?? query.data;
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
    mutationKey: ["growthWorkMeasurementStart", projectId, action.id],
    mutationFn: (data: StartGrowthWorkMeasurementInput) =>
      startGrowthWorkMeasurement({ data }),
    retry: false,
    onMutate: async () => {
      await Promise.all([
        client.cancelQueries({ queryKey }),
        client.cancelQueries({ queryKey: workKey }),
      ]);
    },
    onSuccess: (saved) => {
      applySavedState(saved);
      setSubmitted(null);
      setRefreshFailed(false);
      setFormVersion((value) => value + 1);
      setNotice(
        "Measurement started. Work is now Measuring; this does not establish that the selected change caused a result.",
      );
      void client.invalidateQueries({ queryKey: workKey });
      void client.invalidateQueries({ queryKey: historyKey });
    },
    onSettled: () => {
      dispatching.current = false;
    },
  });
  const submit = (implementationChangeEventId: string) => {
    if (
      dispatching.current ||
      submitted ||
      query.isError ||
      query.data?.state !== "eligible"
    )
      return;
    const candidate = query.data.candidates.find(
      (item) =>
        item.change.id === implementationChangeEventId &&
        item.schedule !== null,
    );
    if (!candidate) return;
    const request = {
      projectId,
      actionId: action.id,
      expectedActionVersion: query.data.stateVersion,
      implementationChangeEventId,
    };
    dispatching.current = true;
    setNotice(null);
    setRefreshFailed(false);
    setSubmitted({ request, candidate });
    save.mutate(request);
  };
  const checkSavedMeasurement = async () => {
    if (dispatching.current) return;
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
      setSubmitted(null);
      setFormVersion((value) => value + 1);
      save.reset();
      setNotice(
        refreshed.plan
          ? "Saved measurement refreshed. Review the immutable plan below."
          : "No measurement plan is saved. Review the linked change before trying again.",
      );
      void client.invalidateQueries({ queryKey: workKey });
      void client.invalidateQueries({ queryKey: historyKey });
    } catch {
      setRefreshFailed(true);
    } finally {
      setChecking(false);
      dispatching.current = false;
    }
  };
  const refreshDisabled =
    query.isFetching ||
    Boolean(submitted) ||
    save.isPending ||
    checking ||
    collecting > 0 ||
    finalizing > 0 ||
    finalizationLocked ||
    Boolean(finalizationRecovery.data);

  return (
    <div className="mt-3 max-w-2xl space-y-4 text-sm">
      <p className="text-base-content/70">
        Compare performance before and after one linked website change. The
        selected record sets the timeline; it does not prove what caused later
        movement.
      </p>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={refreshDisabled}
        onClick={() => {
          if (!refreshDisabled) void query.refetch();
        }}
      >
        {query.isFetching ? "Refreshing measurement…" : "Refresh measurement"}
      </button>
      {query.isPending && !presentedMeasurement ? (
        <p role="status" aria-busy="true">
          Loading measurement…
        </p>
      ) : null}
      {query.isError && !presentedMeasurement ? (
        <p role="alert">
          Measurement could not be refreshed. Use Refresh measurement to try
          again.
        </p>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
      {save.isPending ? (
        <p role="status" aria-busy="true">
          Starting measurement…
        </p>
      ) : null}
      {save.isError && submitted ? (
        <div role="alert" className="space-y-2">
          <p>The measurement start could not be confirmed.</p>
          <p className="text-base-content/70">
            Check the saved measurement before choosing anything else, or retry
            the exact same change and schedule.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-sm"
              disabled={save.isPending || checking}
              onClick={() => {
                if (dispatching.current) return;
                dispatching.current = true;
                save.mutate(submitted.request);
              }}
            >
              Retry same measurement
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={save.isPending || checking}
              onClick={() => void checkSavedMeasurement()}
            >
              {checking
                ? "Checking saved measurement…"
                : "Check saved measurement"}
            </button>
          </div>
        </div>
      ) : null}
      {refreshFailed ? (
        <p role="alert">
          Saved measurement could not be refreshed. Your original selection is
          still locked; try Check saved measurement again.
        </p>
      ) : null}
      {presentedMeasurement ? (
        <GrowthWorkMeasurementContent
          key={formVersion}
          data={presentedMeasurement}
          frozenCandidate={submitted?.candidate}
          selectedId={submitted?.request.implementationChangeEventId}
          disabled={
            Boolean(submitted) ||
            save.isPending ||
            checking ||
            finalizationLocked ||
            Boolean(recoveredMeasurement)
          }
          pending={save.isPending}
          onSubmit={submit}
          collectionControl={
            presentedMeasurement.plan ? (
              <GrowthWorkMeasurementCollection
                projectId={projectId}
                actionId={action.id}
                stateVersion={presentedMeasurement.stateVersion}
                collection={presentedMeasurement.plan.collection}
                disabled={
                  finalizationLocked ||
                  finalizing > 0 ||
                  Boolean(finalizationRecovery.data)
                }
                operationRef={operationRef}
              />
            ) : null
          }
          finalizationControl={
            presentedMeasurement.plan ? (
              <GrowthWorkMeasurementFinalization
                projectId={projectId}
                measurement={presentedMeasurement}
                onLockChange={setFinalizationLocked}
                operationRef={operationRef}
              />
            ) : null
          }
        />
      ) : null}
    </div>
  );
}
