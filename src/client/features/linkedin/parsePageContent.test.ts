import * as XLSX from "@e965/xlsx";
import { describe, expect, it } from "vitest";
import {
  parseLinkedInPageContent,
  parseLinkedInRows,
} from "./parsePageContent";

const meta = {
  pageName: "OpenSEO",
  startDate: "2026-08-01",
  endDate: "2026-08-31",
};
const header = [
  "Post URL",
  "Post text",
  "Created",
  "Impressions",
  "Members reached",
  "Clicks",
  "CTR",
  "Reactions",
  "Comments",
  "Shares",
  "Video views",
  "Engagement rate",
];
const row = [
  "https://www.linkedin.com/posts/example",
  "Hello",
  "2026-08-02",
  "12",
  "10",
  "2",
  "16.67%",
  "3",
  "1",
  "1",
  "4",
  "12.5%",
];

function namedFile(data: BlobPart[], name: string, type: string) {
  return new File(data, name, { type });
}

function workbookFile(
  sheets: Array<{ name: string; rows: unknown[][] }>,
  extension: "xls" | "xlsx" = "xlsx",
) {
  const book = XLSX.utils.book_new();
  for (const { name, rows } of sheets) {
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), name);
  }
  return namedFile(
    // oxlint-disable-next-line typescript/no-unsafe-argument -- SheetJS types this documented array output as any.
    [XLSX.write(book, { type: "array", bookType: extension })],
    `content.${extension}`,
    "application/octet-stream",
  );
}

describe("parseLinkedInRows", () => {
  it("normalizes current and legacy aliases without inventing missing values", () => {
    expect(parseLinkedInRows([header, row], meta).posts[0]).toMatchObject({
      publishedAt: "2026-08-02",
      impressions: 12,
      membersReached: 10,
      reposts: 1,
      follows: null,
      providerClickThroughRate: 16.67,
      providerEngagementRate: 12.5,
    });
  });

  it.each([
    ["=1+1", "formula-like"],
    ["https://example.com/post", "LinkedIn HTTPS"],
    ["1.5", "whole number"],
    ["2147483648", "too large"],
  ])("fails closed for %s", (bad, message) => {
    const changed = [...row];
    changed[bad === "https://example.com/post" ? 0 : 3] = bad;
    expect(() => parseLinkedInRows([header, changed], meta)).toThrow(message);
  });

  it("treats provider missing-value tokens as null", () => {
    const changed = [...row];
    changed[3] = "—";
    changed[4] = "N/A";
    changed[5] = "-";
    expect(parseLinkedInRows([header, changed], meta).posts[0]).toMatchObject({
      impressions: null,
      membersReached: null,
      clicks: null,
    });
  });

  it("uses the confirmed range to resolve slash dates and rejects ambiguity", () => {
    const changed = [...row];
    changed[2] = "08/02/2026";
    expect(
      parseLinkedInRows([header, changed], meta).posts[0]?.publishedAt,
    ).toBe("2026-08-02");
    expect(() =>
      parseLinkedInRows([header, changed], {
        ...meta,
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      }),
    ).toThrow("ambiguous");
  });

  it("rejects invalid dates, duplicate identities, duplicate columns, and unsupported layouts", () => {
    const invalidDate = [...row];
    invalidDate[2] = "2026-02-30";
    expect(() => parseLinkedInRows([header, invalidDate], meta)).toThrow(
      "real calendar date",
    );
    expect(() => parseLinkedInRows([header, row, row], meta)).toThrow(
      "Duplicate post",
    );
    expect(() =>
      parseLinkedInRows(
        [
          [...header, "Likes"],
          [...row, "2"],
        ],
        meta,
      ),
    ).toThrow("duplicate recognized columns");
    expect(() => parseLinkedInRows([["Views"], ["2"]], meta)).toThrow(
      "Unsupported",
    );
  });

  it("finds a single content table after preamble rows and rejects two candidates", () => {
    expect(
      parseLinkedInRows([["Report"], ["Generated"], header, row], meta).posts,
    ).toHaveLength(1);
    expect(() =>
      parseLinkedInRows([header, row, [], header, row], meta),
    ).toThrow("multiple possible Content tables");
  });

  it("caps normalized rows", () => {
    const rows = Array.from({ length: 1_001 }, (_, index) => {
      const value = [...row];
      value[0] = `https://www.linkedin.com/posts/${index}`;
      return value;
    });
    expect(() => parseLinkedInRows([header, ...rows], meta)).toThrow("1,000");
  });
});

describe("parseLinkedInPageContent", () => {
  it("parses CSV and enforces file type and size limits", async () => {
    const csv = namedFile(
      [[header, row].map((cells) => cells.join(",")).join("\n")],
      "content.csv",
      "text/csv",
    );
    await expect(parseLinkedInPageContent(csv, meta)).resolves.toMatchObject({
      posts: [{ impressions: 12 }],
    });
    await expect(
      parseLinkedInPageContent(
        namedFile(["hello"], "content.txt", "text/plain"),
        meta,
      ),
    ).rejects.toThrow(".xls");
    await expect(
      parseLinkedInPageContent(
        namedFile(
          [new Uint8Array(5 * 1024 * 1024 + 1)],
          "content.csv",
          "text/csv",
        ),
        meta,
      ),
    ).rejects.toThrow("5 MiB");
  });

  it.each(["xlsx", "xls"] as const)(
    "parses %s workbooks",
    async (extension) => {
      await expect(
        parseLinkedInPageContent(
          workbookFile([{ name: "Content", rows: [header, row] }], extension),
          meta,
        ),
      ).resolves.toMatchObject({ posts: [{ impressions: 12, reposts: 1 }] });
    },
  );

  it("scans worksheets and rejects multiple content tables", async () => {
    await expect(
      parseLinkedInPageContent(
        workbookFile([
          { name: "About", rows: [["LinkedIn analytics export"]] },
          { name: "Content", rows: [["Preamble"], header, row] },
        ]),
        meta,
      ),
    ).resolves.toMatchObject({ posts: [{ postText: "Hello" }] });
    await expect(
      parseLinkedInPageContent(
        workbookFile([
          { name: "Content A", rows: [header, row] },
          { name: "Content B", rows: [header, row] },
        ]),
        meta,
      ),
    ).rejects.toThrow("multiple possible Content tables");
  });

  it("rejects workbook formulas", async () => {
    const sheet = XLSX.utils.aoa_to_sheet([header, row]);
    sheet.D2 = { t: "n", f: "1+1", v: 2 };
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Content");
    const file = namedFile(
      // oxlint-disable-next-line typescript/no-unsafe-argument -- SheetJS types this documented array output as any.
      [XLSX.write(book, { type: "array", bookType: "xlsx" })],
      "content.xlsx",
      "application/octet-stream",
    );
    await expect(parseLinkedInPageContent(file, meta)).rejects.toThrow(
      "formula cells",
    );
  });
});
