import { sha256Hex } from "@/server/lib/audit/ids";
import { fetchPage } from "@/server/lib/scrape";
import { GrowthPageMonitorRepository as repo } from "../repositories/GrowthPageMonitorRepository";
import { GrowthChangeEventsService } from "./GrowthChangeEventsService";
import { describePageChange, type PageReading as Reading } from "./pageChange";

const MAX_PAGES = 25;
// A page is re-read at most this often; the weekly watch lands inside it.
const MIN_INTERVAL_MS = 6 * 86_400_000;
// Answers that say nothing about the page itself (blocked, rate limited,
// server trouble). The page is left for next week rather than logged as
// removed and then restored. A real 404 or 410 still counts.
const isPassingTrouble = (status: number) =>
  status === 401 ||
  status === 403 ||
  status === 408 ||
  status === 429 ||
  status >= 500;

// Key pages, pages the plan is working on, and the homepage: what a person
// would want told about. Relative plan targets resolve against the domain.
async function watchedUrls(projectId: string) {
  const domain = await repo.projectDomain(projectId);
  if (!domain) return [];
  const origin = `https://${domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "")}`;
  const [keyPages, targets] = await Promise.all([
    repo.listKeyPageUrls(projectId),
    repo.listActionTargetUrls(projectId),
  ]);
  const urls = new Set<string>();
  for (const value of [`${origin}/`, ...keyPages, ...targets]) {
    try {
      const url = new URL(value, origin);
      url.hash = "";
      urls.add(url.toString());
    } catch {
      // not a URL; skip it
    }
  }
  return [...urls].slice(0, MAX_PAGES);
}

async function readPage(url: string): Promise<Reading | null> {
  const page = await fetchPage(url);
  if (!page) return null;
  if (!page.text)
    return {
      statusCode: page.status,
      resolvedUrl: page.resolvedUrl,
      title: null,
      metaDescription: null,
      h1: null,
      canonical: null,
      indexable: 0,
      wordCount: 0,
      contentHash: null,
    };
  // Loaded on demand, like the audit crawler, to keep the parser out of the
  // worker's startup module graph.
  const { analyzeHtml } = await import("@/server/lib/audit/page-analyzer");
  const analysis = analyzeHtml(page.text, url, page.status, 0);
  return {
    statusCode: page.status,
    resolvedUrl: page.resolvedUrl,
    title: analysis.title || null,
    metaDescription: analysis.metaDescription || null,
    h1: analysis.h1s[0] ?? null,
    canonical: analysis.canonical,
    indexable: (analysis.robotsMeta ?? "").toLowerCase().includes("noindex")
      ? 0
      : 1,
    wordCount: analysis.wordCount,
    contentHash: analysis.bodyText ? await sha256Hex(analysis.bodyText) : null,
  };
}

// Reads each watched page, compares it with what was seen last time, and puts
// real differences in the change log as detected changes. The first reading
// of a page is only a baseline.
async function checkPages(input: { projectId: string }, now = new Date()) {
  const urls = await watchedUrls(input.projectId);
  const previous = await repo.latestSnapshots(input.projectId, urls);
  const capturedAt = now.toISOString();
  let changes = 0;
  for (const url of urls) {
    const last = previous.get(url);
    if (last && now.valueOf() - Date.parse(last.capturedAt) < MIN_INTERVAL_MS)
      continue;
    try {
      if (await checkPage(input.projectId, url, last ?? null, capturedAt))
        changes++;
    } catch (error) {
      // One page failing must not stop the others.
      console.warn(`[growth-watch] page check failed for ${url}`, error);
    }
  }
  return { pages: urls.length, changes };
}

// Reads one page, logs a detected change against the last reading, and saves
// the new reading. Returns whether a change was logged.
async function checkPage(
  projectId: string,
  url: string,
  last: (Reading & { capturedAt: string }) | null,
  capturedAt: string,
) {
  const reading = await readPage(url);
  if (!reading || isPassingTrouble(reading.statusCode)) return false;
  const change = last ? describePageChange(last, reading) : null;
  if (last && change)
    await GrowthChangeEventsService.recordMonitorEvent({
      projectId,
      creationKey: `monitor:${await sha256Hex(url)}:${capturedAt}`,
      changeType: change.changeType,
      description:
        `Detected by Bodkin's weekly page check (last read ${last.capturedAt.slice(0, 10)}). ${change.lines.join(" ")}`.slice(
          0,
          5000,
        ),
      happenedAt: capturedAt,
      urls: [url],
    });
  await repo.insertSnapshot({
    id: crypto.randomUUID(),
    projectId,
    url,
    capturedAt,
    ...reading,
  });
  return Boolean(last && change);
}

export const GrowthPageMonitorService = { checkPages } as const;
