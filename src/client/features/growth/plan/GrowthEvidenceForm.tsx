import { useId } from "react";
import { useForm } from "@tanstack/react-form";
import type { z } from "zod";
import { getFieldError } from "@/client/lib/forms";
import {
  GROWTH_EVIDENCE_KINDS,
  GROWTH_EVIDENCE_KIND_DESCRIPTIONS,
  GROWTH_EVIDENCE_KIND_LABELS,
  growthActionEvidenceInputSchema,
} from "@/types/schemas/growth-plan";
import { GrowthEvidenceSeriesFields } from "./GrowthEvidenceSeriesFields";

export type GrowthEvidenceDraft = z.infer<
  typeof growthActionEvidenceInputSchema
>;

export function GrowthEvidenceForm({
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  pending: boolean;
  error: string | null;
  onSubmit: (draft: GrowthEvidenceDraft) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const form = useForm({
    defaultValues: {
      kind: "measured",
      statement: "",
      sourceLabel: "",
      sourceUrl: null,
      observedOn: null,
      series: null,
    } as GrowthEvidenceDraft,
    validators: { onSubmit: growthActionEvidenceInputSchema },
    onSubmit: ({ value }) =>
      onSubmit(growthActionEvidenceInputSchema.parse(value)),
  });

  return (
    <form
      noValidate
      aria-label="Add evidence"
      className="mt-3 space-y-3 rounded-lg border border-base-300 bg-base-200/40 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="kind">
        {(field) => (
          <div>
            <label htmlFor={`${id}-kind`} className="font-medium">
              Kind of evidence
            </label>
            <select
              id={`${id}-kind`}
              className="select select-bordered mt-1 w-full"
              value={field.state.value}
              onChange={(event) =>
                field.handleChange(
                  GROWTH_EVIDENCE_KINDS.find(
                    (kind) => kind === event.target.value,
                  ) ?? "measured",
                )
              }
              aria-describedby={`${id}-kind-hint`}
            >
              {GROWTH_EVIDENCE_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {GROWTH_EVIDENCE_KIND_LABELS[kind]}
                </option>
              ))}
            </select>
            <p
              id={`${id}-kind-hint`}
              className="mt-1 text-xs text-base-content/70"
            >
              {GROWTH_EVIDENCE_KIND_DESCRIPTIONS[field.state.value]}
            </p>
          </div>
        )}
      </form.Field>
      <form.Field name="statement">
        {(field) => {
          const fieldError = getFieldError(field.state.meta.errors);
          return (
            <div>
              <label htmlFor={`${id}-statement`} className="font-medium">
                What the evidence says
              </label>
              <textarea
                id={`${id}-statement`}
                rows={3}
                className="textarea textarea-bordered mt-1 w-full"
                maxLength={1000}
                placeholder="Include the numbers and the dates."
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
      <form.Field name="sourceLabel">
        {(field) => {
          const fieldError = getFieldError(field.state.meta.errors);
          return (
            <div>
              <label htmlFor={`${id}-source`} className="font-medium">
                Source
              </label>
              <input
                id={`${id}-source`}
                className="input input-bordered mt-1 w-full"
                maxLength={200}
                placeholder="Search Console, 14 Aug – 10 Sep 2026"
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
      <div className="grid gap-3 sm:grid-cols-2">
        <form.Field name="sourceUrl">
          {(field) => {
            const fieldError = getFieldError(field.state.meta.errors);
            return (
              <div>
                <label htmlFor={`${id}-url`} className="font-medium">
                  Source link (optional)
                </label>
                <input
                  id={`${id}-url`}
                  type="url"
                  className="input input-bordered mt-1 w-full"
                  maxLength={2000}
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
        <form.Field name="observedOn">
          {(field) => {
            const fieldError = getFieldError(field.state.meta.errors);
            return (
              <div>
                <label htmlFor={`${id}-observed`} className="font-medium">
                  Observed on (optional)
                </label>
                <input
                  id={`${id}-observed`}
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
      <form.Field name="series">
        {(field) => (
          <GrowthEvidenceSeriesFields
            id={id}
            value={field.state.value ?? null}
            onChange={(series) => field.handleChange(series)}
          />
        )}
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
          {pending ? "Saving…" : "Add evidence"}
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
