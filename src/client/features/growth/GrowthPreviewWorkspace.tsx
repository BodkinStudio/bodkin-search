import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import type { GrowthPreview } from "@/types/schemas/growth-preview";
import { GrowthPreviewDetail } from "./GrowthPreviewDetail";
import {
  describeGrowthPreviewPage,
  filterGrowthPreviewPages,
  formatGrowthPreviewDate,
} from "./GrowthPreviewPresentation";

export function GrowthPreviewWorkspace({ data }: { data: GrowthPreview }) {
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const handledFocusRequest = useRef(0);
  const listHeading = useRef<HTMLHeadingElement>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const pages = filterGrowthPreviewPages(data.pages, showAll, query);
  const selected =
    pages.find((page) => page.keyPageId === selectedId) ?? pages[0];
  const flaggedCount = data.pages.filter(
    (page) => page.status === "flagged",
  ).length;

  useEffect(() => {
    if (focusRequest === handledFocusRequest.current) return;
    handledFocusRequest.current = focusRequest;
    detailHeading.current?.focus({ preventScroll: true });
    detailHeading.current?.scrollIntoView({ block: "start" });
  }, [focusRequest]);

  const backToList = () => {
    listHeading.current?.focus({ preventScroll: true });
    listHeading.current?.scrollIntoView({ block: "start" });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-base-content/70">
        Comparing {formatGrowthPreviewDate(data.currentWindow.startDate)} to{" "}
        {formatGrowthPreviewDate(data.currentWindow.endDate)} with the preceding
        comparison period. Search Console calendar: Pacific time.
      </p>

      <div className="grid items-start gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <section
          aria-labelledby="growth-pages-title"
          className="min-w-0 rounded-lg border border-base-300 bg-base-100"
        >
          <div className="space-y-3 border-b border-base-300 p-4">
            <h2
              id="growth-pages-title"
              ref={listHeading}
              tabIndex={-1}
              className="scroll-mt-4 text-base font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
            >
              Priority pages
            </h2>
            <div>
              <label htmlFor="growth-page-scope" className="mb-1 block text-sm">
                Show
              </label>
              <select
                id="growth-page-scope"
                className="select select-sm w-full"
                value={showAll ? "all" : "flagged"}
                onChange={(event) => setShowAll(event.target.value === "all")}
              >
                <option value="flagged">
                  Needs attention ({flaggedCount})
                </option>
                <option value="all">
                  All sample pages ({data.pages.length})
                </option>
              </select>
            </div>
            <div>
              <label
                htmlFor="growth-page-filter"
                className="mb-1 block text-sm"
              >
                Filter pages
              </label>
              <div className="relative">
                <Search
                  size={15}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-2.5 z-10 text-base-content/60"
                />
                <input
                  id="growth-page-filter"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Page name or URL"
                  className="input input-sm w-full pl-9"
                />
              </div>
            </div>
          </div>
          <p role="status" className="px-4 pt-3 text-xs text-base-content/70">
            {pages.length} {pages.length === 1 ? "page" : "pages"} shown
          </p>
          <ul className="divide-y divide-base-300 px-2 pb-2">
            {pages.map((page) => (
              <li key={page.keyPageId}>
                <button
                  type="button"
                  aria-pressed={selected?.keyPageId === page.keyPageId}
                  onClick={() => {
                    setSelectedId(page.keyPageId);
                    setFocusRequest((value) => value + 1);
                  }}
                  className={`my-1 flex w-full items-start justify-between gap-3 rounded-md p-3 text-left hover:bg-base-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                    selected?.keyPageId === page.keyPageId
                      ? "bg-base-200 ring-1 ring-inset ring-primary/50"
                      : ""
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">
                      {page.label}
                    </span>
                    <span className="mt-1 block text-xs text-base-content/70">
                      {describeGrowthPreviewPage(page).label}
                    </span>
                    {page.status === "flagged" ? (
                      <span className="mt-1 block text-sm font-medium tabular-nums">
                        {page.evidence.observation.deltaPercent.toFixed(1)}%
                        clicks
                      </span>
                    ) : null}
                  </span>
                  <ArrowRight
                    size={16}
                    aria-hidden="true"
                    className="mt-0.5 shrink-0"
                  />
                </button>
              </li>
            ))}
          </ul>
        </section>

        {selected ? (
          <section
            aria-labelledby="growth-detail-title"
            className="min-w-0 rounded-lg border border-base-300 bg-base-100 p-4 sm:p-6"
          >
            <button
              type="button"
              className="btn btn-ghost btn-sm -ml-2 mb-4"
              onClick={backToList}
            >
              <ArrowLeft size={14} aria-hidden="true" />
              Back to page list
            </button>
            <GrowthPreviewDetail
              key={selected.keyPageId}
              page={selected}
              data={data}
              headingRef={detailHeading}
            />
          </section>
        ) : (
          <section
            aria-label="No matching pages"
            className="rounded-lg border border-base-300 bg-base-100 p-6"
          >
            <h2 className="text-lg font-semibold">
              No pages match this filter
            </h2>
            <p className="mt-2 text-sm text-base-content/70">
              Clear the filter and show all sample pages to inspect their
              evidence and data limits.
            </p>
            <button
              type="button"
              className="btn btn-sm mt-4"
              onClick={() => {
                setQuery("");
                setShowAll(true);
              }}
            >
              Reset filters
            </button>
          </section>
        )}
      </div>
    </div>
  );
}
