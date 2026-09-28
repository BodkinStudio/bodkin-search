import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readPages, readSite } from "@/server/lib/scrape";

describe("readSite SSRF guard", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("blocks a metadata/private host without fetching it", async () => {
    const result = await readSite("169.254.169.254");

    expect(result.blocked).toBe(true);
    expect(result.pages).toEqual([]);
    // The blocked host must be rejected before any outbound page fetch.
    expect(fetch).not.toHaveBeenCalled();
  });

  it("blocks localhost-style targets", async () => {
    const result = await readSite("localhost:3000");

    expect(result.blocked).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("readPages SSRF guard", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("skips private/metadata URLs without fetching them", async () => {
    const result = await readPages([
      "http://169.254.169.254/latest/meta-data/",
      "http://localhost:3000/admin",
    ]);

    expect(result.blocked).toBe(true);
    expect(result.pages).toEqual([]);
    // Every URL is validated before any outbound fetch.
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns blocked for an empty URL list without fetching", async () => {
    const result = await readPages([]);

    expect(result.blocked).toBe(true);
    expect(result.pages).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("readPages redirect chains", () => {
  afterEach(() => vi.unstubAllGlobals());

  function mockPages(responses: Record<string, () => Response>) {
    const pageRequests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string, init?: RequestInit) => {
        if (input.startsWith("https://cloudflare-dns.com/")) {
          return Response.json({ Status: 0, Answer: [] });
        }
        pageRequests.push(input);
        expect(init?.redirect).toBe("manual");
        const respond = responses[input];
        if (!respond) throw new Error(`Unexpected page request: ${input}`);
        return respond();
      }),
    );
    return pageRequests;
  }

  it("reads apex → www → regional page and keeps requested and resolved URLs", async () => {
    const requests = mockPages({
      "https://example.com/page": () =>
        new Response(null, {
          status: 308,
          headers: { location: "https://www.example.com/page" },
        }),
      "https://www.example.com/page": () =>
        new Response(null, {
          status: 302,
          headers: { location: "/page-global" },
        }),
      "https://www.example.com/page-global": () =>
        new Response(
          "<title>Business SMS</title><p>Send business messages.</p>",
        ),
    });
    const result = await readPages(["https://example.com/page"]);
    expect(result).toEqual({
      blocked: false,
      pages: [
        {
          url: "https://example.com/page",
          resolvedUrl: "https://www.example.com/page-global",
          title: "Business SMS",
          text: "Business SMS Send business messages.",
        },
      ],
    });
    expect(requests).toHaveLength(3);
  });

  it.each([
    "http://169.254.169.254/latest/meta-data",
    "http://localhost/admin",
    "file:///etc/passwd",
  ])(
    "rejects a forbidden second redirect destination: %s",
    async (destination) => {
      const requests = mockPages({
        "https://example.com/page": () =>
          new Response(null, {
            status: 301,
            headers: { location: "/next" },
          }),
        "https://example.com/next": () =>
          new Response(null, {
            status: 302,
            headers: { location: destination },
          }),
      });
      expect(await readPages(["https://example.com/page"])).toEqual({
        pages: [],
        blocked: true,
      });
      expect(requests).toEqual([
        "https://example.com/page",
        "https://example.com/next",
      ]);
    },
  );

  it("stops a redirect cycle before requesting the same page again", async () => {
    const requests = mockPages({
      "https://example.com/page": () =>
        new Response(null, {
          status: 301,
          headers: { location: "/next" },
        }),
      "https://example.com/next": () =>
        new Response(null, {
          status: 302,
          headers: { location: "/page" },
        }),
    });
    expect((await readPages(["https://example.com/page"])).blocked).toBe(true);
    expect(requests).toHaveLength(2);
  });

  it("caps redirects even when every destination is different", async () => {
    const responses = Object.fromEntries(
      Array.from({ length: 7 }, (_, index) => [
        `https://example.com/${index}`,
        () =>
          new Response(null, {
            status: 302,
            headers: { location: `/${index + 1}` },
          }),
      ]),
    );
    const requests = mockPages(responses);
    expect((await readPages(["https://example.com/0"])).blocked).toBe(true);
    expect(requests).toHaveLength(6);
  });

  it("rejects an oversized final body after redirects", async () => {
    mockPages({
      "https://example.com/page": () =>
        new Response(null, {
          status: 301,
          headers: { location: "/next" },
        }),
      "https://example.com/next": () => new Response("x".repeat(2_000_001)),
    });
    expect((await readPages(["https://example.com/page"])).blocked).toBe(true);
  });
});
