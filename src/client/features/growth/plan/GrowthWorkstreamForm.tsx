import { useId } from "react";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { getFieldError } from "@/client/lib/forms";
import {
  GROWTH_WORKSTREAM_STATUSES,
  createGrowthWorkstreamInputSchema,
  type GrowthWorkstreamDto,
} from "@/types/schemas/growth-plan";

// One schema for both create and edit. Status is edit-only: a new workstream is
// always created active, so the create draft must not carry one.
const draftSchema = createGrowthWorkstreamInputSchema
  .omit({ projectId: true, requestKey: true })
  .extend({ status: z.enum(GROWTH_WORKSTREAM_STATUSES).optional() });

export type GrowthWorkstreamDraft = z.infer<typeof draftSchema>;

const STATUS_LABELS: Record<
  (typeof GROWTH_WORKSTREAM_STATUSES)[number],
  string
> = {
  active: "Active",
  done: "Done",
  dropped: "Dropped",
};

export function GrowthWorkstreamForm({
  workstream,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  workstream?: GrowthWorkstreamDto;
  pending: boolean;
  error: string | null;
  onSubmit: (draft: GrowthWorkstreamDraft) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const form = useForm({
    defaultValues: {
      title: workstream?.title ?? "",
      commercialReason: workstream?.commercialReason ?? "",
      status: workstream?.status,
      targetLabel: workstream?.targetLabel ?? null,
      targetBaseline: workstream?.targetBaseline ?? null,
      targetValue: workstream?.targetValue ?? null,
      targetDueOn: workstream?.targetDueOn ?? null,
    } as GrowthWorkstreamDraft,
    validators: { onSubmit: draftSchema },
    onSubmit: ({ value }) => onSubmit(draftSchema.parse(value)),
  });

  return (
    <form
      noValidate
      aria-label={workstream ? "Edit workstream" : "Add workstream"}
      className="mt-4 space-y-3 rounded-lg border border-base-300 bg-base-200/40 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="title">
        {(field) => {
          const fieldError = getFieldError(field.state.meta.errors);
          return (
            <div>
              <label htmlFor={`${id}-title`} className="font-medium">
                Workstream
              </label>
              <input
                id={`${id}-title`}
                className="input input-bordered mt-1 w-full"
                maxLength={200}
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                aria-invalid={Boolean(fieldError)}
              />
              {fieldError ? (
                <p role="alert" className="mt-1 text-sm">
                  {fieldError}
                </p>
              ) : null}
            </div>
          );
        }}
      </form.Field>
      <form.Field name="commercialReason">
        {(field) => {
          const fieldError = getFieldError(field.state.meta.errors);
          return (
            <div>
              <label htmlFor={`${id}-reason`} className="font-medium">
                Why this matters commercially
              </label>
              <p className="mt-1 text-xs text-base-content/70">
                Plain language, no jargon. What does the business get if this
                works?
              </p>
              <textarea
                id={`${id}-reason`}
                rows={3}
                className="textarea textarea-bordered mt-1 w-full"
                maxLength={2000}
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                aria-invalid={Boolean(fieldError)}
              />
              {fieldError ? (
                <p role="alert" className="mt-1 text-sm">
                  {fieldError}
                </p>
              ) : null}
            </div>
          );
        }}
      </form.Field>
      <form.Field name="targetLabel">
        {(field) => {
          const fieldError = getFieldError(field.state.meta.errors);
          return (
            <div>
              <label htmlFor={`${id}-target`} className="font-medium">
                Target (optional)
              </label>
              <input
                id={`${id}-target`}
                className="input input-bordered mt-1 w-full"
                maxLength={300}
                placeholder="200 Google clicks per 28 days across the Teams pages"
                value={field.state.value ?? ""}
                onChange={(event) =>
                  field.handleChange(event.target.value || null)
                }
                onBlur={field.handleBlur}
                aria-invalid={Boolean(fieldError)}
              />
              {fieldError ? (
                <p role="alert" className="mt-1 text-sm">
                  {fieldError}
                </p>
              ) : null}
            </div>
          );
        }}
      </form.Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <form.Field name="targetBaseline">
          {(field) => (
            <div>
              <label htmlFor={`${id}-baseline`} className="font-medium">
                Baseline
              </label>
              <input
                id={`${id}-baseline`}
                type="number"
                className="input input-bordered mt-1 w-full"
                value={field.state.value ?? ""}
                onChange={(event) =>
                  field.handleChange(
                    event.target.value === ""
                      ? null
                      : Number(event.target.value),
                  )
                }
                onBlur={field.handleBlur}
              />
            </div>
          )}
        </form.Field>
        <form.Field name="targetValue">
          {(field) => (
            <div>
              <label htmlFor={`${id}-value`} className="font-medium">
                Target value
              </label>
              <input
                id={`${id}-value`}
                type="number"
                className="input input-bordered mt-1 w-full"
                value={field.state.value ?? ""}
                onChange={(event) =>
                  field.handleChange(
                    event.target.value === ""
                      ? null
                      : Number(event.target.value),
                  )
                }
                onBlur={field.handleBlur}
              />
            </div>
          )}
        </form.Field>
        <form.Field name="targetDueOn">
          {(field) => {
            const fieldError = getFieldError(field.state.meta.errors);
            return (
              <div>
                <label htmlFor={`${id}-due`} className="font-medium">
                  Judged on
                </label>
                <input
                  id={`${id}-due`}
                  type="date"
                  className="input input-bordered mt-1 w-full"
                  value={field.state.value ?? ""}
                  onChange={(event) =>
                    field.handleChange(event.target.value || null)
                  }
                  onBlur={field.handleBlur}
                  aria-invalid={Boolean(fieldError)}
                />
                {fieldError ? (
                  <p role="alert" className="mt-1 text-sm">
                    {fieldError}
                  </p>
                ) : null}
              </div>
            );
          }}
        </form.Field>
      </div>
      {workstream ? (
        <form.Field name="status">
          {(field) => (
            <div>
              <label htmlFor={`${id}-status`} className="font-medium">
                Status
              </label>
              <select
                id={`${id}-status`}
                className="select select-bordered mt-1 w-full sm:w-56"
                value={field.state.value ?? "active"}
                onChange={(event) =>
                  field.handleChange(
                    GROWTH_WORKSTREAM_STATUSES.find(
                      (status) => status === event.target.value,
                    ) ?? "active",
                  )
                }
              >
                {GROWTH_WORKSTREAM_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </div>
          )}
        </form.Field>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          className="btn btn-primary btn-sm"
          disabled={pending}
        >
          {pending
            ? "Saving…"
            : workstream
              ? "Save workstream"
              : "Add workstream"}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={pending}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
