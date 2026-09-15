import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  createGrowthPlanAction,
  updateGrowthWorkstream,
} from "@/serverFunctions/growthPlan";
import type {
  GrowthPlanEvidenceSeriesDto,
  GrowthWorkstreamDto,
} from "@/types/schemas/growth-plan";
import { GrowthEvidenceSeriesChart } from "./GrowthEvidenceSeriesChart";
import { GrowthPlanAction } from "./GrowthPlanAction";
import {
  GrowthPlanActionForm,
  type GrowthPlanActionDraft,
} from "./GrowthPlanActionForm";
import { GrowthPlanCase } from "./GrowthPlanCase";
import { CARD, EYEBROW, SECTION } from "./GrowthPlanPresentation";
import { GrowthPlanWorkList } from "./GrowthPlanWorkList";
import {
  GrowthWorkstreamForm,
  type GrowthWorkstreamDraft,
} from "./GrowthWorkstreamForm";
import { GrowthWorkstreamChart } from "./GrowthWorkstreamChart";
import type { GrowthPlanSeriesEntry } from "./growthPlanSeries";

const WORKSTREAM_STATUS_BADGES = {
  active: "",
  done: "badge-success",
  dropped: "badge-ghost line-through",
} as const;

export function GrowthPlanWorkstream({
  projectId,
  projectName,
  workstream,
  workstreams,
  canMoveUp,
  canMoveDown,
  reordering,
  deleting,
  evidence,
  evidencePending,
  evidenceFailed,
  series,
  editing,
  onMove,
  onDelete,
}: {
  projectId: string;
  projectName?: string;
  workstream: GrowthWorkstreamDto;
  workstreams: GrowthWorkstreamDto[];
  canMoveUp: boolean;
  canMoveDown: boolean;
  reordering: boolean;
  deleting: boolean;
  evidence?: GrowthPlanEvidenceSeriesDto;
  evidencePending: boolean;
  evidenceFailed: boolean;
  // The author's own chart for this workstream, when one of its evidence items
  // carries a data series.
  series: GrowthPlanSeriesEntry | null;
  editing: boolean;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
}) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [addingAction, setAddingAction] = useState(false);
  const planKey = ["growthPlan", projectId];
  const refresh = () => client.invalidateQueries({ queryKey: planKey });

  const save = useMutation({
    mutationKey: ["growthWorkstream", projectId, workstream.id],
    mutationFn: (draft: GrowthWorkstreamDraft) =>
      updateGrowthWorkstream({
        data: { ...draft, projectId, workstreamId: workstream.id },
      }),
    retry: false,
    onSuccess: async () => {
      setOpen(false);
      await refresh();
    },
  });
  const addAction = useMutation({
    mutationKey: ["growthPlanAction", projectId, workstream.id],
    mutationFn: (draft: GrowthPlanActionDraft) =>
      createGrowthPlanAction({
        data: {
          ...draft,
          projectId,
          requestKey: crypto.randomUUID(),
          category: "plan",
          priorityScore: 0,
          evidence: [],
        },
      }),
    retry: false,
    onSuccess: async () => {
      setAddingAction(false);
      await refresh();
    },
  });

  // In read mode the live Search Console card only appears when it has numbers
  // to show; its setup notices belong to the person editing the plan.
  const liveRead =
    evidence?.pages.state === "available" ||
    evidence?.pages.state === "no_data";
  // The column split is decided by what the plan holds, not by the mode, so
  // toggling edit never moves the work list.
  const twoColumn = Boolean(series) || liveRead;

  return (
    <section
      id={`growth-workstream-${workstream.id}`}
      aria-labelledby={`growth-workstream-${workstream.id}-title`}
      className={SECTION}
    >
      <div className="flex items-baseline gap-[14px]">
        <p
          aria-hidden="true"
          className="text-[32px] leading-none font-bold tracking-tight tabular-nums text-primary"
        >
          {workstream.position}
        </p>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2
              id={`growth-workstream-${workstream.id}-title`}
              className="text-2xl leading-tight font-semibold [overflow-wrap:anywhere]"
            >
              {workstream.title}
            </h2>
            {workstream.status === "active" ? null : (
              <span
                className={`badge ${WORKSTREAM_STATUS_BADGES[workstream.status]}`}
              >
                {workstream.status === "done" ? "Done" : "Dropped"}
              </span>
            )}
          </div>
          <p className="mt-2 max-w-[68ch] text-[15px] leading-[1.55] whitespace-pre-wrap text-base-content/80 [overflow-wrap:anywhere]">
            {workstream.commercialReason}
          </p>
          {editing ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={() => setOpen((current) => !current)}
              >
                Edit
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                disabled={!canMoveUp || reordering}
                onClick={() => onMove(-1)}
              >
                Move up
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                disabled={!canMoveDown || reordering}
                onClick={() => onMove(1)}
              >
                Move down
              </button>
              {workstream.actions.length === 0 ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  disabled={deleting}
                  onClick={onDelete}
                >
                  Delete
                </button>
              ) : null}
            </div>
          ) : null}
          {save.error ? (
            <p role="alert" className="mt-2 text-sm">
              {getStandardErrorMessage(
                save.error,
                "The workstream was not saved.",
              )}
            </p>
          ) : null}
          {editing && open ? (
            <GrowthWorkstreamForm
              workstream={workstream}
              pending={save.isPending}
              error={null}
              onSubmit={(draft) => save.mutate(draft)}
              onCancel={() => setOpen(false)}
            />
          ) : null}
        </div>
      </div>

      <div
        className={`mt-6 grid items-start gap-6 ${twoColumn ? "lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]" : ""}`}
      >
        {twoColumn ? (
          <div className="min-w-0 space-y-4">
            {series ? (
              <div className={`${CARD} px-[18px] py-4`}>
                <GrowthEvidenceSeriesChart
                  evidence={series.evidence}
                  projectName={projectName}
                  showFinding
                />
              </div>
            ) : null}
            {editing || liveRead ? (
              <GrowthWorkstreamChart
                series={evidence}
                pending={evidencePending}
                failed={evidenceFailed}
              />
            ) : null}
          </div>
        ) : null}
        <GrowthPlanCase
          workstream={workstream}
          chartedEvidenceId={series?.evidence.id}
        />
      </div>

      <div className="mt-6">
        <h3 className={EYEBROW}>What we will do</h3>
        {editing ? (
          <>
            {workstream.actions.length === 0 ? (
              <p className="mt-2 text-sm text-base-content/70">
                No actions in this workstream yet.
              </p>
            ) : (
              <ul className="mt-2 space-y-4">
                {workstream.actions.map((action) => (
                  <GrowthPlanAction
                    key={action.id}
                    projectId={projectId}
                    workstreamId={workstream.id}
                    workstreams={workstreams}
                    action={action}
                  />
                ))}
              </ul>
            )}
            <div className="mt-4">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setAddingAction((current) => !current)}
              >
                Add action
              </button>
            </div>
            {addAction.error ? (
              <p role="alert" className="mt-2 text-sm">
                {getStandardErrorMessage(
                  addAction.error,
                  "The action was not saved.",
                )}
              </p>
            ) : null}
            {addingAction ? (
              <GrowthPlanActionForm
                workstreamId={workstream.id}
                workstreams={workstreams}
                pending={addAction.isPending}
                error={null}
                onSubmit={(draft) => addAction.mutate(draft)}
                onCancel={() => setAddingAction(false)}
              />
            ) : null}
          </>
        ) : (
          <div className="mt-2">
            <GrowthPlanWorkList actions={workstream.actions} />
          </div>
        )}
      </div>
    </section>
  );
}
