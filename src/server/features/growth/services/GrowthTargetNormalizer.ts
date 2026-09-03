import { AppError } from "@/server/lib/errors";
import { normalizeKeyPageUrl } from "@/server/features/project-context/services/contextUpdateOps";
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

export type GrowthTargetNormalizationMode =
  | "research_scope"
  | "key_page_identity";

const MAX_TARGET_VALUE_LENGTH = 2000;

const normalizeWords = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLowerCase();

function canonicalizeGrowthExactUrl(value: string) {
  const parsed = parseResearchTarget(value, "exact_url");
  if (!parsed.ok)
    throw new AppError("VALIDATION_ERROR", "Target must be a valid exact URL");
  return `https://${parsed.target.hostname}${parsed.target.path}`;
}

export function canonicalizeGrowthExactUrls(values: string[]): string[] {
  return [...new Set(values.map(canonicalizeGrowthExactUrl))].toSorted();
}

export function normalizeGrowthTargets(
  projectDomain: string,
  values: GrowthTargetInput[],
  mode: GrowthTargetNormalizationMode = "research_scope",
): NormalizedGrowthTarget[] {
  const project = parseResearchTarget(projectDomain, "subdomains");
  if (!project.ok)
    throw new AppError("VALIDATION_ERROR", "Project domain is invalid");

  const targets = values.map(({ type, value }) => {
    if (type === "keyword" || type === "cluster") {
      return { targetType: type, targetValue: normalizeWords(value) };
    }

    if (type === "url") {
      const targetValue =
        mode === "key_page_identity"
          ? normalizeKeyPageUrl(value)
          : canonicalizeGrowthExactUrl(value);
      if (
        mode === "key_page_identity" &&
        targetValue.length > MAX_TARGET_VALUE_LENGTH
      )
        throw new AppError(
          "VALIDATION_ERROR",
          `URL targets are capped at ${MAX_TARGET_VALUE_LENGTH} characters`,
        );
      if (!urlMatchesResearchTarget(targetValue, project.target))
        throw new AppError(
          "VALIDATION_ERROR",
          "Targets must belong to the project domain",
        );
      return { targetType: type, targetValue };
    }

    const parsed = parseResearchTarget(value, "subdomains");
    if (
      !parsed.ok ||
      !urlMatchesResearchTarget(
        `https://${parsed.target.hostname}`,
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
      targetValue: parsed.target.hostname,
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

export function normalizeGrowthExactUrls(
  projectDomain: string,
  values: string[],
): string[] {
  const urls = canonicalizeGrowthExactUrls(values);
  const project = parseResearchTarget(projectDomain, "subdomains");
  if (!project.ok)
    throw new AppError("VALIDATION_ERROR", "Project domain is invalid");
  if (urls.some((url) => !urlMatchesResearchTarget(url, project.target)))
    throw new AppError(
      "VALIDATION_ERROR",
      "Targets must belong to the project domain",
    );
  return urls;
}
