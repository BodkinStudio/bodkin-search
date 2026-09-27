import type { GrowthChangeEventType } from "@/types/schemas/growth-change-events";

// What the Growth watch reads from a page; kept free of database imports so
// the change rules can be tested on their own.
export type PageReading = {
  statusCode: number;
  resolvedUrl: string;
  title: string | null;
  metaDescription: string | null;
  h1: string | null;
  canonical: string | null;
  indexable: number;
  wordCount: number;
  contentHash: string | null;
};

// Word-count movement below this share is template noise, not a rewrite.
const CONTENT_CHANGE_SHARE = 0.05;

const ok = (status: number) => status >= 200 && status < 300;
const quote = (value: string | null) => (value ? `“${value}”` : "nothing");

/** What changed between two readings of a page, in plain language. */
export function describePageChange(
  before: PageReading,
  after: PageReading,
): { changeType: GrowthChangeEventType; lines: string[] } | null {
  const found: { type: GrowthChangeEventType; line: string }[] = [];
  if (ok(before.statusCode) && !ok(after.statusCode))
    found.push({
      type: "page_removed",
      line: `Page now returns ${after.statusCode} (was ${before.statusCode}).`,
    });
  else if (!ok(before.statusCode) && ok(after.statusCode))
    found.push({
      type: "page_created",
      line: `Page is back online (was returning ${before.statusCode}).`,
    });
  if (before.resolvedUrl !== after.resolvedUrl)
    found.push({
      type: "redirect_changed",
      line: `Now ends up at ${after.resolvedUrl} (was ${before.resolvedUrl}).`,
    });
  if (before.title !== after.title)
    found.push({
      type: "title_meta_updated",
      line: `Title changed from ${quote(before.title)} to ${quote(after.title)}.`,
    });
  if (before.metaDescription !== after.metaDescription)
    found.push({
      type: "title_meta_updated",
      line: "Meta description changed.",
    });
  if (before.indexable !== after.indexable)
    found.push({
      type: "technical_fix",
      line: after.indexable
        ? "Page can be indexed again (noindex removed)."
        : "Page was set to noindex.",
    });
  const words = Math.abs(after.wordCount - before.wordCount);
  const rewritten =
    before.contentHash !== after.contentHash &&
    (before.h1 !== after.h1 ||
      words >= Math.max(20, before.wordCount * CONTENT_CHANGE_SHARE));
  if (ok(after.statusCode) && rewritten)
    found.push({
      type: "content_updated",
      line:
        before.h1 !== after.h1
          ? `Main heading changed from ${quote(before.h1)} to ${quote(after.h1)}.`
          : `Content changed: ${before.wordCount.toLocaleString("en-GB")} → ${after.wordCount.toLocaleString("en-GB")} words.`,
    });
  if (found.length === 0) return null;
  const types = new Set(found.map((entry) => entry.type));
  return {
    changeType: types.size === 1 ? found[0].type : "mixed",
    lines: found.map((entry) => entry.line),
  };
}
