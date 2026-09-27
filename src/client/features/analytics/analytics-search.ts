import { validTimezone } from "@/shared/analytics/calendar";
import { z } from "zod";
export const analyticsSearchSchema = z.object({
  timezone: z.string().refine(validTimezone).optional().catch(undefined),
  compare: z.boolean().catch(false),
  dimension: z
    .enum(["sources", "campaigns", "pages", "destinations"])
    .catch("sources"),
  template: z
    .enum(["enquiry", "signup", "external", "sales"])
    .catch("external"),
  action: z.string().max(100).optional(),
  view: z
    .enum(["overview", "journeys", "acquisition", "funnels", "customers"])
    .catch("overview"),
  environment: z.enum(["production", "test"]).catch("production"),
  days: z.union([z.literal(7), z.literal(30), z.literal(90)]).catch(30),
  display: z.enum(["list", "map"]).catch("list"),
  context: z.string().optional(),
  customer: z.string().uuid().optional().catch(undefined),
  page: z.string().optional(),
  source: z.string().optional(),
  method: z.enum(["all", "exact", "ip_time", "unattributed"]).catch("all"),
});
export type AnalyticsSearch = z.infer<typeof analyticsSearchSchema>;
