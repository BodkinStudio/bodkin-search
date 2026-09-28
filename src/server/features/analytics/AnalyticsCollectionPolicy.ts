import { db } from "@/db";
import { analyticsExcludedPaths, analyticsSources } from "@/db/schema";
import { eq } from "drizzle-orm";
export async function collectionPolicy(projectId: string) {
  const [paths, sources] = await Promise.all([
    db
      .select({ prefix: analyticsExcludedPaths.prefix })
      .from(analyticsExcludedPaths)
      .where(eq(analyticsExcludedPaths.projectId, projectId)),
    db
      .select({ hostname: analyticsSources.hostname })
      .from(analyticsSources)
      .where(eq(analyticsSources.projectId, projectId)),
  ]);
  return {
    prefixes: paths.map((p) => p.prefix),
    internalHosts: new Set(
      sources.map((s) => s.hostname.replace(/^www\./, "")),
    ),
  };
}
export function pathIsExcluded(path: string, prefixes: string[]) {
  let decoded: string;
  try {
    decoded = new URL(decodeURIComponent(path), "https://analytics.invalid")
      .pathname;
  } catch {
    return true;
  }
  return prefixes.some(
    (prefix) =>
      prefix === "/" ||
      decoded === prefix ||
      decoded.startsWith(`${prefix.replace(/\/$/, "")}/`),
  );
}
