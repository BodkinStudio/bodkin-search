import Papa from "papaparse";
import type {
  LinkedInImportCommand,
  LinkedInPostImport,
} from "@/types/schemas/linkedin";

export const LINKEDIN_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const LINKEDIN_IMPORT_MAX_ROWS = 1_000;
const MAX_SHEETS = 20;
const MAX_HEADER_ROWS = 200;
const MAX_WORKSHEET_ROWS = MAX_HEADER_ROWS + LINKEDIN_IMPORT_MAX_ROWS + 1;

type ImportMetadata = Omit<LinkedInImportCommand, "projectId" | "posts">;
type PostField = keyof LinkedInPostImport;

const HEADER_ALIASES: Record<string, PostField> = {
  "update title": "postText",
  "post title": "postText",
  "post text": "postText",
  "update link": "postUrl",
  "post link": "postUrl",
  "post url": "postUrl",
  created: "publishedAt",
  "created date": "publishedAt",
  "published date": "publishedAt",
  "post date": "publishedAt",
  impressions: "impressions",
  "members reached": "membersReached",
  "unique impressions": "membersReached",
  views: "videoViews",
  "video views": "videoViews",
  clicks: "clicks",
  ctr: "providerClickThroughRate",
  reactions: "reactions",
  likes: "reactions",
  comments: "comments",
  reposts: "reposts",
  shares: "reposts",
  follows: "follows",
  "engagement rate": "providerEngagementRate",
};

const METRIC_FIELDS = new Set<PostField>([
  "impressions",
  "membersReached",
  "videoViews",
  "clicks",
  "reactions",
  "comments",
  "reposts",
  "follows",
  "providerClickThroughRate",
  "providerEngagementRate",
]);

type ContentTable = {
  rows: unknown[][];
  headerRowIndex: number;
  columns: Array<PostField | undefined>;
};

function normalizeHeader(value: unknown): string {
  const text =
    typeof value === "string" || typeof value === "number" ? String(value) : "";
  return text
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function isBlank(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "")
  );
}

function isMissingMetricToken(value: string): boolean {
  return value === "-" || value === "—" || /^n\/?a$/i.test(value);
}

function textCell(value: unknown, fieldName: string): string | null {
  if (isBlank(value)) return null;
  if (typeof value !== "string" && typeof value !== "number") {
    throw new Error(`${fieldName} has an unsupported cell value.`);
  }

  const text = String(value).trim();
  if (/^[=+@-]/.test(text)) {
    throw new Error(`${fieldName} contains an unsafe formula-like value.`);
  }
  return text;
}

