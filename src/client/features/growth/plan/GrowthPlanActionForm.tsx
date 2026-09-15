import { useId, useState } from "react";
import { useForm } from "@tanstack/react-form";
import type { z } from "zod";
import { getFieldError } from "@/client/lib/forms";
import {
  createGrowthPlanActionInputSchema,
  growthPlanActionTargetInputSchema,
  type GrowthPlanActionDto,
  type GrowthPlanActionTargetInput,
  type GrowthWorkstreamDto,
} from "@/types/schemas/growth-plan";

// Create and edit submit the same fields; the parent decides which server
// function to call and which of them to send.
// targets loses its default: the form always holds an array, so an optional
// input type would fight the form's value type.
const draftSchema = createGrowthPlanActionInputSchema
  .omit({
    projectId: true,
    requestKey: true,
    category: true,
    priorityScore: true,
    evidence: true,
    targets: true,
  })
  .extend({
    targets: createGrowthPlanActionInputSchema.shape.targets.unwrap(),
  });

export type GrowthPlanActionDraft = z.infer<typeof draftSchema>;

// One target per line. A line that looks like an address is the page it is
// about; anything else is the search someone types, stored lowercase because
// that is how the keyword tables hold it.
const LOOKS_LIKE_URL = /^(https?:\/\/|www\.|\S+\.\S+\/)/i;

function parseGrowthActionTargets(text: string): GrowthPlanActionTargetInput[] {
  const seen = new Set<string>();
  const targets: GrowthPlanActionTargetInput[] = [];
  for (const line of text.split("\n")) {
    const value = line.trim();
    if (value.length === 0) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push(
      LOOKS_LIKE_URL.test(value)
        ? { targetType: "url", targetValue: value }
        : { targetType: "keyword", targetValue: key },
    );
  }
  return targets;
}

// The http(s) rule belongs to the contract, so the message the server would
// give is shown while the author types instead of after they submit.
function growthActionTargetIssues(targets: GrowthPlanActionTargetInput[]) {
  return targets.flatMap((target) => {
    const result = growthPlanActionTargetInputSchema.safeParse(target);
    return result.success
      ? []
      : result.error.issues.map(
          (issue) => `${target.targetValue}: ${issue.message}`,
        );
  });
}

export function GrowthPlanActionForm({
  workstreamId,
  workstreams,
  action,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  workstreamId: string;
  workstreams: GrowthWorkstreamDto[];
  action?: GrowthPlanActionDto;
  pending: boolean;
  error: string | null;
  onSubmit: (draft: GrowthPlanActionDraft) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [targetsText, setTargetsText] = useState("");
  const form = useForm({
    defaultValues: {
      workstreamId,
      targets: [],
      title: action?.title ?? "",
      rationale: action?.rationale ?? "",
      successMeasure: action?.successMeasure ?? null,
      description: action?.description ?? null,
      dueOn: action?.dueOn ?? new Date().toISOString().slice(0, 10),
    } as GrowthPlanActionDraft,
    validators: { onSubmit: draftSchema },
    onSubmit: ({ value }) => onSubmit(draftSchema.parse(value)),
  });

  return (
    <form
      noValidate
      aria-label={action ? "Edit action" : "Add action"}
      className="mt-3 space-y-3 rounded-lg border border-base-300 bg-base-200/40 p-4"
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
                Action
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
      <form.Field name="rationale">
        {(field) => {
          const fieldError = getFieldError(field.state.meta.errors);
          return (
            <div>
              <label htmlFor={`${id}-rationale`} className="font-medium">
                Why we are doing this
              </label>
              <p className="mt-1 text-xs text-base-content/70">
                Written for a reader who knows nothing about SEO.
              </p>
              <textarea
                id={`${id}-rationale`}
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
      <form.Field name="successMeasure">
        {(field) => {
          const fieldError = getFieldError(field.state.meta.errors);
          return (
            <div>
              <label htmlFor={`${id}-measure`} className="font-medium">
                How we will know it worked (optional)
              </label>
              <input
                id={`${id}-measure`}
                className="input input-bordered mt-1 w-full"
                maxLength={300}
                placeholder="Clicks on the Teams page, 28-day windows"
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
      <form.Field name="dueOn">
        {(field) => {
          const fieldError = getFieldError(field.state.meta.errors);
          return (
            <div>
              <label htmlFor={`${id}-due`} className="font-medium">
                Due date
              </label>
              <input
                id={`${id}-due`}
                type="date"
                className="input input-bordered mt-1 w-full sm:w-56"
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
      <form.Field name="description">
        {(field) => {
          const fieldError = getFieldError(field.state.meta.errors);
          return (
            <div>
              <label htmlFor={`${id}-description`} className="font-medium">
                Detail for whoever does the work (optional)
              </label>
              <textarea
                id={`${id}-description`}
                rows={3}
                className="textarea textarea-bordered mt-1 w-full"
                maxLength={5000}
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
      {action ? (
        <div>
          <p className="font-medium">Targets</p>
          <p className="mt-1 text-xs text-base-content/70">
            Targets are set when the action is created.
          </p>
          {action.targets.length === 0 ? (
            <p className="mt-1 text-sm text-base-content/70">
              No targets on this action.
            </p>
          ) : (
            <ul className="mt-2 flex flex-wrap gap-1">
              {action.targets.map((target) => (
                <li
                  key={`${target.targetType}:${target.targetValue}`}
                  className="badge badge-ghost badge-sm font-mono"
                >
                  {target.targetValue}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <form.Field name="targets">
          {(field) => {
            const fieldError = getFieldError(field.state.meta.errors);
            return (
              <div>
                <label htmlFor={`${id}-targets`} className="font-medium">
                  Targets (optional)
                </label>
                <p className="mt-1 text-xs text-base-content/70">
                  One per line. A line starting with http is a page; anything
                  else is a search. These are what the plan charts.
                </p>
                <textarea
                  id={`${id}-targets`}
                  rows={3}
                  className="textarea textarea-bordered mt-1 w-full font-mono"
                  placeholder={"https://example.com/teams\nmicrosoft teams sms"}
                  value={targetsText}
                  onChange={(event) => {
                    setTargetsText(event.target.value);
                    field.handleChange(
                      parseGrowthActionTargets(event.target.value),
                    );
                  }}
                  onBlur={field.handleBlur}
                  aria-invalid={Boolean(fieldError)}
                />
                {growthActionTargetIssues(field.state.value).map((issue) => (
                  <p key={issue} role="alert" className="mt-1 text-sm">
                    {issue}
                  </p>
                ))}
                {field.state.value.length > 0 ? (
                  <ul className="mt-2 flex flex-wrap gap-1">
                    {field.state.value.map((target) => (
                      <li
                        key={`${target.targetType}:${target.targetValue}`}
                        className="badge badge-ghost badge-sm font-mono"
                      >
                        {target.targetType === "url" ? "Page" : "Search"}:{" "}
                        {target.targetValue}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {fieldError ? (
                  <p role="alert" className="mt-1 text-sm">
                    {fieldError}
                  </p>
                ) : null}
              </div>
            );
          }}
        </form.Field>
      )}
      {action ? (
        <form.Field name="workstreamId">
          {(field) => (
            <div>
              <label htmlFor={`${id}-workstream`} className="font-medium">
                Workstream
              </label>
              <select
                id={`${id}-workstream`}
                className="select select-bordered mt-1 w-full"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
              >
                {workstreams.map((workstream) => (
                  <option key={workstream.id} value={workstream.id}>
                    {workstream.position}. {workstream.title}
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
          {pending ? "Saving…" : action ? "Save action" : "Add action"}
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
