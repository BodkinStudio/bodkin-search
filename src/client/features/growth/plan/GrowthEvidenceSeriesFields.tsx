import { useState } from "react";
import {
  GROWTH_EVIDENCE_SERIES_KINDS,
  growthEvidenceSeriesInputSchema,
  type GrowthEvidenceSeriesInput,
  type GrowthEvidenceSeriesKind,
} from "@/types/schemas/growth-plan";

const SERIES_KIND_LABELS: Record<GrowthEvidenceSeriesKind, string> = {
  monthly: "Monthly",
  bars: "Bars",
  matrix: "Matrix",
};

const SERIES_PLACEHOLDERS: Record<GrowthEvidenceSeriesKind, string> = {
  monthly: "2025-08, 15105\n2026-08, 4854",
  bars: "business text messaging service, 1300\nteams sms, 210",
  matrix: "teams sms, YakChat, 12\nteams sms, Falkon, 3",
};

// Lines are read from the right: the last field is the value, a matrix takes
// the one before it as the column, and whatever is left is the label, commas
// included. "-" (or an empty field) is a deliberate gap; anything else that is
// not a number is a mistake worth naming rather than silently dropping.
type ParsedSeriesPoint = {
  label: string;
  group: string | null;
  value: number | null;
};

function parseSeriesValue(raw: string) {
  if (raw === "" || raw === "-" || raw === "\u2014") return { value: null };
  const value = Number(raw);
  return Number.isFinite(value) ? { value } : { error: raw };
}

function parseSeriesPoints(kind: GrowthEvidenceSeriesKind, text: string) {
  const points: ParsedSeriesPoint[] = [];
  const errors: string[] = [];
  text.split("\n").forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (line.length === 0) return;
    const parts = line.split(",").map((part) => part.trim());
    const fields = kind === "matrix" ? 3 : 2;
    if (parts.length < fields) {
      errors.push(
        `Line ${index + 1}: expected ${
          kind === "matrix" ? "row, column, value" : "label, value"
        }.`,
      );
      return;
    }
    const parsed = parseSeriesValue(parts[parts.length - 1]);
    if (parsed.error !== undefined) {
      errors.push(`Line ${index + 1}: "${parsed.error}" is not a number.`);
      return;
    }
    const group = kind === "matrix" ? parts[parts.length - 2] : "";
    const label = parts.slice(0, parts.length - fields + 1).join(", ");
    if (label === "" || (kind === "matrix" && group === "")) {
      errors.push(
        `Line ${index + 1}: ${kind === "matrix" ? "a row and a column are" : "a label is"} required.`,
      );
      return;
    }
    points.push({
      label,
      group: kind === "matrix" ? group : null,
      value: parsed.value ?? null,
    });
  });
  return { points, errors };
}

// Optional data behind the statement. The block stays closed until someone has
// numbers to add, and an empty block submits no series at all.
export function GrowthEvidenceSeriesFields({
  id,
  value,
  onChange,
}: {
  id: string;
  value: GrowthEvidenceSeriesInput | null;
  onChange: (series: GrowthEvidenceSeriesInput | null) => void;
}) {
  const [kind, setKind] = useState<GrowthEvidenceSeriesKind>("monthly");
  const [title, setTitle] = useState("");
  const [unit, setUnit] = useState("");
  const [text, setText] = useState("");
  const [parseErrors, setParseErrors] = useState<string[]>([]);

  const update = (next: {
    kind?: GrowthEvidenceSeriesKind;
    title?: string;
    unit?: string;
    text?: string;
  }) => {
    const draft = { kind, title, unit, text, ...next };
    setKind(draft.kind);
    setTitle(draft.title);
    setUnit(draft.unit);
    setText(draft.text);
    const parsed = parseSeriesPoints(draft.kind, draft.text);
    setParseErrors(parsed.errors);
    const empty =
      draft.title.trim() === "" &&
      draft.unit.trim() === "" &&
      draft.text.trim() === "";
    onChange(
      empty
        ? null
        : {
            kind: draft.kind,
            title: draft.title.trim(),
            unit: draft.unit.trim(),
            // A line the author has not fixed yet must not be submitted as a
            // shorter series, so a parse error clears the points and the
            // schema's "at least one point" rule blocks the save.
            points: parsed.errors.length > 0 ? [] : parsed.points,
          },
    );
  };

  const issues = value
    ? (growthEvidenceSeriesInputSchema.safeParse(value).error?.issues ?? [])
    : [];

  return (
    <fieldset className="rounded-lg border border-base-300 p-3">
      <legend className="px-1 text-sm font-medium">Data (optional)</legend>
      <p className="text-xs text-base-content/70">
        The numbers behind the statement, drawn as a chart on the plan.
      </p>
      <div className="mt-2 grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor={`${id}-series-kind`} className="text-sm font-medium">
            Chart
          </label>
          <select
            id={`${id}-series-kind`}
            className="select select-bordered mt-1 w-full"
            value={kind}
            onChange={(event) =>
              update({
                kind:
                  GROWTH_EVIDENCE_SERIES_KINDS.find(
                    (option) => option === event.target.value,
                  ) ?? "monthly",
              })
            }
          >
            {GROWTH_EVIDENCE_SERIES_KINDS.map((option) => (
              <option key={option} value={option}>
                {SERIES_KIND_LABELS[option]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-series-title`} className="text-sm font-medium">
            Title
          </label>
          <input
            id={`${id}-series-title`}
            className="input input-bordered mt-1 w-full"
            maxLength={200}
            value={title}
            onChange={(event) => update({ title: event.target.value })}
          />
        </div>
        <div>
          <label htmlFor={`${id}-series-unit`} className="text-sm font-medium">
            Unit
          </label>
          <input
            id={`${id}-series-unit`}
            className="input input-bordered mt-1 w-full"
            maxLength={50}
            placeholder="impressions"
            value={unit}
            onChange={(event) => update({ unit: event.target.value })}
          />
        </div>
      </div>
      <div className="mt-3">
        <label htmlFor={`${id}-series-points`} className="text-sm font-medium">
          Points
        </label>
        <p className="mt-1 text-xs text-base-content/70">
          One per line:{" "}
          {kind === "matrix" ? "row, column, value" : "label, value"}. The value
          is the last field, written without thousands separators. Use
          &ldquo;-&rdquo; for a missing value.
        </p>
        <textarea
          id={`${id}-series-points`}
          rows={4}
          className="textarea textarea-bordered mt-1 w-full font-mono"
          placeholder={SERIES_PLACEHOLDERS[kind]}
          value={text}
          onChange={(event) => update({ text: event.target.value })}
        />
      </div>
      {parseErrors.map((message) => (
        <p key={message} role="alert" className="mt-1 text-sm">
          {message}
        </p>
      ))}
      {issues.map((issue) => (
        <p
          key={issue.path.join(".") + issue.message}
          role="alert"
          className="mt-1 text-sm"
        >
          {issue.path.join(" ")} {issue.message}
        </p>
      ))}
    </fieldset>
  );
}
