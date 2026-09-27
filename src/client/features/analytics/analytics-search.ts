import { validTimezone } from "@/shared/analytics/calendar";
import { z } from "zod";
export const analyticsSearchSchema = z.object({
  timezone: z.string().refine(validTimezone).optional().catch(undefined),
  // On unless the reader turns it off: a number means little without the one
  // before it.
  compare: z.boolean().default(true).catch(true),
  dimension: z
    .enum(["sources", "campaigns", "pages", "destinations"])
    .default("sources")
    .catch("sources"),
  template: z
    .enum(["enquiry", "signup", "external", "sales"])
    .default("external")
    .catch("external"),
  action: z.string().max(100).optional(),
  // "search" and "channels" are the Google Search and Channels areas; the rest
  // are views of the site's own journey tracking.
  view: z
    .enum([
      "overview",
      "journeys",
      "acquisition",
      "funnels",
      "customers",
      "search",
      "channels",
    ])
    .default("overview")
    .catch("overview"),
  // Unset until the reader picks one; the page then shows live data when a
  // live source exists and test data otherwise (see resolveEnvironment).
  environment: z.enum(["production", "test"]).optional().catch(undefined),
  days: z
    .union([z.literal(7), z.literal(30), z.literal(90)])
    .default(30)
    .catch(30),
  display: z.enum(["list", "map"]).default("list").catch("list"),
  context: z.string().optional(),
  customer: z.string().uuid().optional().catch(undefined),
  page: z.string().optional(),
  source: z.string().optional(),
  method: z
    .enum(["all", "exact", "ip_time", "unattributed"])
    .default("all")
    .catch("all"),
});
export type AnalyticsSearch = z.infer<typeof analyticsSearchSchema>;

export type AnalyticsEnvironment = "production" | "test";
export type ResolvedAnalyticsSearch = AnalyticsSearch & {
  environment: AnalyticsEnvironment;
};

// New sources start in test, so defaulting to production left first-time
// users on an empty report. Live data wins whenever a live source exists.
export function resolveEnvironment(
  chosen: AnalyticsEnvironment | undefined,
  sources: { environment: string }[] | undefined,
): AnalyticsEnvironment {
  if (chosen) return chosen;
  if (!sources?.some((source) => source.environment === "production")) {
    if (sources?.some((source) => source.environment === "test")) return "test";
  }
  return "production";
}
