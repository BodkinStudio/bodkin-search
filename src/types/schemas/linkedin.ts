import { z } from "zod";

const FORMULA_PREFIX = /^[=+@-]/;

function isRealIsoDate(value: string): boolean {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isFormulaSafe(value: string): boolean {
  return !FORMULA_PREFIX.test(value.trim());
}

const linkedinDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isRealIsoDate, "Must be a real calendar date.");

const boundedTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(10_000)
  .refine(isFormulaSafe, "Formula-like values are not allowed.");

const nullableCountSchema = z
  .number()
  .finite()
  .int()
  .nonnegative()
  .max(2_147_483_647)
  .nullable();
const nullableRateSchema = z.number().finite().min(0).max(100).nullable();

const linkedInPostUrlSchema = boundedTextSchema.url().refine((value) => {
  const url = new URL(value);
  return (
    url.protocol === "https:" &&
    (url.hostname === "linkedin.com" || url.hostname === "www.linkedin.com")
  );
}, "Must be a LinkedIn HTTPS URL.");

export const linkedinPostSchema = z
  .object({
    postUrl: linkedInPostUrlSchema.nullable(),
    postText: boundedTextSchema.nullable(),
    publishedAt: linkedinDateSchema.nullable(),
    impressions: nullableCountSchema,
    membersReached: nullableCountSchema,
    videoViews: nullableCountSchema,
    clicks: nullableCountSchema,
    reactions: nullableCountSchema,
    comments: nullableCountSchema,
    reposts: nullableCountSchema,
    follows: nullableCountSchema,
    providerClickThroughRate: nullableRateSchema,
    providerEngagementRate: nullableRateSchema,
  })
  .strict()
  .superRefine((post, context) => {
    if (!post.postUrl && !post.postText) {
      context.addIssue({
        code: "custom",
        path: ["postUrl"],
        message: "A post URL or post text is required.",
      });
    }

    const metrics = [
      post.impressions,
      post.membersReached,
      post.videoViews,
      post.clicks,
      post.reactions,
      post.comments,
      post.reposts,
      post.follows,
      post.providerClickThroughRate,
      post.providerEngagementRate,
    ];
    if (!metrics.some((metric) => metric !== null)) {
      context.addIssue({
        code: "custom",
        path: ["impressions"],
        message: "At least one supported metric is required.",
      });
    }
  });

function postIdentity(post: z.infer<typeof linkedinPostSchema>): string {
  return post.postUrl ?? `${post.postText}\u0000${post.publishedAt ?? ""}`;
}

export const linkedinImportSchema = z
  .object({
    projectId: z.string().trim().min(1).max(200),
    pageName: boundedTextSchema.max(200),
    startDate: linkedinDateSchema,
    endDate: linkedinDateSchema,
    posts: z.array(linkedinPostSchema).min(1).max(1_000),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.startDate > value.endDate) {
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "End date must be on or after start date.",
      });
    }

    const identities = value.posts.map(postIdentity);
    if (new Set(identities).size !== identities.length) {
      context.addIssue({
        code: "custom",
        path: ["posts"],
        message: "Duplicate post rows are not allowed.",
      });
    }
  });

export type LinkedInPostImport = z.infer<typeof linkedinPostSchema>;
export type LinkedInImportCommand = z.infer<typeof linkedinImportSchema>;
