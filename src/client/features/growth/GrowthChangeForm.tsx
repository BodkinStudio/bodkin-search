import { useId } from "react";
import { useForm } from "@tanstack/react-form";
import { getFieldError } from "@/client/lib/forms";
import type { getGrowthChangeLog } from "@/serverFunctions/growthChangeLog";
import { GROWTH_CHANGE_EVENT_TYPES } from "@/types/schemas/growth-change-events";
import {
  recordGrowthPageChangeSchema,
  type RecordGrowthPageChangeInput,
} from "@/types/schemas/growth-change-log";
import { GROWTH_CHANGE_LABELS } from "./GrowthChangePresentation";

export type GrowthChangeDraft = Omit<
  RecordGrowthPageChangeInput,
  "projectId" | "requestKey"
>;

const draftSchema = recordGrowthPageChangeSchema.omit({
  projectId: true,
  requestKey: true,
});

export function GrowthChangeForm({
  keyPages,
  disabled,
  pending,
  onSubmit,
}: {
  keyPages: Awaited<ReturnType<typeof getGrowthChangeLog>>["keyPages"];
  disabled: boolean;
  pending: boolean;
  onSubmit: (draft: GrowthChangeDraft) => void;
}) {
  const id = useId();
  const today = new Date().toISOString().slice(0, 10);
  const defaultValues: GrowthChangeDraft = {
    keyPageId: "",
    changeType: "content_updated",
    happenedOn: today,
    description: "",
  };
  const form = useForm({
    defaultValues,
    validators: { onSubmit: draftSchema },
    onSubmit: ({ value }) => {
      if (!disabled) onSubmit(value);
    },
  });

  return (
    <form
      noValidate
      aria-label="Record a page change"
      className="mt-4 max-w-2xl"
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled) void form.handleSubmit();
      }}
    >
      <p className="mb-4 text-sm text-base-content/70">
        All fields are required. Saved entries cannot be edited; add a new entry
        if you need to make a correction.
      </p>
      <fieldset disabled={disabled} className="min-w-0 space-y-4">
        <form.Field name="keyPageId">
          {(field) => {
            const error = getFieldError(field.state.meta.errors);
            return (
              <div>
                <label htmlFor={`${id}-page`} className="text-sm font-medium">
                  Priority page
                </label>
                <select
                  id={`${id}-page`}
                  required
                  className="select select-bordered mt-1 w-full"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? `${id}-page-error` : undefined}
                >
                  <option value="">Choose a priority page</option>
                  {keyPages.map((page) => (
                    <option
                      key={page.id}
                      value={page.id}
                      disabled={!page.displayUrl}
                    >
                      {page.displayUrl ??
                        "Page URL withheld — review project context"}
                    </option>
                  ))}
                </select>
                <FieldError id={`${id}-page-error`} message={error} />
              </div>
            );
          }}
        </form.Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <form.Field name="changeType">
            {(field) => (
              <div>
                <label htmlFor={`${id}-type`} className="text-sm font-medium">
                  Change type
                </label>
                <select
                  id={`${id}-type`}
                  required
                  className="select select-bordered mt-1 w-full"
                  value={field.state.value}
                  onChange={(event) => {
                    const type = GROWTH_CHANGE_EVENT_TYPES.find(
                      (item) => item === event.target.value,
                    );
                    if (type) field.handleChange(type);
                  }}
                >
                  {GROWTH_CHANGE_EVENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {GROWTH_CHANGE_LABELS[type]}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </form.Field>
          <form.Field name="happenedOn">
            {(field) => {
              const error = getFieldError(field.state.meta.errors);
              return (
                <div>
                  <label htmlFor={`${id}-date`} className="text-sm font-medium">
                    Date changed (UTC)
                  </label>
                  <input
                    id={`${id}-date`}
                    type="date"
                    required
                    max={today}
                    className="input input-bordered mt-1 w-full"
                    value={field.state.value}
                    onInput={(event) =>
                      field.handleChange(event.currentTarget.value)
                    }
                    onBlur={field.handleBlur}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? `${id}-date-error` : undefined}
                  />
                  <FieldError id={`${id}-date-error`} message={error} />
                </div>
              );
            }}
          </form.Field>
        </div>
        <form.Field name="description">
          {(field) => {
            const error = getFieldError(field.state.meta.errors);
            return (
              <div>
                <label
                  htmlFor={`${id}-description`}
                  className="text-sm font-medium"
                >
                  What changed
                </label>
                <textarea
                  id={`${id}-description`}
                  required
                  rows={4}
                  maxLength={5000}
                  className="textarea textarea-bordered mt-1 w-full"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  aria-invalid={Boolean(error)}
                  aria-describedby={`${id}-description-hint${error ? ` ${id}-description-error` : ""}`}
                />
                <p
                  id={`${id}-description-hint`}
                  className="mt-1 text-xs text-base-content/70"
                >
                  Describe the work, not its assumed impact. Up to 5,000
                  characters.
                </p>
                <FieldError id={`${id}-description-error`} message={error} />
              </div>
            );
          }}
        </form.Field>
        <button type="submit" className="btn btn-primary" disabled={disabled}>
          {pending ? "Saving change…" : "Save change"}
        </button>
      </fieldset>
    </form>
  );
}

function FieldError({ id, message }: { id: string; message: string | null }) {
  return message ? (
    <p
      id={id}
      role="alert"
      className="mt-1 text-sm text-[color:color-mix(in_oklch,var(--color-error),var(--color-base-content)_35%)]"
    >
      {message}
    </p>
  ) : null;
}
