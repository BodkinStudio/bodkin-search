import { AppError } from "@/server/lib/errors";
import {
  parseResearchTarget,
  urlMatchesResearchTarget,
} from "@/shared/researchScope";

type GrowthTargetInput = {
  type: "url" | "site" | "keyword" | "cluster";
  value: string;
};

export type NormalizedGrowthTarget = {
  targetType: GrowthTargetInput["type"];
  targetValue: string;
};

const normalizeWords = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLowerCase();

export function normalizeGrowthTargets(
  projectDomain: string,
  values: GrowthTargetInput[],
): NormalizedGrowthTarget[] {
  const project = parseResearchTarget(projectDomain, "subdomains");
  if (!project.ok)
    throw new AppError("VALIDATION_ERROR", "Project domain is invalid");

  const targets = values.map(({ type, value }) => {
    if (type === "keyword" || type === "cluster") {
      return { targetType: type, targetValue: normalizeWords(value) };
    }

    const parsed = parseResearchTarget(
      value,
      type === "url" ? "exact_url" : "subdomains",
    );
    if (
      !parsed.ok ||
      !urlMatchesResearchTarget(
        `https://${parsed.target.hostname}${parsed.target.path}`,
        project.target,
      )
    ) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Targets must belong to the project domain",
      );
    }

    return {
      targetType: type,
      targetValue:
        type === "url"
          ? `https://${parsed.target.hostname}${parsed.target.path}`
          : parsed.target.hostname,
    };
  });

  return [
    ...new Map(
      targets.map((target) => [
        `${target.targetType}:${target.targetValue}`,
        target,
      ]),
    ).values(),
  ].toSorted((a, b) =>
    `${a.targetType}:${a.targetValue}`.localeCompare(
      `${b.targetType}:${b.targetValue}`,
    ),
  );
}
