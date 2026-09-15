import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  generateGrowthAssessment,
  getGrowthAssessment,
} from "@/serverFunctions/growthAssessments";
import { getProjectContext } from "@/serverFunctions/projectContext";
import { invalidGrowthAssessmentCompletionTargetReason } from "@/shared/growth-assessment-quality";
import { GrowthAssessmentExecution } from "./GrowthAssessmentExecution";
import { GrowthAssessmentSummary } from "./GrowthAssessmentSummary";
import { GrowthAssessmentConfirmation } from "./GrowthAssessmentConfirmation";

export function GrowthAssessmentPanel({ projectId }: { projectId: string }) {
  const client = useQueryClient();
  const [businessContext, setBusinessContext] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [startAssessmentId, setStartAssessmentId] = useState<string | null>(
    null,
  );
  const [investigating, setInvestigating] = useState(false);
  const query = useQuery({
    queryKey: ["growthAssessment", projectId],
    queryFn: () => getGrowthAssessment({ data: { projectId } }),
    refetchOnWindowFocus: false,
  });
  const context = useQuery({
    queryKey: ["projectContext", projectId],
    queryFn: () => getProjectContext({ data: { projectId } }),
  });
  const generate = useMutation({
    mutationFn: (feedback?: string) =>
      generateGrowthAssessment({
        data: {
          projectId,
          expectedVersion: query.data?.version ?? null,
          businessContext: feedback ?? businessContext,
        },
      }),
    onSuccess: (data) => {
      client.setQueryData(["growthAssessment", projectId], data);
      setConfirming(false);
    },
  });
  const selected = query.data?.options.find(
    (option) => option.id === query.data?.selectedOptionId,
  );
  const invalidCompletionTarget = invalidGrowthAssessmentCompletionTargetReason(
    selected?.kind,
    query.data?.successMeasure ?? "",
  );
  return (
    <section
      id="growth-assessment"
      className="rounded-xl border border-base-300 bg-base-100 p-5 md:p-8"
    >
      {query.isPending ? (
        <p role="status">Loading your priorities…</p>
      ) : query.isError ? (
        <div role="alert">
          <p>Your saved priority could not be loaded.</p>
          <button
            className="btn btn-sm mt-3"
            onClick={() => void query.refetch()}
          >
            Try again
          </button>
        </div>
      ) : (
        <>
          {query.data ? (
            invalidCompletionTarget ? (
              <InvalidSavedDraft
                assessment={query.data}
                reason={invalidCompletionTarget}
              />
            ) : query.data.status === "ready" ? (
              <div className="max-w-3xl">
                <p className="text-sm font-medium text-base-content/65">
                  Agreed subject
                </p>
                <h2 className="mt-2 text-lg font-semibold text-balance">
                  {selected?.title}
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-base-content/75">
                  <span className="font-medium">Business goal: </span>
                  {query.data.objective}
                </p>
              </div>
            ) : (
              <GrowthAssessmentSummary
                assessment={query.data}
                projectId={projectId}
                keyPages={context.data?.keyPages ?? []}
                onEdit={() => setConfirming(true)}
              />
            )
          ) : (
            <div className="max-w-2xl">
              <p className="text-sm font-medium text-base-content/60">
                Your next move
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-balance">
                Decide what to check next.
              </h2>
              <p className="mt-3 text-base-content/75 text-pretty">
                Growth will suggest a concrete next step from your saved
                evidence, explain its purpose and show what supports it.
              </p>
              <p className="mt-3 text-sm text-base-content/65">
                If the evidence is missing or inconclusive, the recommendation
                should be to investigate or improve measurement first.
              </p>
            </div>
          )}
          {query.data?.status === "ready" && !invalidCompletionTarget ? (
            <GrowthAssessmentExecution
              key={query.data.id}
              projectId={projectId}
              assessmentId={query.data.id}
              autoStart={startAssessmentId === query.data.id}
              onBusyChange={setInvestigating}
            />
          ) : null}
          {query.data?.status === "ready" && !invalidCompletionTarget ? (
            <details className="mt-6 max-w-3xl border-t border-base-300 pt-4">
              <summary className="cursor-pointer text-sm font-medium">
                Original recommendation and agreed context
              </summary>
              <div className="mt-4">
                <GrowthAssessmentSummary
                  assessment={query.data}
                  projectId={projectId}
                  keyPages={context.data?.keyPages ?? []}
                  onEdit={() => setConfirming(true)}
                />
              </div>
            </details>
          ) : null}
          {confirming && query.data && !invalidCompletionTarget ? (
            <GrowthAssessmentConfirmation
              key={query.data.version}
              assessment={query.data}
              projectId={projectId}
              onRevise={(feedback) => generate.mutate(feedback)}
              revising={generate.isPending}
              onClose={() => setConfirming(false)}
              onAccepted={setStartAssessmentId}
            />
          ) : null}
          <div className="mt-6 border-t border-base-300 pt-5">
            <details className="max-w-2xl">
              <summary className="cursor-pointer text-sm font-medium">
                {query.data
                  ? "Challenge this recommendation or add context"
                  : "Anything else Growth should know? (optional)"}
              </summary>
              <p className="mt-2 text-sm text-base-content/65">
                For example: your main business goal, a product you want to
                grow, or a constraint. Existing project context is included
                automatically.
              </p>
              <label className="sr-only" htmlFor="growth-business-context">
                Business context or feedback
              </label>
              <textarea
                id="growth-business-context"
                className="textarea mt-3 w-full"
                rows={3}
                maxLength={2000}
                value={businessContext}
                onChange={(event) => setBusinessContext(event.target.value)}
              />
            </details>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                className={`btn ${query.data ? "btn-outline btn-sm" : "btn-primary"}`}
                disabled={generate.isPending || confirming || investigating}
                onClick={() => generate.mutate(undefined)}
              >
                {generate.isPending
                  ? "Comparing saved evidence…"
                  : query.data
                    ? "Reconsider next step"
                    : "Suggest my next step"}
              </button>
              <span className="text-xs text-base-content/60">
                Uses your configured AI model. Provider usage charges may apply.
              </span>
            </div>
            {generate.isPending ? (
              <p role="status" className="mt-3 text-sm text-base-content/70">
                Reviewing the available evidence and alternatives. This can take
                up to three minutes. Your saved recommendation stays available
                while this runs.
              </p>
            ) : null}
            {generate.error ? (
              <p role="alert" className="mt-3 text-sm text-error">
                Could not save a new suggestion.{" "}
                {generationErrorMessage(generate.error.message)} Your saved
                suggestion has not been replaced. You can try again.
              </p>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}

function InvalidSavedDraft({
  assessment,
  reason,
}: {
  assessment: NonNullable<Awaited<ReturnType<typeof getGrowthAssessment>>>;
  reason: string;
}) {
  const selected = assessment.options.find(
    (option) => option.id === assessment.selectedOptionId,
  );
  return (
    <div className="max-w-2xl">
      <p className="text-sm font-medium text-warning">
        This saved suggestion needs replacing
      </p>
      <p className="mt-2 text-sm text-base-content/75">{reason}</p>
      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-medium">
          Previous draft (not valid)
        </summary>
        <p className="mt-2 text-sm text-base-content/75">
          {selected?.title || "No next step identified"}
        </p>
        <p className="mt-2 text-sm text-base-content/65">
          {assessment.successMeasure}
        </p>
      </details>
    </div>
  );
}

function generationErrorMessage(code: string) {
  if (code === "CONFLICT")
    return "A newer assessment exists. Reload before reassessing.";
  if (code === "VALIDATION_ERROR")
    return "The suggestion did not pass its evidence checks.";
  if (code === "INSUFFICIENT_CREDITS" || code === "PAYMENT_REQUIRED")
    return "Check your AI usage credits before trying again.";
  if (code.startsWith("AUTH_CONFIG_MISSING"))
    return "Configure your OpenRouter key in settings before trying again.";
  return "The AI request did not complete successfully. Please try again; if it persists, check your model and provider settings.";
}
