import { useId } from "react";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { getFieldError } from "@/client/lib/forms";
import {
  GROWTH_ACTION_STATUSES,
  isDirectGrowthActionTransition,
  type GrowthActionStatus,
} from "@/types/schemas/growth-actions";
import {
  GROWTH_WORK_STATUS_LABELS,
  growthWorkNextStatuses,
} from "./GrowthWorkPresentation";

export type GrowthWorkStatusDraft = {
  status: GrowthActionStatus;
  note: string;
};

export function GrowthWorkStatusForm({
  currentStatus,
  disabled,
  pending,
  onSubmit,
}: {
  currentStatus: GrowthActionStatus;
  disabled: boolean;
  pending: boolean;
  onSubmit: (draft: GrowthWorkStatusDraft) => void;
}) {
  const id = useId();
  const nextStatuses = growthWorkNextStatuses(currentStatus);
  const schema = z.object({
    status: z
      .enum(GROWTH_ACTION_STATUSES, "Choose a next status")
      .refine(
        (next) => isDirectGrowthActionTransition(currentStatus, next),
        "Choose an available next status",
      ),
    note: z.string().trim().max(5000, "Use 5,000 characters or fewer"),
  });
  const form = useForm({
    defaultValues: { status: "" as GrowthActionStatus | "", note: "" },
    validators: { onSubmit: schema },
    onSubmit: ({ value }) => {
      if (!disabled) onSubmit(schema.parse(value));
    },
  });

  return (
    <form
      noValidate
      aria-label="Update work status"
      className="max-w-md"
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled) void form.handleSubmit();
      }}
    >
      <p id={`${id}-hint`} className="text-sm text-base-content/70">
        Record the status of this investigation. Implemented does not mean the
        website has changed or the results have been evaluated.
      </p>
      <fieldset disabled={disabled} className="mt-3 min-w-0 space-y-3">
        <form.Field name="status">
          {(field) => {
            const error = getFieldError(field.state.meta.errors);
            return (
              <div>
                <label htmlFor={`${id}-status`} className="font-medium">
                  Next status
                </label>
                <select
                  id={`${id}-status`}
                  required
                  className="select select-bordered mt-1 w-full"
                  value={field.state.value}
                  onChange={(event) =>
                    field.handleChange(
                      nextStatuses.find(
                        (status) => status === event.currentTarget.value,
                      ) ?? "",
                    )
                  }
                  onBlur={field.handleBlur}
                  aria-invalid={Boolean(error)}
                  aria-describedby={`${id}-hint${error ? ` ${id}-status-error` : ""}`}
                >
                  <option value="">Choose a status</option>
                  {nextStatuses.map((status) => (
                    <option key={status} value={status}>
                      {GROWTH_WORK_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
                {error ? (
                  <p
                    id={`${id}-status-error`}
                    role="alert"
                    className="mt-1 text-sm"
                  >
                    {error}
                  </p>
                ) : null}
              </div>
            );
          }}
        </form.Field>
        <form.Field name="note">
          {(field) => {
            const error = getFieldError(field.state.meta.errors);
            return (
              <div>
                <label htmlFor={`${id}-note`} className="font-medium">
                  Note (optional)
                </label>
                <p
                  id={`${id}-note-hint`}
                  className="mt-1 text-xs text-base-content/70"
                >
                  Explain what was done, a blocker, or why work was cancelled.
                  This note stays in the history. Do not include credentials.
                </p>
                <textarea
                  id={`${id}-note`}
                  className="textarea textarea-bordered mt-1 w-full"
                  rows={3}
                  maxLength={5000}
                  value={field.state.value}
                  onChange={(event) =>
                    field.handleChange(event.currentTarget.value)
                  }
                  onBlur={field.handleBlur}
                  aria-invalid={Boolean(error)}
                  aria-describedby={`${id}-note-hint${error ? ` ${id}-note-error` : ""}`}
                />
                {error ? (
                  <p
                    id={`${id}-note-error`}
                    role="alert"
                    className="mt-1 text-sm"
                  >
                    {error}
                  </p>
                ) : null}
              </div>
            );
          }}
        </form.Field>
        <button type="submit" className="btn btn-primary">
          {pending ? "Saving status…" : "Save status"}
        </button>
      </fieldset>
    </form>
  );
}
