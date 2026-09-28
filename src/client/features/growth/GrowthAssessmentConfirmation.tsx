import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  confirmGrowthAssessment,
  type getGrowthAssessment,
} from "@/serverFunctions/growthAssessments";
import { saveGrowthAssessmentSchema } from "@/types/schemas/growth-assessments";
import { GrowthAssessmentField as Field } from "./GrowthAssessmentField";

export function GrowthAssessmentConfirmation({
  assessment,
  projectId,
  onClose,
  onRevise,
  revising,
  onAccepted,
}: {
  assessment: NonNullable<Awaited<ReturnType<typeof getGrowthAssessment>>>;
  projectId: string;
  onClose: () => void;
  onRevise: (feedback: string) => void;
  revising: boolean;
  onAccepted: (assessmentId: string) => void;
}) {
  const client = useQueryClient();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const [form, setForm] = useState({
    objective: assessment.objective,
    market: assessment.market,
    audience: assessment.audience,
    successMeasure: assessment.successMeasure,
  });
  const [error, setError] = useState("");
  const save = useMutation({
    mutationFn: confirmGrowthAssessment,
    onSuccess: (data) => {
      client.setQueryData(["growthAssessment", projectId], data);
      onAccepted(data.id);
      onClose();
    },
  });
  const changed = (
    ["objective", "market", "audience", "successMeasure"] as const
  ).some((key) => form[key] !== assessment[key]);
  function confirm() {
    if (changed) {
      onRevise(
        `Reassess against this corrected business context: ${JSON.stringify(form)}`,
      );
      return;
    }
    const options = assessment.options.map(
      ({
        id,
        kind,
        title,
        businessRelevance,
        evidenceSource,
        evidenceDate,
        evidenceScope,
        observation,
        uncertainty,
        nextValidation,
        disposition,
        keyPageId,
      }) => ({
        id,
        kind,
        title,
        businessRelevance,
        evidenceSource,
        evidenceDate,
        evidenceScope,
        observation,
        uncertainty,
        nextValidation,
        disposition,
        keyPageId,
      }),
    );
    const parsed = saveGrowthAssessmentSchema.safeParse({
      projectId,
      expectedVersion: assessment.version,
      status: "ready",
      ...form,
      objectiveConfirmed: true,
      comparisonRationale: assessment.comparisonRationale,
      options,
    });
    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message ??
          "This proposal is incomplete. Reassess before accepting it.",
      );
      return;
    }
    save.mutate({ data: { projectId, expectedVersion: assessment.version } });
  }
  return (
    <div className="mt-6 rounded-lg bg-base-200 p-5">
      <h3 ref={heading} tabIndex={-1} className="font-semibold">
        Review the proposed direction
      </h3>
      <p className="mt-1 text-sm text-base-content/70">
        Check that the goal and target customers are right before accepting.
        Accepting assesses this page against your goal and the search evidence,
        then recommends whether to change it. It does not approve or implement a
        website change. If you change the context, Growth will reassess before
        you accept.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {(
          [
            ["objective", "Business goal"],
            ["market", "Market"],
            ["audience", "Who we want to reach"],
            ["successMeasure", "What this step should establish"],
          ] as const
        ).map(([key, label]) => (
          <Field
            key={key}
            label={label}
            value={form[key]}
            onChange={(value) =>
              setForm((current) => ({ ...current, [key]: value }))
            }
            multiline
          />
        ))}
      </div>
      {error || save.error ? (
        <p role="alert" className="mt-3 text-sm text-error">
          {error || save.error?.message}
        </p>
      ) : null}
      <div className="mt-4 flex gap-3">
        <button
          className="btn btn-primary btn-sm"
          disabled={save.isPending || revising}
          onClick={confirm}
        >
          {revising
            ? "Reassessing…"
            : save.isPending
              ? "Saving…"
              : changed
                ? "Reassess with corrected context"
                : "Agree and investigate"}
        </button>
        <button
          className="btn btn-ghost btn-sm"
          disabled={save.isPending || revising}
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
