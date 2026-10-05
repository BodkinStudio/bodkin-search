import { validTimezone } from "@/shared/analytics/calendar";
import { z } from "zod";
const consent = z
  .object({
    analytics: z.boolean(),
    attribution: z.boolean(),
    identity: z.boolean(),
    policyVersion: z.string().min(1).max(100),
  })
  .strict();
const page = z
  .object({
    host: z.string().min(1).max(255),
    path: z.string().min(1).max(500),
  })
  .strict();
export const journeyEventSchema = z
  .object({
    schemaVersion: z.literal(1),
    eventId: z.string().uuid(),
    projectKey: z.string().uuid(),
    sourceId: z.string().uuid(),
    environment: z.enum(["production", "test"]),
    /**
     * `consented` (default): the browser keeps a visitor ID and sends it.
     * `anonymous`: storage-free — no IDs leave the browser; the collector
     * derives a daily key from the request instead (legitimate interest).
     */
    mode: z.enum(["consented", "anonymous"]).optional(),
    contextId: z.string().uuid().optional(),
    sessionId: z.string().uuid().optional(),
    occurredAt: z.string().datetime(),
    name: z.enum([
      "page_view",
      "acquisition_clicked",
      "product_opened",
      "identity_known",
      "consent_withdrawn",
    ]),
    page: page.optional(),
    referrer: page.partial({ path: true }).optional(),
    campaign: z
      .object({
        source: z.string().max(150).optional(),
        medium: z.string().max(150).optional(),
        campaign: z.string().max(150).optional(),
        content: z.string().max(150).optional(),
        term: z.string().max(150).optional(),
      })
      .strict()
      .optional(),
    clickId: z
      .object({
        type: z.enum(["gclid", "gbraid", "wbraid", "msclkid", "fbclid", "li_fat_id", "ttclid"]),
        value: z.string().regex(/^[\w.~-]{1,200}$/),
      })
      .strict()
      .optional(),
    properties: z
      .object({
        action: z.string().max(100).optional(),
        destination: z.string().max(100).optional(),
        placement: z.string().max(100).optional(),
      })
      .strict()
      .optional(),
    consent,
    identityAssertion: z.string().max(8000).optional(),
  })
  .strict()
  .superRefine((v, c) => {
    if (v.mode === "anonymous") {
      if (v.contextId || v.sessionId)
        c.addIssue({
          code: "custom",
          message: "Anonymous events carry no visitor or session ID",
        });
      if (v.name === "consent_withdrawn")
        c.addIssue({
          code: "custom",
          message: "Anonymous events have no consent to withdraw",
        });
    } else if (!v.contextId)
      c.addIssue({
        code: "custom",
        message: "Consented events require a contextId",
      });
  });
export const collectBatchSchema = z
  .object({ events: z.array(journeyEventSchema).min(1).max(10) })
  .strict();
export const serverEventSchema = z
  .object({
    projectId: z.string(),
    sourceId: z.string().uuid(),
    environment: z.enum(["production", "test"]),
    eventId: z.string().min(1).max(200),
    issuer: z.string().min(1).max(100),
    customerId: z.string().min(1).max(200),
    contextId: z.string().uuid().optional(),
    name: z.enum([
      "enquiry_submitted",
      "registration_completed",
      "trial_started",
      "activation_achieved",
      "lead_qualified",
      "opportunity_created",
      "customer_acquired",
      "payment_succeeded",
      "refund_issued",
    ]),
    occurredAt: z.string().datetime(),
    amountMinor: z
      .number()
      .int()
      .nonnegative()
      .max(1_000_000_000_000)
      .optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    paymentId: z.string().max(200).optional(),
  })
  .strict()
  .superRefine((v, c) => {
    if (
      ["payment_succeeded", "refund_issued"].includes(v.name) &&
      (!v.currency || v.amountMinor === undefined || !v.paymentId)
    )
      c.addIssue({
        code: "custom",
        message: "Financial events require amountMinor, currency and paymentId",
      });
  });
export const analyticsQuerySchema = z.object({
  timezone: z
    .string()
    .max(100)
    .refine(validTimezone, "Use an IANA timezone")
    .optional(),
  compare: z.boolean().optional(),
  template: z.enum(["enquiry", "signup", "external", "sales"]).optional(),
  action: z.string().max(100).optional(),
  projectId: z.string().min(1),
  environment: z.enum(["production", "test"]).default("production"),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(200).default(100),
  offset: z.number().int().nonnegative().max(10000).default(0),
});
export type JourneyEvent = z.infer<typeof journeyEventSchema>;
export type ServerJourneyEvent = z.infer<typeof serverEventSchema>;
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
