import { useId } from "react";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { getFieldError } from "@/client/lib/forms";
import type { GrowthWorkChangesOverview } from "@/types/schemas/growth-work";
import { GrowthChangeHistory } from "./GrowthChangeHistory";
import { GROWTH_CHANGE_LABELS } from "./GrowthChangePresentation";
import { formatGrowthPreviewDate } from "./GrowthPreviewPresentation";

export function GrowthWorkChangeForm({
  changes,
  selectedId,
  limit,
  disabled,
  pending,
  onSubmit,
}: {
  changes: GrowthWorkChangesOverview["availableChanges"];
  selectedId?: string;
  limit: number;
  disabled: boolean;
  pending: boolean;
  onSubmit: (changeEventId: string) => void;
}) {
  const id = useId();
  const schema = z.object({
    changeEventId: z
      .string()
      .refine(
        (value) => changes.some((change) => change.id === value),
        "Choose a saved change",
      ),
  });
  const form = useForm({
    defaultValues: { changeEventId: selectedId ?? "" },
    validators: { onSubmit: schema },
    onSubmit: ({ value }) => {
      if (!disabled) onSubmit(schema.parse(value).changeEventId);
    },
  });
  return (
    <form
      noValidate
      aria-label="Link a saved page change"
      className="max-w-2xl"
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled) void form.handleSubmit();
      }}
    >
      <p id={`${id}-hint`} className="text-base-content/70">
        Choose from the latest {limit} manual entries. Links cannot be removed
        here. Review the saved record before linking it.
      </p>
      <fieldset disabled={disabled} className="mt-3 min-w-0 space-y-3">
        <form.Field name="changeEventId">
          {(field) => {
            const error = getFieldError(field.state.meta.errors);
            const selected = changes.find(
              (change) => change.id === field.state.value,
            );
            return (
              <div>
                <label htmlFor={`${id}-change`} className="font-medium">
                  Saved change
                </label>
                <select
                  id={`${id}-change`}
                  required
                  className="select select-bordered mt-1 w-full"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) =>
                    field.handleChange(event.currentTarget.value)
                  }
                  aria-invalid={Boolean(error)}
                  aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
                >
                  <option value="">Choose a saved change</option>
                  {changes.map((change) => (
                    <option key={change.id} value={change.id}>
                      {formatGrowthPreviewDate(change.happenedAt)} —{" "}
                      {GROWTH_CHANGE_LABELS[change.changeType]} —{" "}
                      {change.description.replace(/\s+/g, " ").slice(0, 100)}
                    </option>
                  ))}
                </select>
                {error ? (
                  <p id={`${id}-error`} role="alert" className="mt-1">
                    {error}
                  </p>
                ) : null}
                {selected ? (
                  <GrowthChangeHistory
                    changes={[selected]}
                    limit={1}
                    headingLevel={4}
                    title="Selected change"
                    caption="Check the page, date and note before linking this record."
                  />
                ) : null}
              </div>
            );
          }}
        </form.Field>
        <button type="submit" className="btn btn-primary">
          {pending ? "Linking change…" : "Link saved change"}
        </button>
      </fieldset>
    </form>
  );
}
