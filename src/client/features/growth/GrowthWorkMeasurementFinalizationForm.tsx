import { useId } from "react";
import { useForm } from "@tanstack/react-form";
import { getFieldError } from "@/client/lib/forms";
import { GROWTH_MEASUREMENT_OUTCOMES } from "@/types/schemas/growth-measurements";
import type {
  GrowthWorkMeasurementConfounderCandidate,
  GrowthWorkMeasurementPlan,
} from "@/types/schemas/growth-work";
import { GROWTH_CHANGE_LABELS } from "./GrowthChangePresentation";
import { formatGrowthPreviewDate } from "./GrowthPreviewPresentation";
import {
  createGrowthWorkMeasurementFinalizationFormSchema,
  parseGrowthWorkMeasurementFinalizationDraft,
  type GrowthWorkMeasurementFinalizationDraft,
  type GrowthWorkMeasurementFinalizationValues,
  type MeasurementOutcome,
} from "./GrowthWorkMeasurementFinalizationValidation";

export { parseGrowthWorkMeasurementFinalizationDraft } from "./GrowthWorkMeasurementFinalizationValidation";
export type {
  GrowthWorkMeasurementFinalizationDraft,
  GrowthWorkMeasurementFinalizationValues,
} from "./GrowthWorkMeasurementFinalizationValidation";

const OUTCOME_LABELS: Record<MeasurementOutcome, string> = {
  strong_positive: "Strong positive",
  positive: "Positive",
  inconclusive: "Inconclusive",
  neutral: "Neutral",
  negative: "Negative",
  strong_negative: "Strong negative",
  not_measurable: "Not measurable",
};

