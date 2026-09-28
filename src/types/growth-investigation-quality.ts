interface GrowthInvestigationDecisionProse {
  decisionVerdict?: string | null;
  decisionHeadline?: string | null;
  decisionWhyThisPage?: string | null;
  decisionRationale?: string | null;
  decisionNextAction?: string | null;
  decisionExpectedOutcome?: string | null;
  decisionMeasurement?: string | null;
  decisionCaveat?: string | null;
}

const requiredDecisionFields: Array<keyof GrowthInvestigationDecisionProse> = [
  "decisionWhyThisPage",
  "decisionRationale",
  "decisionNextAction",
  "decisionExpectedOutcome",
  "decisionMeasurement",
  "decisionCaveat",
];

// Reject written quantities when attached to metrics, not ordinary instructions
// such as "first compare" or "choose one commercial destination".
const numberWords =
  "(?:dozen|dozens|couple|pair|several|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)";
const numericLanguage = new RegExp(
  `\\b${numberWords}\\s+(?:[a-z]+\\s+){0,2}(?:clicks?|impressions?|percent|rankings?|positions?|searches|views?|conversions?|queries)\\b|\\b(?:position|ranked?|page)\\s+${numberWords}\\b`,
  "i",
);
const quantitativeGeneralisation =
  /\b(?:most\s+queries|majority\s+of\s+(?:the\s+)?queries|all\s+queries)\b/i;
const vagueExpectedOutcome =
  /^(?:cannot be estimated(?: from (?:the )?supplied evidence)?|from supplied evidence|unknown|not enough information|better results|a positive outcome|improved performance|more growth|better performance|a better outcome|improved results)[.!\s]*$/i;
const genericOutcome =
  /better results|positive outcome|improved performance|more growth|better performance|better outcome|improved results/i;
const concretePurpose =
  /\b(?:decid\w*|determin\w*|identif\w*|clarif\w*|confirm\w*|learn\w*|understand\w*|select\w*|document\w*)\b[\s\S]*\b(?:page|query|queries|intent|audience|visitor|reader|customer|buyer|content|snippet|destination|enquir\w*|conversion|lead|action|role|rewrite|edit|change|hypothesis)\b/i;

const uuid =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;

function forbiddenQuantification(value: string) {
  if (uuid.test(value)) return "internal evidence identifier";
  if (/[\d%]/.test(value)) return "numeric value";
  return (
    value.match(numericLanguage)?.[0] ??
    value.match(quantitativeGeneralisation)?.[0]
  );
}

/** Reports only field names and rejected rule labels, never source or draft text. */
export function decisionProseIssues(
  decision: GrowthInvestigationDecisionProse,
): string[] {
  if (!decision.decisionHeadline?.trim())
    return decision.decisionVerdict ? ["headline: missing"] : [];
  const issues: string[] = [];
  for (const field of [
    "decisionHeadline" as const,
    ...requiredDecisionFields,
  ]) {
    const value = decision[field]?.trim();
    if (!value) {
      issues.push(`${field}: missing`);
      continue;
    }
    // The writer assembles this factual summary from source records, not model prose.
    const factualSummary = field === "decisionWhyThisPage";
    // Timing in a measurement plan is a proposed schedule, not a source statistic.
    const rejected = factualSummary
      ? uuid.test(value)
        ? "internal evidence identifier"
        : undefined
      : field === "decisionMeasurement"
        ? uuid.test(value)
          ? "internal evidence identifier"
          : undefined
        : forbiddenQuantification(value);
    if (rejected) issues.push(`${field}: ${rejected}`);
  }
  if (
    decision.decisionVerdict === "investigate" &&
    /\bafter\s+(?:changes|implementation|publishing)\b/i.test(
      decision.decisionMeasurement ?? "",
    )
  )
    issues.push("measurement: assumes an implemented change");
  if (
    vagueExpectedOutcome.test(decision.decisionExpectedOutcome?.trim() ?? "") ||
    (genericOutcome.test(decision.decisionExpectedOutcome ?? "") &&
      !concretePurpose.test(decision.decisionExpectedOutcome ?? ""))
  )
    issues.push("outcome: lacks practical purpose");
  return issues;
}

export function decisionProseNeedsRefresh(
  decision: GrowthInvestigationDecisionProse,
) {
  return decisionProseIssues(decision).length > 0;
}
