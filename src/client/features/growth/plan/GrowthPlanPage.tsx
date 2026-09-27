import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  createGrowthWorkstream,
  deleteGrowthWorkstream,
  getGrowthPlan,
  getGrowthPlanEvidence,
  reorderGrowthWorkstreams,
} from "@/serverFunctions/growthPlan";
import type {
  GrowthPlanDto,
  GrowthPlanEvidenceDto,
  GrowthWorkstreamDto,
} from "@/types/schemas/growth-plan";
import { formatGrowthPreviewDate } from "../GrowthPreviewPresentation";
import { Link } from "@tanstack/react-router";
import { Modal } from "@/client/components/Modal";
import { GrowthAnalystPanel } from "./GrowthAnalystPanel";
import { GrowthPlanBelief } from "./GrowthPlanBelief";
import { GrowthPlanHero } from "./GrowthPlanHero";
import { GrowthPlanLedger } from "./GrowthPlanLedger";
import {
  CARD,
  SECTION,
  SECTION_SUB,
  SECTION_TITLE,
} from "./GrowthPlanPresentation";
import { GrowthPlanProgramme } from "./GrowthPlanProgramme";
import { GrowthPlanStatus } from "./GrowthPlanStatus";
import { GrowthPlanWorkstream } from "./GrowthPlanWorkstream";
import {
  GrowthWorkstreamForm,
  type GrowthWorkstreamDraft,
} from "./GrowthWorkstreamForm";
import { allocateGrowthPlanCharts } from "./growthPlanSeries";

