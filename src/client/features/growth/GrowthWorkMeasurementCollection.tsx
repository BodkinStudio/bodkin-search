import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { collectGrowthWorkMeasurement } from "@/serverFunctions/growthWork";
import type {
  GrowthWorkMeasurementOverview,
  GrowthWorkMeasurementPlan,
} from "@/types/schemas/growth-work";
import { formatGrowthPreviewDate } from "./GrowthPreviewPresentation";

export function GrowthWorkMeasurementCollection({
  projectId,
  actionId,
  stateVersion,
  collection,
}: {
  projectId: string;
  actionId: string;
  stateVersion: number;
  collection: GrowthWorkMeasurementPlan["collection"];
}) {
  const client = useQueryClient();
  const dispatching = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);
  const queryKey = ["growthWorkMeasurement", projectId, actionId];
  const collect = useMutation({
    mutationKey: ["growthWorkMeasurementCollect", projectId, actionId],
    mutationFn: () =>
      collectGrowthWorkMeasurement({
        data: {
          projectId,
          actionId,
          expectedActionVersion: stateVersion,
        },
      }),
    retry: false,
    onMutate: async () => {
      await client.cancelQueries({ queryKey });
      setNotice(null);
    },
    onSuccess: async (saved) => {
      client.setQueryData<GrowthWorkMeasurementOverview>(queryKey, (current) =>
        current && current.stateVersion > saved.stateVersion ? current : saved,
      );
      setNotice(
        "Available Search Console evidence was saved. The comparison is observational and does not prove what caused the movement.",
      );
      await client.invalidateQueries({
        queryKey,
        refetchType: "active",
      });
      void client.invalidateQueries({
        queryKey: ["growthWork", projectId],
      });
    },
    onSettled: () => {
      dispatching.current = false;
    },
  });
  const submit = () => {
    if (dispatching.current || collect.isPending || !collection.canCollect)
      return;
    dispatching.current = true;
    collect.mutate();
  };

  if (collection.state === "closed") return null;

  return (
    <div className="mt-4 space-y-3">
      {collection.state === "missing_connection" ? (
        <p role="alert" className="text-base-content/80">
          Connect a Search Console property before collecting measurement data.{" "}
          <Link
            className="link"
            to="/p/$projectId/settings/integrations"
            params={{ projectId }}
          >
            Open integrations
          </Link>
          .
        </p>
      ) : null}
      {collection.state === "waiting" && collection.nextAvailableOn ? (
        <p className="text-base-content/70">
          Waiting for final Google data. The next period can be collected on{" "}
          <span className="font-medium tabular-nums">
            {formatGrowthPreviewDate(collection.nextAvailableOn)}
          </span>
          .
        </p>
      ) : null}
      {collection.state === "unsupported" ? (
        <p role="alert">
          This saved plan contains metrics that this Search Console collector
          does not support yet. No data has been inferred or changed.
        </p>
      ) : null}
      {collection.state === "inconsistent" ? (
        <p role="alert">
          This plan's saved evidence is incomplete or does not come from one
          consistent Search Console source. Refresh the measurement before
          trying to collect more data.
        </p>
      ) : null}
      {collection.state === "collected" ? (
        <p role="status" className="text-base-content/70">
          All scheduled Search Console periods are collected. The Work remains
          Measuring until its evidence and possible confounders are evaluated.
        </p>
      ) : null}
      {collection.state === "ready" ? (
        <div>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={collect.isPending}
            onClick={submit}
          >
            {collect.isPending
              ? "Collecting available data…"
              : "Collect available data"}
          </button>
          <p className="mt-2 text-xs text-base-content/70">
            This reads the connected Search Console property and saves only
            complete final-data periods. It does not calculate a verdict.
          </p>
        </div>
      ) : null}
      {collect.isPending ? (
        <p role="status" aria-busy="true">
          Reading final Search Console data…
        </p>
      ) : null}
      {collect.isError ? (
        <p role="alert">
          Search Console evidence could not be confirmed, so no new period is
          shown as collected. Check the connection and source data, refresh the
          measurement, then try again.
        </p>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
    </div>
  );
}
