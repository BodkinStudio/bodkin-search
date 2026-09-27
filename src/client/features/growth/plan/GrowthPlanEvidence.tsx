import { useState } from "react";
import {
  GROWTH_EVIDENCE_KIND_DESCRIPTIONS,
  GROWTH_EVIDENCE_KIND_LABELS,
  type GrowthActionEvidenceDto,
} from "@/types/schemas/growth-plan";
import { formatGrowthPreviewDate } from "../GrowthPreviewPresentation";
import { EVIDENCE_KIND_BADGE } from "./GrowthPlanPresentation";

export function GrowthPlanEvidence({
  evidence,
  pending,
  onRemove,
}: {
  evidence: GrowthActionEvidenceDto[];
  pending: boolean;
  onRemove: (evidenceId: string) => void;
}) {
  // Removal asks first: evidence is what the plan's claims rest on.
  const [confirming, setConfirming] = useState<string | null>(null);
  if (evidence.length === 0)
    return (
      <p className="mt-2 text-sm text-base-content/70">
        No evidence recorded yet.
      </p>
    );
  return (
    <ul className="mt-2 space-y-2">
      {evidence.map((item) => (
        <li
          key={item.id}
          className="flex items-start gap-2 text-sm [overflow-wrap:anywhere]"
        >
          <span
            className={`badge badge-sm shrink-0 ${EVIDENCE_KIND_BADGE}`}
            title={GROWTH_EVIDENCE_KIND_DESCRIPTIONS[item.kind]}
          >
            {GROWTH_EVIDENCE_KIND_LABELS[item.kind]}
          </span>
          <p className="min-w-0 flex-1">
            {item.statement}{" "}
            <span className="text-base-content/70">
              —{" "}
              {item.sourceUrl ? (
                <a
                  className="link"
                  href={item.sourceUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {item.sourceLabel}
                </a>
              ) : (
                item.sourceLabel
              )}
              {item.observedOn
                ? `, observed ${formatGrowthPreviewDate(item.observedOn)}`
                : ""}
            </span>
          </p>
          {confirming === item.id ? (
            <span className="flex shrink-0 gap-1">
              <button
                type="button"
                className="btn btn-error btn-sm"
                disabled={pending}
                onClick={() => {
                  onRemove(item.id);
                  setConfirming(null);
                }}
              >
                Yes, remove
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setConfirming(null)}
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="btn btn-ghost btn-sm shrink-0"
              disabled={pending}
              aria-label={`Remove evidence: ${item.statement.slice(0, 60)}`}
              onClick={() => setConfirming(item.id)}
            >
              Remove
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
