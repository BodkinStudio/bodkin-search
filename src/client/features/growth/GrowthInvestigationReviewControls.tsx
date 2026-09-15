import { useId, useState, type FormEvent } from "react";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { GROWTH_DISMISSAL_REASONS } from "@/types/schemas/growth";

export type GrowthDismissalReason = (typeof GROWTH_DISMISSAL_REASONS)[number];

const DISMISSAL_LABELS: Record<GrowthDismissalReason, string> = {
  irrelevant: "Irrelevant",
  already_planned: "Already planned",
  not_commercially_important: "Not commercially important",
  insufficient_evidence: "Insufficient evidence",
  wrong_diagnosis: "Wrong diagnosis",
  too_much_effort: "Too much effort",
  duplicate: "Duplicate",
  defer: "Defer for now",
};

export function growthDismissalReasonLabel(reason: GrowthDismissalReason) {
  return DISMISSAL_LABELS[reason];
}

export function nextUtcCalendarDate(now = new Date()) {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  )
    .toISOString()
    .slice(0, 10);
}

export function GrowthInvestigationReviewControls({
  disabled,
  pending,
  onDismiss,
  onSnooze,
}: {
  disabled: boolean;
  pending: boolean;
  onDismiss: (dismissalReason: GrowthDismissalReason) => void;
  onSnooze: (snoozeUntil: string) => void;
}) {
  const id = useId();
  const [dismissalReason, setDismissalReason] = useState<
    GrowthDismissalReason | ""
  >("");
  const [snoozeUntil, setSnoozeUntil] = useState("");
  const minimum = nextUtcCalendarDate();
  const submitDismissal = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!disabled && dismissalReason) onDismiss(dismissalReason);
  };
  const submitSnooze = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!disabled && snoozeUntil) onSnooze(snoozeUntil);
  };

  return (
    <div className="mt-4 grid max-w-2xl gap-4 sm:grid-cols-2">
      <form aria-label="Dismiss this suggestion" onSubmit={submitDismissal}>
        <fieldset disabled={disabled} className="min-w-0">
          <label htmlFor={`${id}-dismissal`} className="text-sm font-medium">
            Dismissal reason
          </label>
          <select
            id={`${id}-dismissal`}
            required
            className="select select-bordered mt-1 w-full"
            value={dismissalReason}
            onChange={(event) =>
              setDismissalReason(
                GROWTH_DISMISSAL_REASONS.find(
                  (reason) => reason === event.currentTarget.value,
                ) ?? "",
              )
            }
          >
            <option value="">Choose a reason</option>
            {GROWTH_DISMISSAL_REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {growthDismissalReasonLabel(reason)}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-outline mt-3">
            {pending ? "Saving review…" : "Dismiss suggestion"}
          </button>
        </fieldset>
      </form>

      <form aria-label="Snooze this suggestion" onSubmit={submitSnooze}>
        <fieldset disabled={disabled} className="min-w-0">
          <label htmlFor={`${id}-snooze`} className="text-sm font-medium">
            Snooze until (UTC)
          </label>
          <p
            id={`${id}-snooze-hint`}
            className="mt-1 text-xs text-base-content/70"
          >
            Choose a future UTC calendar date. It will stay snoozed until you
            explicitly review it again.
          </p>
          <input
            id={`${id}-snooze`}
            type="date"
            required
            min={minimum}
            className="input input-bordered mt-1 w-full"
            value={snoozeUntil}
            onInput={(event) => setSnoozeUntil(event.currentTarget.value)}
            aria-describedby={`${id}-snooze-hint`}
          />
          <button type="submit" className="btn btn-outline mt-3">
            {pending ? "Saving review…" : "Snooze suggestion"}
          </button>
        </fieldset>
      </form>
    </div>
  );
}

export function GrowthInvestigationMutationFailure({
  kind,
  error,
  pending,
  onRetry,
  onRefresh,
}: {
  kind: "approval" | "review";
  error: unknown;
  pending: boolean;
  onRetry: () => void;
  onRefresh: () => void;
}) {
  const approval = kind === "approval";
  return (
    <div role="alert" className="space-y-2">
      <p className="text-[color:color-mix(in_oklch,var(--color-error),var(--color-base-content)_35%)]">
        {getStandardErrorMessage(
          error,
          approval
            ? "The approval could not be confirmed."
            : "The review could not be confirmed.",
        )}
      </p>
      <p>
        Retry {approval ? "with the same due date" : "the exact same review"},
        or refresh to check what was saved. Reloading will not submit anything
        automatically.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-sm"
          disabled={pending}
          onClick={onRetry}
        >
          Retry {kind}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={pending}
          onClick={onRefresh}
        >
          Refresh saved investigation
        </button>
      </div>
    </div>
  );
}

export function GrowthInvestigationValidationFailure({
  error,
}: {
  error: unknown;
}) {
  return (
    <div role="alert" className="space-y-2">
      <p className="text-[color:color-mix(in_oklch,var(--color-error),var(--color-base-content)_35%)]">
        {getStandardErrorMessage(error, "The review could not be saved.")}
      </p>
      <p>
        Choose a new future UTC date, then submit the review again. Nothing was
        saved by the rejected request.
      </p>
    </div>
  );
}
