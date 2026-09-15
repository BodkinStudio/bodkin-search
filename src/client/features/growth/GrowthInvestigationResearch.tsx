import { useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { createSamSession } from "@/serverFunctions/sam";
import type { GrowthAssessmentInvestigationView } from "@/types/schemas/growth-assessment-investigations";
import { saveSamResearchDraft } from "@/client/features/sam/samResearchDraft";
import { invalidateSamSessions } from "@/client/features/sam/samQueries";
import { buildInvestigationResearchDraft } from "./growthInvestigationResearchDraft";

export function GrowthInvestigationResearch({
  investigation,
}: {
  investigation: GrowthAssessmentInvestigationView;
}) {
  const navigate = useNavigate();
  const sessionId = useRef<string | null>(null);
  const opening = useRef(false);
  const task = useMutation({
    mutationFn: async () => {
      const text = buildInvestigationResearchDraft(investigation);
      if (text.length > 30000)
        throw new Error("The saved evidence is too large for a chat draft.");
      sessionId.current ??= (
        await createSamSession({ data: { projectId: investigation.projectId } })
      ).id;
      saveSamResearchDraft(investigation.projectId, sessionId.current, text);
      invalidateSamSessions(investigation.projectId);
      await navigate({
        to: "/p/$projectId/sam",
        params: { projectId: investigation.projectId },
        search: { s: sessionId.current },
      });
    },
    retry: false,
    onSettled: () => {
      opening.current = false;
    },
  });
  return (
    <div className="mt-4">
      <button
        className="btn btn-primary h-auto min-h-10 whitespace-normal py-2"
        disabled={task.isPending}
        onClick={() => {
          if (opening.current) return;
          opening.current = true;
          task.mutate();
        }}
      >
        {task.isPending
          ? "Opening task…"
          : investigation.decision?.verdict === "change"
            ? "Prepare change brief in SAM"
            : "Open research task in SAM"}
      </button>
      <p className="mt-2 text-sm text-base-content/75">
        SAM is your research assistant. The task and evidence will be filled in.
        Press Send in SAM to start AI research. Provider charges may apply.
      </p>
      {task.isError ? (
        <p role="alert" className="mt-2 text-sm text-error">
          Couldn’t open the task. Your investigation is saved. Try again.
        </p>
      ) : null}
    </div>
  );
}