function numericCell(
  value: unknown,
  fieldName: string,
  percentage = false,
): number | null {
  if (isBlank(value)) return null;
  const raw = String(value).trim();
  if (isMissingMetricToken(raw)) return null;

  const safeValue = textCell(value, fieldName);
  if (safeValue === null) return null;
  const normalized = (
    percentage ? safeValue.replace(/%$/, "") : safeValue
  ).replace(/,(?=\d{3}(?:\D|$))/g, "");

  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    throw new Error(`${fieldName} must be a non-negative number.`);
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${fieldName} must be finite.`);
  }
  if (!percentage && !Number.isInteger(parsed)) {
    throw new Error(`${fieldName} must be a whole number.`);
  }
  if (!percentage && parsed > 2_147_483_647) {
    throw new Error(`${fieldName} is too large to import.`);
  }
  if (percentage && parsed > 100) {
    throw new Error(`${fieldName} must be between 0 and 100.`);
  }
  return parsed;
}

function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function validDateParts(
  year: number,
  month: number,
  day: number,
): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return formatUtcDate(date);
}

function slashDateCandidates(value: string): string[] {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (!match) return [];
  const [, first, second, year] = match.map(Number);
  return [
    validDateParts(year, first, second),
    validDateParts(year, second, first),
  ].filter((date): date is string => date !== null);
}

function calendarDate(value: unknown, metadata: ImportMetadata): string | null {
  if (isBlank(value)) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatUtcDate(value);
  }

  const raw = textCell(value, "Published date");
  if (raw === null) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split("-").map(Number);
    const date = validDateParts(year, month, day);
    if (date) return date;
    throw new Error("Published date must be a real calendar date.");
  }

  const candidates = [...new Set(slashDateCandidates(raw))];
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) {
    const inRange = candidates.filter(
      (date) => date >= metadata.startDate && date <= metadata.endDate,
    );
    if (inRange.length === 1) return inRange[0];
    throw new Error(
      "Published date is ambiguous. Convert dates to YYYY-MM-DD and try again.",
    );
  }

  throw new Error(
    "Published date must use YYYY-MM-DD or an unambiguous slash date.",
  );
}

function findContentTable(rows: unknown[][]): ContentTable | null {
  const matches: ContentTable[] = [];
  const headerLimit = Math.min(rows.length, MAX_HEADER_ROWS);

  for (let rowIndex = 0; rowIndex < headerLimit; rowIndex += 1) {
    const columns = rows[rowIndex].map(
      (value) => HEADER_ALIASES[normalizeHeader(value)],
    );
    const recognized = columns.filter(
      (field): field is PostField => field !== undefined,
    );
    const hasIdentity =
      recognized.includes("postUrl") || recognized.includes("postText");
    const hasMetric = recognized.some((field) => METRIC_FIELDS.has(field));
    if (!hasIdentity || !hasMetric) continue;

    if (new Set(recognized).size !== recognized.length) {
      throw new Error("The export has duplicate recognized columns.");
    }
    matches.push({ rows, headerRowIndex: rowIndex, columns });
  }

  if (matches.length > 1) {
    throw new Error("The export has multiple possible Content tables.");
  }
  return matches[0] ?? null;
}

function parseContentTable(
  table: ContentTable,
  metadata: ImportMetadata,
): LinkedInPostImport[] {
  const posts: LinkedInPostImport[] = [];
  const dataRows = table.rows.slice(table.headerRowIndex + 1);

  for (const row of dataRows) {
    if (row.every(isBlank)) continue;
    if (posts.length >= LINKEDIN_IMPORT_MAX_ROWS) {
      throw new Error("The export has more than 1,000 content rows.");
    }

    const read = (field: PostField) => row[table.columns.indexOf(field)];
    const postUrl = textCell(read("postUrl"), "Post URL");
    if (postUrl) {
      let url: URL;
      try {
        url = new URL(postUrl);
      } catch {
        throw new Error("Post URL must be a LinkedIn HTTPS URL.");
      }
      if (
        url.protocol !== "https:" ||
        (url.hostname !== "linkedin.com" && url.hostname !== "www.linkedin.com")
      ) {
        throw new Error("Post URL must be a LinkedIn HTTPS URL.");
      }
    }

    const post: LinkedInPostImport = {
      postUrl,
      postText: textCell(read("postText"), "Post text"),
      publishedAt: calendarDate(read("publishedAt"), metadata),
      impressions: numericCell(read("impressions"), "Impressions"),
      membersReached: numericCell(read("membersReached"), "Members reached"),
      videoViews: numericCell(read("videoViews"), "Video views"),
      clicks: numericCell(read("clicks"), "Clicks"),
      reactions: numericCell(read("reactions"), "Reactions"),
      comments: numericCell(read("comments"), "Comments"),
      reposts: numericCell(read("reposts"), "Reposts"),
      follows: numericCell(read("follows"), "Follows"),
      providerClickThroughRate: numericCell(
        read("providerClickThroughRate"),
        "CTR",
        true,
      ),
      providerEngagementRate: numericCell(
        read("providerEngagementRate"),
        "Engagement rate",
        true,
      ),
    };

    if (!post.postUrl && !post.postText) {
      throw new Error("Each post needs a URL or text.");
    }
    if (![...METRIC_FIELDS].some((field) => post[field] !== null)) {
      throw new Error("Each post needs at least one supported metric.");
    }
    posts.push(post);
  }

  if (posts.length === 0) {
    throw new Error("The export has no content rows.");
  }
  const identities = posts.map(
    (post) => post.postUrl ?? `${post.postText}\u0000${post.publishedAt ?? ""}`,
  );
  if (new Set(identities).size !== identities.length) {
    throw new Error("Duplicate post rows are not allowed.");
  }
  return posts;
}

export function parseLinkedInRows(
  rows: unknown[][],
  metadata: ImportMetadata,
): Omit<LinkedInImportCommand, "projectId"> {
  const table = findContentTable(rows);
  if (!table) {
    throw new Error(
      "Unsupported export layout. Include a post identity and a supported metric.",
    );
  }
  return { ...metadata, posts: parseContentTable(table, metadata) };
}

function hasFormulaCell(sheet: object): boolean {
  return Object.entries(sheet).some(([key, value]) => {
    if (key.startsWith("!")) return false;
    if (typeof value !== "object" || value === null) return false;
    return (
      typeof Object.getOwnPropertyDescriptor(value, "f")?.value === "string"
    );
  });
}

export async function parseLinkedInPageContent(
  file: File,
  metadata: ImportMetadata,
): Promise<Omit<LinkedInImportCommand, "projectId">> {
  if (file.size > LINKEDIN_IMPORT_MAX_BYTES) {
    throw new Error("Choose a file no larger than 5 MiB.");
  }

  const filename = file.name.toLowerCase();
  if (filename.endsWith(".csv")) {
    const parsed = Papa.parse<unknown[]>(await file.text(), {
      skipEmptyLines: false,
    });
    if (parsed.errors.length > 0) {
      throw new Error("Could not parse the CSV export.");
    }
    return parseLinkedInRows(parsed.data, metadata);
  }

  if (!/\.xlsx?$/.test(filename)) {
    throw new Error(
      "Choose a LinkedIn Page Content .xls, .xlsx, or .csv export.",
    );
  }

  const xlsx = await import("@e965/xlsx");
  const workbook = xlsx.read(await file.arrayBuffer(), {
    type: "array",
    sheetRows: MAX_WORKSHEET_ROWS,
    cellDates: true,
  });
  if (workbook.SheetNames.length > MAX_SHEETS) {
    throw new Error("The workbook has more than 20 worksheets.");
  }

  const tables: ContentTable[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    if (hasFormulaCell(sheet)) {
      throw new Error(
        "The workbook contains formula cells, which are unsupported.",
      );
    }
    const rows = xlsx.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: false,
      blankrows: true,
    });
    const table = findContentTable(rows);
    if (table) tables.push(table);
  }

  if (tables.length !== 1) {
    throw new Error(
      tables.length > 1
        ? "The workbook has multiple possible Content tables."
        : "Unsupported export layout. Include a post identity and a supported metric.",
    );
  }

  return {
    ...metadata,
    posts: parseContentTable(tables[0], metadata),
  };
}
