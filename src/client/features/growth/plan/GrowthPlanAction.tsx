import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal } from "@/client/components/Modal";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  addGrowthActionEvidence,
  removeGrowthActionEvidence,
  transitionGrowthPlanAction,
  updateGrowthPlanAction,
} from "@/serverFunctions/growthPlan";
import type { GrowthActionStatus } from "@/types/schemas/growth-actions";
import type {
  GrowthPlanActionDto,
  GrowthWorkstreamDto,
} from "@/types/schemas/growth-plan";
import { formatGrowthPreviewDate } from "../GrowthPreviewPresentation";
import {
  GROWTH_WORK_STATUS_LABELS,
  growthWorkNextStatuses,
} from "../GrowthWorkPresentation";
import {
  GrowthPlanActionForm,
  type GrowthPlanActionDraft,
} from "./GrowthPlanActionForm";
import { GrowthPlanEvidence } from "./GrowthPlanEvidence";
import {
  GrowthEvidenceForm,
  type GrowthEvidenceDraft,
} from "./GrowthEvidenceForm";
import { GROWTH_PLAN_STATUS_BADGES } from "./GrowthPlanPresentation";

export function GrowthPlanAction({
  projectId,
  workstreamId,
  workstreams,
  action,
}: {
  projectId: string;
  workstreamId: string;
  workstreams: GrowthWorkstreamDto[];
  action: GrowthPlanActionDto;
}) {
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [addingEvidence, setAddingEvidence] = useState(false);
  const planKey = ["growthPlan", projectId];
  const refresh = () => client.invalidateQueries({ queryKey: planKey });
  const badge = GROWTH_PLAN_STATUS_BADGES[action.status];
  const nextStatuses = growthWorkNextStatuses(action.status);

  const save = useMutation({
    mutationKey: ["growthPlanAction", projectId, action.id],
    // The update contract carries no targets: they are fixed at creation, so the
    // edit form shows them read-only and they are not sent back.
    mutationFn: (draft: GrowthPlanActionDraft) =>
      updateGrowthPlanAction({
        data: {
          projectId,
          actionId: action.id,
          workstreamId: draft.workstreamId,
          title: draft.title,
          rationale: draft.rationale,
          successMeasure: draft.successMeasure,
          description: draft.description,
          dueOn: draft.dueOn,
        },
      }),
    retry: false,
    onSuccess: async () => {
      setEditing(false);
      await refresh();
    },
  });
  const addEvidence = useMutation({
    mutationKey: ["growthActionEvidence", projectId, action.id],
    mutationFn: (evidence: GrowthEvidenceDraft) =>
      addGrowthActionEvidence({
        data: {
          projectId,
          actionId: action.id,
          evidence,
          requestKey: crypto.randomUUID(),
        },
      }),
    retry: false,
    onSuccess: async () => {
      setAddingEvidence(false);
      await refresh();
    },
  });
  const dropEvidence = useMutation({
    mutationKey: ["growthActionEvidence", projectId, action.id],
    mutationFn: (evidenceId: string) =>
      removeGrowthActionEvidence({
        data: { projectId, actionId: action.id, evidenceId },
      }),
    retry: false,
    onSuccess: refresh,
  });
  const changeStatus = useMutation({
    mutationKey: ["growthPlanActionStatus", projectId, action.id],
    mutationFn: (status: GrowthActionStatus) =>
      transitionGrowthPlanAction({
        data: {
          projectId,
          actionId: action.id,
          expectedStatus: action.status,
          expectedVersion: action.stateVersion,
          status,
        },
      }),
    retry: false,
    onSuccess: refresh,
  });
  const failure =
    save.error ?? addEvidence.error ?? dropEvidence.error ?? changeStatus.error;

  return (
    <li className="border-t border-base-300 pt-4 [overflow-wrap:anywhere]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {nextStatuses.length > 0 ? (
          <select
            className="select select-sm w-auto"
            aria-label={`Status of ${action.title}`}
            value={action.status}
            disabled={changeStatus.isPending}
            onChange={(event) => {
              const next = nextStatuses.find(
                (status) => status === event.target.value,
              );
              if (next) changeStatus.mutate(next);
            }}
          >
            <option value={action.status}>{badge.label}</option>
            {nextStatuses.map((status) => (
              <option key={status} value={status}>
                Move to {GROWTH_WORK_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        ) : (
          <span className={`badge ${badge.className}`}>{badge.label}</span>
        )}
        <h4 className="font-semibold">{action.title}</h4>
        <p className="text-sm tabular-nums text-base-content/70">
          Due {formatGrowthPreviewDate(action.dueOn)}
        </p>
      </div>
      {action.rationale ? (
        <p className="mt-2 max-w-prose text-sm whitespace-pre-wrap">
          {action.rationale}
        </p>
      ) : null}
      {action.description && action.description !== action.rationale ? (
        <p className="mt-2 max-w-prose text-sm whitespace-pre-wrap text-base-content/70">
          {action.description}
        </p>
      ) : null}
      {action.successMeasure ? (
        <p className="mt-2 text-sm">
          <span className="font-medium">Measure:</span> {action.successMeasure}
        </p>
      ) : null}
      {action.targets.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-1">
          {action.targets.map((target) => (
            <li
              key={`${target.targetType}:${target.targetValue}`}
              className="badge badge-ghost badge-sm font-mono"
            >
              {target.targetValue}
            </li>
          ))}
        </ul>
      ) : null}
      <GrowthPlanEvidence
        evidence={action.evidence}
        pending={dropEvidence.isPending}
        onRemove={(evidenceId) => dropEvidence.mutate(evidenceId)}
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setEditing(true)}
        >
          Edit
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setAddingEvidence(true)}
        >
          Add evidence
        </button>
      </div>
      {failure ? (
        <p role="alert" className="mt-2 text-sm">
          {getStandardErrorMessage(failure, "That change was not saved.")}
        </p>
      ) : null}
      {editing ? (
        <Modal
          maxWidth="max-w-2xl"
          labelledBy={`edit-action-${action.id}`}
          onClose={() => setEditing(false)}
        >
          <h3 id={`edit-action-${action.id}`} className="text-lg font-semibold">
            Edit action
          </h3>
          <GrowthPlanActionForm
            workstreamId={workstreamId}
            workstreams={workstreams}
            action={action}
            pending={save.isPending}
            error={null}
            onSubmit={(draft) => save.mutate(draft)}
            onCancel={() => setEditing(false)}
          />
        </Modal>
      ) : null}
      {addingEvidence ? (
        <Modal
          maxWidth="max-w-2xl"
          labelledBy={`add-evidence-${action.id}`}
          onClose={() => setAddingEvidence(false)}
        >
          <h3
            id={`add-evidence-${action.id}`}
            className="text-lg font-semibold"
          >
            Add evidence to &ldquo;{action.title}&rdquo;
          </h3>
          <GrowthEvidenceForm
            pending={addEvidence.isPending}
            error={null}
            onSubmit={(draft) => addEvidence.mutate(draft)}
            onCancel={() => setAddingEvidence(false)}
          />
        </Modal>
      ) : null}
    </li>
  );
}