export function GrowthWorkMeasurementFinalizationForm({
  review,
  candidates,
  candidateSelectionAvailable,
  draft,
  disabled,
  pending,
  onSubmit,
}: {
  review: GrowthWorkMeasurementPlan["review"] & {
    state: "ready" | "not_measurable_only";
  };
  candidates: GrowthWorkMeasurementConfounderCandidate[];
  candidateSelectionAvailable: boolean;
  draft?: GrowthWorkMeasurementFinalizationDraft;
  disabled: boolean;
  pending: boolean;
  onSubmit: (draft: GrowthWorkMeasurementFinalizationDraft) => void;
}) {
  const id = useId();
  const schema = createGrowthWorkMeasurementFinalizationFormSchema({
    reviewState: review.state,
    candidates: candidateSelectionAvailable ? candidates : [],
  });
  const form = useForm({
    defaultValues: {
      outcome: draft?.outcome ?? "",
      confidencePercent:
        draft === undefined ? "" : String(Math.round(draft.confidence * 100)),
      summary: draft?.summary ?? "",
      confoundingChangeEventIds: draft?.confoundingChangeEventIds ?? [],
    } satisfies GrowthWorkMeasurementFinalizationValues,
    validators: { onSubmit: schema },
    onSubmit: ({ value }) => {
      if (disabled) return;
      onSubmit(
        parseGrowthWorkMeasurementFinalizationDraft({
          values: value,
          reviewState: review.state,
          candidates: candidateSelectionAvailable ? candidates : [],
        }),
      );
    },
  });
  const outcomes =
    review.state === "not_measurable_only"
      ? (["not_measurable"] as const)
      : GROWTH_MEASUREMENT_OUTCOMES;

  return (
    <form
      noValidate
      aria-label="Finalize measured result"
      className="mt-4 max-w-2xl"
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled) void form.handleSubmit();
      }}
    >
      {review.state === "not_measurable_only" ? (
        <p id={id + "-evidence"} role="alert" className="text-base-content/80">
          {review.missingPrimaryEvidenceCount} required primary evidence{" "}
          {review.missingPrimaryEvidenceCount === 1 ? "fact is" : "facts are"}{" "}
          missing. This review can only record Not measurable; it cannot infer a
          result from missing data.
        </p>
      ) : (
        <p id={id + "-evidence"} className="text-base-content/70">
          Required primary evidence is complete. Choose your interpretation; no
          outcome is calculated automatically.
        </p>
      )}
      <fieldset disabled={disabled} className="mt-4 min-w-0 space-y-4">
        <form.Field name="outcome">
          {(field) => {
            const error = getFieldError(field.state.meta.errors);
            return (
              <div>
                <label htmlFor={id + "-outcome"} className="font-medium">
                  Outcome
                </label>
                <select
                  id={id + "-outcome"}
                  required
                  className="select select-bordered mt-1 w-full"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) =>
                    field.handleChange(event.currentTarget.value)
                  }
                  aria-invalid={Boolean(error)}
                  aria-describedby={
                    id +
                    "-outcome-hint" +
                    (error ? " " + id + "-outcome-error" : "")
                  }
                >
                  <option value="">Choose an outcome</option>
                  {outcomes.map((outcome) => (
                    <option key={outcome} value={outcome}>
                      {OUTCOME_LABELS[outcome]}
                    </option>
                  ))}
                </select>
                <p
                  id={id + "-outcome-hint"}
                  className="mt-1 text-xs text-base-content/70"
                >
                  Neutral means you interpret the complete evidence as little
                  meaningful movement. Inconclusive means the evidence is
                  complete but mixed or unclear. Not measurable means required
                  evidence is missing. Strong and ordinary outcomes are human
                  judgements, not automatic thresholds.
                </p>
                {error ? (
                  <p id={id + "-outcome-error"} role="alert" className="mt-1">
                    {error}
                  </p>
                ) : null}
              </div>
            );
          }}
        </form.Field>
        <form.Field name="confidencePercent">
          {(field) => {
            const error = getFieldError(field.state.meta.errors);
            return (
              <div>
                <label htmlFor={id + "-confidence"} className="font-medium">
                  Confidence in this interpretation (%)
                </label>
                <input
                  id={id + "-confidence"}
                  required
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={100}
                  step={1}
                  className="input input-bordered mt-1 w-full"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) =>
                    field.handleChange(event.currentTarget.value)
                  }
                  aria-invalid={Boolean(error)}
                  aria-describedby={
                    id +
                    "-confidence-hint" +
                    (error ? " " + id + "-confidence-error" : "")
                  }
                />
                <p
                  id={id + "-confidence-hint"}
                  className="mt-1 text-xs text-base-content/70"
                >
                  Enter a whole number from 0 to 100. Confidence describes the
                  strength of your interpretation, not probability of causation,
                  statistical significance or data completeness.
                </p>
                {error ? (
                  <p
                    id={id + "-confidence-error"}
                    role="alert"
                    className="mt-1"
                  >
                    {error}
                  </p>
                ) : null}
              </div>
            );
          }}
        </form.Field>
        <form.Field name="summary">
          {(field) => {
            const error = getFieldError(field.state.meta.errors);
            return (
              <div>
                <label htmlFor={id + "-summary"} className="font-medium">
                  Interpretation summary
                </label>
                <p
                  id={id + "-summary-hint"}
                  className="mt-1 text-xs text-base-content/70"
                >
                  Explain what the observed comparison supports and its limits.
                  Do not include credentials.
                </p>
                <textarea
                  id={id + "-summary"}
                  required
                  rows={4}
                  maxLength={5000}
                  className="textarea textarea-bordered mt-1 w-full"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) =>
                    field.handleChange(event.currentTarget.value)
                  }
                  aria-invalid={Boolean(error)}
                  aria-describedby={
                    id +
                    "-summary-hint" +
                    (error ? " " + id + "-summary-error" : "")
                  }
                />
                {error ? (
                  <p id={id + "-summary-error"} role="alert" className="mt-1">
                    {error}
                  </p>
                ) : null}
              </div>
            );
          }}
        </form.Field>
        {candidateSelectionAvailable && candidates.length > 0 ? (
          <form.Field name="confoundingChangeEventIds">
            {(field) => {
              const error = getFieldError(field.state.meta.errors);
              return (
                <fieldset
                  aria-describedby={
                    id +
                    "-confounders-hint" +
                    (error ? " " + id + "-confounders-error" : "")
                  }
                >
                  <legend className="font-medium">
                    Confounding changes to include
                  </legend>
                  <p
                    id={id + "-confounders-hint"}
                    className="mt-1 text-xs text-base-content/70"
                  >
                    Select only changes that should be recorded as context for
                    this interpretation. None are selected automatically.
                  </p>
                  <div className="mt-3 space-y-3">
                    {candidates.map((candidate) => {
                      const checkboxId = id + "-confounder-" + candidate.id;
                      const checked = field.state.value.includes(candidate.id);
                      return (
                        <div key={candidate.id} className="flex gap-3">
                          <input
                            id={checkboxId}
                            type="checkbox"
                            className="checkbox checkbox-sm mt-0.5"
                            checked={checked}
                            onBlur={field.handleBlur}
                            onChange={(event) =>
                              field.handleChange(
                                event.currentTarget.checked
                                  ? [...field.state.value, candidate.id]
                                  : field.state.value.filter(
                                      (value) => value !== candidate.id,
                                    ),
                              )
                            }
                          />
                          <label htmlFor={checkboxId} className="min-w-0">
                            <span className="block font-medium">
                              {GROWTH_CHANGE_LABELS[candidate.changeType]} —{" "}
                              <span className="tabular-nums">
                                {formatGrowthPreviewDate(candidate.happenedAt)}
                              </span>
                            </span>
                            <span className="mt-1 block whitespace-pre-wrap break-words text-sm text-base-content/70 [overflow-wrap:anywhere]">
                              {candidate.description}
                            </span>
                          </label>
                        </div>
                      );
                    })}
                  </div>
                  {error ? (
                    <p
                      id={id + "-confounders-error"}
                      role="alert"
                      className="mt-1"
                    >
                      {error}
                    </p>
                  ) : null}
                </fieldset>
              );
            }}
          </form.Field>
        ) : null}
        <p className="text-sm font-medium">
          Finalizing creates an immutable observational result and marks this
          Work Evaluated. It does not prove that the recorded change caused the
          outcome.
        </p>
        <button type="submit" className="btn btn-primary">
          {pending ? "Finalizing measured result…" : "Finalize measured result"}
        </button>
      </fieldset>
    </form>
  );
}
