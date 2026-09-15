import { useId } from "react";
import { useForm } from "@tanstack/react-form";
import { getFieldError } from "@/client/lib/forms";
import { approveGrowthInvestigationSchema } from "@/types/schemas/growth-investigations";

const dueDateSchema = approveGrowthInvestigationSchema.pick({ dueOn: true });

export function GrowthInvestigationForm({
  disabled,
  pending,
  onSubmit,
}: {
  disabled: boolean;
  pending: boolean;
  onSubmit: (dueOn: string) => void;
}) {
  const id = useId();
  const form = useForm({
    defaultValues: { dueOn: "" },
    validators: { onSubmit: dueDateSchema },
    onSubmit: ({ value }) => {
      if (!disabled) onSubmit(value.dueOn);
    },
  });

  return (
    <form
      noValidate
      aria-label="Approve an investigation"
      className="mt-4 max-w-md"
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled) void form.handleSubmit();
      }}
    >
      <p id={`${id}-hint`} className="text-sm text-base-content/70">
        Set a due date for this investigation. Approval records planned work; it
        does not change the website.
      </p>
      <fieldset disabled={disabled} className="mt-3 min-w-0">
        <form.Field name="dueOn">
          {(field) => {
            const error = getFieldError(field.state.meta.errors);
            return (
              <div>
                <label htmlFor={`${id}-date`} className="text-sm font-medium">
                  Due date (UTC)
                </label>
                <input
                  id={`${id}-date`}
                  type="date"
                  required
                  className="input input-bordered mt-1 w-full"
                  value={field.state.value}
                  onInput={(event) =>
                    field.handleChange(event.currentTarget.value)
                  }
                  onBlur={field.handleBlur}
                  aria-invalid={Boolean(error)}
                  aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
                />
                {error ? (
                  <p
                    id={`${id}-error`}
                    role="alert"
                    className="mt-1 text-sm text-[color:color-mix(in_oklch,var(--color-error),var(--color-base-content)_35%)]"
                  >
                    {error}
                  </p>
                ) : null}
              </div>
            );
          }}
        </form.Field>
        <button type="submit" className="btn btn-primary mt-3">
          {pending ? "Saving approved work…" : "Approve investigation"}
        </button>
      </fieldset>
    </form>
  );
}
