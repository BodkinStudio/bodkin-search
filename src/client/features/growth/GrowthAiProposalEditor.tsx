import { useId, useRef, useState } from "react";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { getFieldError } from "@/client/lib/forms";
import {
  saveGrowthAiInvestigationBrief,
  approveGrowthAiInvestigationBrief,
} from "@/serverFunctions/growthInvestigations";
import {
  saveGrowthAiBriefEditsSchema,
  approveGrowthAiBriefSchema,
  type SavedGrowthAiBrief,
  type SaveGrowthAiBriefEditsInput,
  type ApproveGrowthAiBriefInput,
} from "@/types/schemas/growth-investigations";
import { GrowthAiProposalField } from "./GrowthAiProposalField";

const editFieldsSchema = saveGrowthAiBriefEditsSchema.pick({
  title: true,
  proposedSteps: true,
  measurementApproach: true,
});
const dueDateSchema = approveGrowthAiBriefSchema.pick({ dueOn: true });

export function GrowthAiProposalEditor({
  brief,
  readOnly,
  canApprove,
  onSaved,
  onReload,
}: {
  brief: SavedGrowthAiBrief;
  readOnly: boolean;
  canApprove: boolean;
  onSaved: (brief: SavedGrowthAiBrief) => void;
  onReload: () => Promise<boolean>;
}) {
  const client = useQueryClient();
  const id = useId();
  const dispatching = useRef(false);
  const [submittedApproval, setSubmittedApproval] =
    useState<ApproveGrowthAiBriefInput | null>(null);
  const [submittedEdit, setSubmittedEdit] =
    useState<SaveGrowthAiBriefEditsInput | null>(null);
  const save = useMutation({
    retry: false,
    mutationFn: (data: SaveGrowthAiBriefEditsInput) =>
      saveGrowthAiInvestigationBrief({ data }),
    onSuccess: onSaved,
    onSettled: () => {
      dispatching.current = false;
    },
  });
  const approve = useMutation({
    retry: false,
    mutationFn: (data: ApproveGrowthAiBriefInput) =>
      approveGrowthAiInvestigationBrief({ data }),
    onSuccess: ({ brief: approved }) => {
      onSaved(approved);
      for (const prefix of [
        "growthInvestigation",
        "growthWork",
        "growthProjectSummary",
        "growthPriorityRecommendations",
      ]) {
        void client.invalidateQueries({ queryKey: [prefix, brief.projectId] });
      }
    },
    onSettled: () => {
      dispatching.current = false;
    },
  });
  const locked =
    readOnly ||
    Boolean(brief.approval) ||
    save.isPending ||
    approve.isPending ||
    Boolean(submittedApproval) ||
    Boolean(submittedEdit);
  const form = useForm({
    defaultValues: {
      title: brief.proposal.title,
      proposedSteps: brief.proposal.proposedSteps,
      measurementApproach: brief.proposal.measurementApproach,
    },
    validators: { onSubmit: editFieldsSchema },
    onSubmit: ({ value }) => {
      if (locked || dispatching.current) return;
      dispatching.current = true;
      const data = {
        ...value,
        projectId: brief.projectId,
        briefId: brief.id,
        expectedVersion: brief.proposal.version,
      };
      setSubmittedEdit(data);
      save.mutate(data);
    },
  });
  const approvalForm = useForm({
    defaultValues: { dueOn: "" },
    validators: { onSubmit: dueDateSchema },
    onSubmit: ({ value }) => {
      if (locked || dispatching.current || !canApprove || form.state.isDirty)
        return;
      dispatching.current = true;
      const data = {
        projectId: brief.projectId,
        briefId: brief.id,
        expectedVersion: brief.proposal.version,
        dueOn: value.dueOn,
      };
      setSubmittedApproval(data);
      approve.mutate(data);
    },
  });
  return (
    <div className="mt-4 border-t border-base-300 pt-3">
      <h6 className="font-semibold">
        {brief.approval ? "Approved proposal" : "Your proposal"}
      </h6>
      <p className="mt-1 text-xs text-base-content/70">
        Saved version {brief.proposal.version}. Edits change your proposal; the
        original AI evidence above stays as generated.
      </p>
      {readOnly || brief.approval ? (
        <div className="mt-3 space-y-2">
          <p className="font-medium">{brief.proposal.title}</p>
          <ol className="list-decimal space-y-1 pl-5">
            {brief.proposal.proposedSteps.map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
          <p>
            <span className="font-medium">Proposed measurement approach: </span>
            {brief.proposal.measurementApproach}
          </p>
          {brief.approval ? (
            <p role="status">
              Version {brief.approval.version} approved. Due{" "}
              {brief.approval.dueOn} (UTC).{" "}
              <a
                className="link"
                href={`#growth-action-${brief.approval.actionId}`}
              >
                View approved work
              </a>
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <form
            className="mt-3 space-y-3"
            aria-label="Edit AI proposal"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void form.handleSubmit();
            }}
          >
            <fieldset disabled={locked} className="min-w-0 space-y-3">
              <form.Field name="title">
                {(field) => (
                  <GrowthAiProposalField
                    id={`${id}-title`}
                    label="Work title"
                    field={field}
                    maxLength={300}
                  />
                )}
              </form.Field>
              <form.Field name="proposedSteps" mode="array">
                {(stepsField) => (
                  <div className="space-y-2">
                    <p className="font-medium">Proposed steps</p>
                    {stepsField.state.value.map((_, index) => (
                      <form.Field key={index} name={`proposedSteps[${index}]`}>
                        {(field) => (
                          <div>
                            <GrowthAiProposalField
                              id={`${id}-step-${index}`}
                              label={`Step ${index + 1}`}
                              field={field}
                              maxLength={1200}
                              rows={3}
                            />
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs"
                              disabled={stepsField.state.value.length === 1}
                              onClick={() => stepsField.removeValue(index)}
                            >
                              Remove step {index + 1}
                            </button>
                          </div>
                        )}
                      </form.Field>
                    ))}
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      disabled={stepsField.state.value.length >= 6}
                      onClick={() => stepsField.pushValue("")}
                    >
                      Add step
                    </button>
                    <p role="alert">
                      {getFieldError(stepsField.state.meta.errors)}
                    </p>
                  </div>
                )}
              </form.Field>
              <form.Field name="measurementApproach">
                {(field) => (
                  <GrowthAiProposalField
                    id={`${id}-measurement`}
                    label="Proposed measurement approach"
                    field={field}
                    maxLength={1800}
                    rows={4}
                    hint="This does not start measurement. Record the website change before setting up a formal measurement."
                  />
                )}
              </form.Field>
              <form.Subscribe selector={(state) => state.isDirty}>
                {(dirty) => (
                  <div>
                    <p role="status" className="text-xs text-base-content/70">
                      {dirty
                        ? "Unsaved edits. Save before approving."
                        : "You are viewing the saved proposal."}
                    </p>
                    <button
                      className="btn btn-sm mt-2"
                      type="submit"
                      disabled={!dirty}
                    >
                      {save.isPending
                        ? "Saving proposal…"
                        : "Save proposal changes"}
                    </button>
                  </div>
                )}
              </form.Subscribe>
            </fieldset>
          </form>
          <form
            className="mt-4 space-y-2"
            aria-label="Approve saved AI proposal"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void approvalForm.handleSubmit();
            }}
          >
            <form.Subscribe selector={(state) => state.isDirty}>
              {(dirty) => (
                <fieldset
                  disabled={locked || dirty || !canApprove}
                  className="min-w-0 space-y-2"
                >
                  <approvalForm.Field name="dueOn">
                    {(field) => (
                      <GrowthAiProposalField
                        id={`${id}-due`}
                        label="Due date (UTC)"
                        field={field}
                        type="date"
                      />
                    )}
                  </approvalForm.Field>
                  <button type="submit" className="btn btn-primary btn-sm">
                    {approve.isPending
                      ? "Creating approved work…"
                      : `Approve saved proposal (version ${brief.proposal.version})`}
                  </button>
                </fieldset>
              )}
            </form.Subscribe>
            <p className="text-xs text-base-content/70">
              Approval creates planned work from this saved version. It does not
              change the website.
            </p>
            {!canApprove ? (
              <p className="text-base-content/70">
                The original investigation must be available for review before
                this proposal can be approved.
              </p>
            ) : null}
          </form>
          {save.isError || approve.isError ? (
            <div role="alert" className="mt-3 space-y-2">
              <p>
                {getStandardErrorMessage(
                  save.isError ? save.error : approve.error,
                )}
              </p>
              <p>
                Reload to check the saved version before changing the proposal
                again. A retry uses the same submitted details.
              </p>
              <button
                type="button"
                className="btn btn-sm"
                disabled={save.isPending || approve.isPending}
                onClick={() => {
                  if (dispatching.current) return;
                  dispatching.current = true;
                  if (submittedApproval) approve.mutate(submittedApproval);
                  else if (submittedEdit) save.mutate(submittedEdit);
                  else dispatching.current = false;
                }}
              >
                Retry submitted request
              </button>{" "}
              <button
                type="button"
                className="btn btn-sm btn-outline"
                disabled={save.isPending || approve.isPending}
                onClick={() =>
                  void onReload().then((reloaded) => {
                    if (!reloaded) return;
                    form.reset();
                    approvalForm.reset();
                    setSubmittedApproval(null);
                    setSubmittedEdit(null);
                    save.reset();
                    approve.reset();
                  })
                }
              >
                Reload saved version
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
