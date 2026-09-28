import { describe, expect, it } from "vitest";
import { describePageChange } from "./pageChange";

const page = (
  overrides: Partial<Parameters<typeof describePageChange>[0]> = {},
) => ({
  statusCode: 200,
  resolvedUrl: "https://site.test/teams",
  title: "SMS for Microsoft Teams",
  metaDescription: "Text from Teams.",
  h1: "SMS in Teams",
  canonical: null,
  indexable: 1,
  wordCount: 1200,
  contentHash: "a",
  ...overrides,
});

describe("page change detection", () => {
  it("ignores a re-read with no meaningful difference", () => {
    // Timestamps or a footer year change the hash but not the page.
    expect(
      describePageChange(page(), page({ contentHash: "b", wordCount: 1203 })),
    ).toBeNull();
  });

  it("names a title rewrite with the old and new titles", () => {
    expect(
      describePageChange(page(), page({ title: "Business SMS in Teams" })),
    ).toEqual({
      changeType: "title_meta_updated",
      lines: [
        "Title changed from “SMS for Microsoft Teams” to “Business SMS in Teams”.",
      ],
    });
  });

  it("reports a page going missing, and several changes as mixed", () => {
    expect(
      describePageChange(page(), page({ statusCode: 404, contentHash: null })),
    ).toMatchObject({ changeType: "page_removed" });
    expect(
      describePageChange(
        page(),
        page({ title: "New", contentHash: "b", wordCount: 1600 }),
      ),
    ).toMatchObject({ changeType: "mixed" });
  });
});
