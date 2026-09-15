type GrowthAssessmentOptionKind = "page" | "measurement" | "research" | "defer";

const investigationOutcomeTarget =
  /\b(?:rank|ranking|position)\s*(?:<=|>=|≤|≥|<|>|to|under|above)?\s*(?:#?\d+|top\s*\d+)\b|\b(?:reach|achieve|attain|maintain|hit|improve|increase|lift|grow)\b.{0,80}\b(?:top[-\s]*\d+|#?\d+)\s+(?:rank|ranking|position)\b|\b(?:increase|improve|lift|grow)\b.{0,80}\b(?:rank|ranking|position|clicks?|impressions?|traffic|conversions?|leads?|revenue|sales?)\b/i;

const placeholderCompletionTarget =
  /\b(?:cited evidence subject|bounded check is recorded)\b/i;

/**
 * Returns why an investigation draft cannot be accepted, if its completion
 * target promises an outcome or leaves the recorded result unspecified.
 */
export function invalidGrowthAssessmentCompletionTargetReason(
  kind: GrowthAssessmentOptionKind | undefined,
  successMeasure: string,
) {
  if (kind !== "research" && kind !== "measurement") return null;
  if (investigationOutcomeTarget.test(successMeasure))
    return "It promises a ranking or business outcome instead of the result of this check.";
  if (placeholderCompletionTarget.test(successMeasure))
    return "It uses a placeholder instead of naming the result this check should produce.";
  return null;
}

export function isInvalidGrowthAssessmentCompletionTarget(
  kind: GrowthAssessmentOptionKind | undefined,
  successMeasure: string,
) {
  return (
    invalidGrowthAssessmentCompletionTargetReason(kind, successMeasure) !== null
  );
}
