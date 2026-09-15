// Lightweight, dependency-free site reading shared by the chat agents
// (onboarding + SAM): discover URLs from the sitemap (falling back to the
// homepage) and extract readable text from each page via plain fetch. This is
// enough to let the model infer what a site does. JS-heavy sites degrade
// gracefully (less text); a Browser Rendering upgrade can slot in behind this
// same interface later.

import { normalizeAndValidateStartUrl } from "@/server/lib/audit/url-policy";

export const MAX_PAGES = 5;
const PER_PAGE_CHAR_LIMIT = 4000;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECT_HOPS = 5;
const MAX_RESPONSE_BYTES = 2_000_000;
const USER_AGENT = "OpenSEO-Onboarding/1.0 (+https://openseo.so)";

type ScrapedPage = {
  url: string;
  /** Final validated URL supplying the text, after redirects. */
  resolvedUrl: string;
  title: string | null;
  text: string;
  /** Same-site action links observed in the fetched HTML, without fetching them. */
  links?: Array<{ text: string; url: string }>;
};

type SiteReadResult = {
  pages: ScrapedPage[];
  /** True when we couldn't read any page (blocked, offline, etc.). */
  blocked: boolean;
};

// Bounded read: accumulate up to MAX_RESPONSE_BYTES regardless of whether
// content-length is present (chunked / CDN responses often omit it).
async function readBoundedText(response: Response): Promise<string | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  let result = "";
  let bytesRead = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytesRead += value.byteLength;
    if (bytesRead > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      return null;
    }
    result += decoder.decode(value, { stream: true });
  }
  result += decoder.decode();
  return result;
}

async function fetchText(
  url: string,
): Promise<{ text: string; resolvedUrl: string } | null> {
  try {
    const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
    const visited = new Set<string>();
    let current = url;
    for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
      if (visited.has(current)) return null;
      visited.add(current);
      const response = await fetch(current, {
        headers: { "user-agent": USER_AGENT, accept: "text/html,*/*" },
        // Each redirect destination must pass the same SSRF checks as the input.
        redirect: "manual",
        signal,
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location || hop === MAX_REDIRECT_HOPS) return null;
        const next = new URL(location, current);
        if (next.protocol !== "http:" && next.protocol !== "https:")
          return null;
        current = await normalizeAndValidateStartUrl(next.toString());
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        return null;
      }
      const text = await readBoundedText(response);
      return text === null ? null : { text, resolvedUrl: current };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Pulls page URLs from a sitemap body. Resolves relative/protocol-relative
 * <loc> entries against the origin and keeps same-origin HTML pages only. Nested
 * sitemap files (a sitemap index) are skipped rather than fetched as pages —
 * good enough for v1; we fall back to the homepage if nothing usable is found.
 */
function parseSitemapUrls(xml: string, origin: string): string[] {
  const urls: string[] = [];
  const regex = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    let resolved: string;
    try {
      resolved = new URL(match[1], origin).toString();
    } catch {
      continue;
    }
    if (resolved.startsWith(origin) && !resolved.endsWith(".xml")) {
      urls.push(resolved);
    }
  }
  return urls;
}

function extractTitle(html: string): string | null {
  const match = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  return match ? decodeEntities(match[1].trim()) : null;
}

/** Strips scripts/styles/tags and collapses whitespace into readable text. */
function htmlToText(html: string): string {
  const withoutBlocks = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const text = withoutBlocks
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return decodeEntities(text);
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function extractSameSiteLinks(html: string, baseUrl: string) {
  const links: Array<{ text: string; url: string }> = [];
  const seen = new Set<string>();
  const anchor = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  let scanned = 0;
  while ((match = anchor.exec(html)) && links.length < 50 && scanned < 100) {
    scanned += 1;
    const text = htmlToText(match[2]).slice(0, 200);
    if (!text) continue;
    try {
      const raw = new URL(match[1], baseUrl);
      if (raw.protocol !== "http:" && raw.protocol !== "https:") continue;
      if (
        raw.username ||
        raw.password ||
        raw.hostname !== new URL(baseUrl).hostname
      )
        continue;
      raw.hash = "";
      const normalized = raw.toString();
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      links.push({ text, url: normalized });
    } catch {
      // Ignore malformed, unsafe, or off-site destinations.
    }
  }
  return links;
}

/** Fetches one (already-validated) URL and shapes it as a page, or null if it
 * couldn't be read or yielded no text. */
async function scrapePage(url: string): Promise<ScrapedPage | null> {
  const fetched = await fetchText(url);
  if (!fetched) {
    return null;
  }
  const html = fetched.text;
  const text = htmlToText(html).slice(0, PER_PAGE_CHAR_LIMIT);
  if (text.length === 0) {
    return null;
  }
  const links = extractSameSiteLinks(html, fetched.resolvedUrl);
  return {
    url,
    resolvedUrl: fetched.resolvedUrl,
    title: extractTitle(html),
    text,
    ...(links.length ? { links } : {}),
  };
}

/**
 * Reads a specific list of page URLs as plain text — used when the caller names
 * exact pages (the user's own or a competitor's) rather than asking us to
 * discover a site. Each URL is independently run through the SSRF guard, so a
 * blocked or unreachable URL is skipped rather than failing the batch.
 */
export async function readPages(
  urls: string[],
  maxPages: number = MAX_PAGES,
): Promise<SiteReadResult> {
  const pages: ScrapedPage[] = [];
  for (const rawUrl of urls.slice(0, maxPages)) {
    let url: string;
    try {
      // Re-validates host, blocks private/metadata IPs, does DoH DNS resolution.
      url = await normalizeAndValidateStartUrl(rawUrl);
    } catch {
      continue; // blocked or unparseable URL
    }
    const page = await scrapePage(url);
    if (page) {
      pages.push(page);
    }
  }

  return { pages, blocked: pages.length === 0 };
}

/**
 * Lists a site's page URLs without reading them: the homepage plus what the
 * sitemap declares, capped at `limit`. Lets an agent see what a site has and
 * choose which pages to read (readPages) instead of blindly taking the first N.
 */
export async function discoverSiteUrls(
  domain: string,
  limit: number,
): Promise<{ urls: string[]; blocked: boolean }> {
  let rootUrl: string;
  try {
    rootUrl = await normalizeAndValidateStartUrl(domain);
  } catch {
    // Blocked (private/metadata host) or unparseable domain — nothing to list.
    return { urls: [], blocked: true };
  }
  const origin = new URL(rootUrl).origin;

  const sitemap = await fetchText(`${origin}/sitemap.xml`);
  const discovered = sitemap ? parseSitemapUrls(sitemap.text, origin) : [];
  const urls = [rootUrl, ...discovered.filter((url) => url !== rootUrl)];
  return { urls: urls.slice(0, limit), blocked: false };
}

/**
 * Discovers a site's representative URLs (homepage + sitemap) and reads them.
 * Just URL discovery on top of readPages, which does the validated fetching.
 */
export async function readSite(
  domain: string,
  maxPages: number = MAX_PAGES,
): Promise<SiteReadResult> {
  const discovered = await discoverSiteUrls(domain, maxPages);
  if (discovered.blocked) {
    return { pages: [], blocked: true };
  }
  return readPages(discovered.urls, maxPages);
}
