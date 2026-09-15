import { useId } from "react";
import { useForm } from "@tanstack/react-form";
import type { z } from "zod";
import { getFieldError } from "@/client/lib/forms";
import { updateGrowthPlanNarrativeInputSchema } from "@/types/schemas/growth-plan";

const draftSchema = updateGrowthPlanNarrativeInputSchema.omit({
  projectId: true,
});

export type GrowthPlanNarrativeDraft = z.infer<typeof draftSchema>;

export function GrowthPlanNarrativeForm({
  thesis,
  lede,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  thesis: string | null;
  lede: string | null;
  pending: boolean;
  error: string | null;
  onSubmit: (draft: GrowthPlanNarrativeDraft) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const form = useForm({
    defaultValues: { thesis, lede } as GrowthPlanNarrativeDraft,
    validators: { onSubmit: draftSchema },
    onSubmit: ({ value }) => onSubmit(draftSchema.parse(value)),
  });

  return (
    <form
      noValidate
      aria-label="Edit the plan narrative"
      className="mt-4 space-y-3 rounded-lg border border-base-300 bg-base-200/40 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="thesis">
        {(field) => {
          const fieldError = getFieldError(field.state.meta.errors);
          return (
            <div>
              <label htmlFor={`${id}-thesis`} className="font-medium">
                The one thing this plan is about
              </label>
              <input
                id={`${id}-thesis`}
                className="input input-bordered mt-1 w-full"
                maxLength={300}
                placeholder="The Teams product page lost two thirds of its search visibility in a year."
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
      <form.Field name="lede">
        {(field) => {
          const fieldError = getFieldError(field.state.meta.errors);
          return (
            <div>
              <label htmlFor={`${id}-lede`} className="font-medium">
                The paragraph under it
              </label>
              <p className="mt-1 text-xs text-base-content/70">
                The numbers behind the headline, and what the plan will do about
                them.
              </p>
              <textarea
                id={`${id}-lede`}
                rows={5}
                className="textarea textarea-bordered mt-1 w-full"
                maxLength={1200}
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
          {pending ? "Saving…" : "Save"}
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