export function GrowthPlanPage({
  projectId,
  defaultEdit = false,
  canEdit,
}: {
  projectId: string;
  defaultEdit?: boolean;
  canEdit: boolean;
}) {
  const client = useQueryClient();
  // The plan is a document first: everything that lets someone change it is
  // behind one switch, so the default read is as calm as the printed page.
  const [editRequested, setEditing] = useState(defaultEdit);
  const editing = canEdit && editRequested;
  const [adding, setAdding] = useState(false);
  const planKey = ["growthPlan", projectId];
  const query = useQuery({
    queryKey: planKey,
    queryFn: (): Promise<GrowthPlanDto> =>
      getGrowthPlan({ data: { projectId } }),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  const refresh = () => client.invalidateQueries({ queryKey: planKey });
  // One request covers every workstream's live Search Console card.
  const evidenceQuery = useQuery({
    queryKey: ["growthPlanEvidence", projectId],
    queryFn: (): Promise<GrowthPlanEvidenceDto> =>
      getGrowthPlanEvidence({ data: { projectId } }),
    retry: false,
    staleTime: 15 * 60 * 1000,
  });
  // The project name is already in the cache from the project layout's access
  // check; the plan does not fetch it again just to write a breadcrumb.
  const projectName = z
    .object({ name: z.string() })
    .safeParse(client.getQueryData(["projectAccess", projectId])).data?.name;

  const add = useMutation({
    mutationKey: ["growthWorkstream", projectId],
    mutationFn: (draft: GrowthWorkstreamDraft) =>
      createGrowthWorkstream({
        data: {
          projectId,
          requestKey: crypto.randomUUID(),
          title: draft.title,
          commercialReason: draft.commercialReason,
          targetLabel: draft.targetLabel,
          targetBaseline: draft.targetBaseline,
          targetValue: draft.targetValue,
          targetDueOn: draft.targetDueOn,
        },
      }),
    retry: false,
    onSuccess: async () => {
      setAdding(false);
      await refresh();
    },
  });
  const reorder = useMutation({
    mutationKey: ["growthWorkstreamOrder", projectId],
    mutationFn: (orderedWorkstreamIds: string[]) =>
      reorderGrowthWorkstreams({ data: { projectId, orderedWorkstreamIds } }),
    retry: false,
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationKey: ["growthWorkstreamDelete", projectId],
    mutationFn: (workstreamId: string) =>
      deleteGrowthWorkstream({ data: { projectId, workstreamId } }),
    retry: false,
    onSuccess: refresh,
  });

  const workstreams = query.data?.workstreams ?? [];
  const actions = workstreams.flatMap((workstream) => workstream.actions);
  const charts = allocateGrowthPlanCharts(workstreams);
  const heroTarget =
    workstreams.find(
      (workstream) => workstream.status === "active" && workstream.targetLabel,
    ) ?? null;
  const move = (workstream: GrowthWorkstreamDto, direction: -1 | 1) => {
    const ids = workstreams.map((entry) => entry.id);
    const from = ids.indexOf(workstream.id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= ids.length) return;
    ids.splice(to, 0, ...ids.splice(from, 1));
    reorder.mutate(ids);
  };
  const failure = add.error ?? reorder.error ?? remove.error;
  const empty = query.isSuccess && workstreams.length === 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-base-content/60">
          {query.data?.updatedAt
            ? `Updated ${formatGrowthPreviewDate(query.data.updatedAt)}`
            : null}
        </p>
        {canEdit && !empty ? (
          <button
            type="button"
            className={`btn btn-sm ${editing ? "btn-primary" : "btn-outline"}`}
            aria-pressed={editing}
            onClick={() => setEditing((current) => !current)}
          >
            {editing ? "Done editing" : "Edit plan"}
          </button>
        ) : null}
      </div>

      {failure ? (
        <p role="alert" className="alert alert-error text-sm">
          {getStandardErrorMessage(failure, "That change was not saved.")}
        </p>
      ) : null}

      {query.isPending ? <GrowthPlanSkeleton /> : null}
      {query.isError ? (
        <div role="alert" className="alert">
          <span>The plan could not be loaded.</span>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => void query.refetch()}
          >
            Try again
          </button>
        </div>
      ) : null}

      {empty ? (
        <GrowthPlanEmpty
          canEdit={canEdit}
          adding={adding}
          onStart={() => {
            setEditing(true);
            setAdding(true);
          }}
        />
      ) : null}

      {query.isSuccess && !empty ? (
        <>
          <GrowthPlanHero
            projectId={projectId}
            thesis={query.data.thesis}
            lede={query.data.lede}
            target={heroTarget}
            targetSeries={heroTarget ? charts.get(heroTarget.id) : undefined}
            editing={editing}
          />
          <GrowthAnalystPanel
            projectId={projectId}
            workstreams={workstreams.filter(
              (workstream) => workstream.status === "active",
            )}
            canEdit={canEdit}
          />
          <GrowthPlanStatus projectId={projectId} workstreams={workstreams} />
          <div
            className={`${SECTION} flex flex-wrap items-end justify-between gap-3`}
          >
            <h2 className={SECTION_TITLE}>
              {workstreams.length === 1
                ? "One workstream"
                : `${workstreams.length} workstreams, in priority order`}
            </h2>
            <p className={SECTION_SUB}>
              Each pairs the evidence with the work it justifies
            </p>
          </div>
        </>
      ) : null}

      {editing && !empty ? (
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => setAdding(true)}
        >
          Add workstream
        </button>
      ) : null}
      {editing && adding ? (
        <Modal
          maxWidth="max-w-2xl"
          labelledBy="add-workstream-title"
          onClose={() => setAdding(false)}
        >
          <h3 id="add-workstream-title" className="text-lg font-semibold">
            Add a workstream
          </h3>
          <GrowthWorkstreamForm
            pending={add.isPending}
            error={null}
            onSubmit={(draft) => add.mutate(draft)}
            onCancel={() => setAdding(false)}
          />
        </Modal>
      ) : null}

      {workstreams.map((workstream, index) => (
        <GrowthPlanWorkstream
          key={workstream.id}
          projectId={projectId}
          projectName={projectName}
          workstream={workstream}
          workstreams={workstreams}
          canMoveUp={index > 0}
          canMoveDown={index < workstreams.length - 1}
          reordering={reorder.isPending}
          deleting={remove.isPending}
          evidence={evidenceQuery.data?.workstreams.find(
            (series) => series.workstreamId === workstream.id,
          )}
          evidencePending={evidenceQuery.isPending}
          evidenceFailed={evidenceQuery.isError}
          series={charts.get(workstream.id) ?? []}
          editing={editing}
          onMove={(direction) => move(workstream, direction)}
          onDelete={() => remove.mutate(workstream.id)}
        />
      ))}

      {query.isSuccess && !empty ? (
        <>
          <GrowthPlanProgramme actions={actions} />
          <GrowthPlanLedger projectId={projectId} />
          <GrowthPlanBelief />
        </>
      ) : null}
    </div>
  );
}

function GrowthPlanSkeleton() {
  return (
    <div role="status" aria-busy="true" className="space-y-6">
      <span className="sr-only">Loading the plan…</span>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="space-y-3">
          <div className="skeleton h-4 w-32" />
          <div className="skeleton h-9 w-4/5" />
          <div className="skeleton h-4 w-3/5" />
        </div>
        <div className="skeleton h-40" />
      </div>
      <div className="skeleton h-48" />
    </div>
  );
}

function GrowthPlanEmpty({
  canEdit,
  adding,
  onStart,
}: {
  canEdit: boolean;
  adding: boolean;
  onStart: () => void;
}) {
  return (
    <section className={`${CARD} max-w-2xl p-6`}>
      <h2 className="text-lg font-semibold">No plan yet</h2>
      {canEdit ? (
        <>
          <p className="mt-2 text-sm text-base-content/70">
            A plan sets out a few workstreams, the work in each, and the number
            each one is judged on. The quickest way to write one is to ask your
            AI assistant, connected through Bodkin&rsquo;s MCP server, to draft
            it from your data. You can also start it here.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {adding ? null : (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={onStart}
              >
                Add the first workstream
              </button>
            )}
            <Link to="/ai" className="btn btn-ghost btn-sm">
              Connect an AI assistant
            </Link>
          </div>
        </>
      ) : (
        <p className="mt-2 text-sm text-base-content/70">
          Your Growth plan is not ready yet. Your workspace team will publish it
          here.
        </p>
      )}
    </section>
  );
}
