import { useId, useMemo, useState } from "react";
import { GitBranch, ArrowRight } from "lucide-react";
import { buildJourneyGraph, type JourneyPage } from "./journey-map";

export function JourneyMap({
  pages,
  onOpenJourney,
}: {
  pages: JourneyPage[];
  onOpenJourney: (contextId: string) => void;
}) {
  const [selected, setSelected] = useState("");
  const [customersOnly, setCustomersOnly] = useState(false);
  const marker = useId().replaceAll(":", "");
  const eligible = useMemo(
    () =>
      pages.filter(
        (p) =>
          !customersOnly || (p.customerBinding === "exact" && p.organizationId),
      ),
    [pages, customersOnly],
  );
  const graph = useMemo(() => buildJourneyGraph(eligible), [eligible]);
  const selectedPages = graph.journeys.get(selected);
  const selection = useMemo(
    () => buildJourneyGraph(selectedPages ?? []),
    [selectedPages],
  );
  const selectedNodes = new Set(selection.nodes.map((n) => n.id));
  const selectedEdges = new Set(selection.edges.map((e) => e.id));
  const visibleNodes = graph.nodes.slice(0, 48);
  const columns = new Map<number, number>();
  const positions = new Map(
    visibleNodes.map((node) => {
      const col = Math.min(node.firstStep, 4);
      const row = columns.get(col) ?? 0;
      columns.set(col, row + 1);
      return [node.id, { x: 30 + col * 230, y: 55 + row * 100 }];
    }),
  );
  const width = Math.max(650, ...[...positions.values()].map((p) => p.x + 220));
  const height = Math.max(
    300,
    ...[...positions.values()].map((p) => p.y + 100),
  );
  if (!graph.nodes.length)
    return (
      <div className="py-16 text-center">
        <GitBranch className="mx-auto mb-3 size-7 text-base-content/60" />
        <h3 className="font-medium">No observed page paths yet</h3>
        <p className="mt-2 text-sm text-base-content/70">
          Page views appear here after permitted tracking begins.
        </p>
      </div>
    );
  return (
    <section className="space-y-5" aria-labelledby="journey-map-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="journey-map-title" className="text-lg font-semibold">
            The paths through your website
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-base-content/70">
            {graph.journeys.size} observed journeys across {graph.nodes.length}{" "}
            pages. Thicker lines mean more transitions; arrows show direction.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="checkbox checkbox-sm"
            checked={customersOnly}
            onChange={(e) => {
              setCustomersOnly(e.target.checked);
              setSelected("");
            }}
          />
          Verified customer paths only
        </label>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-xs font-medium">
          Highlight a journey
          <select
            className="select select-sm w-64"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">All observed journeys</option>
            {[...graph.journeys].map(([id, events]) => (
              <option key={id} value={id}>
                {events[0]?.organizationId ??
                  `Visitor ${id.slice(0, 6).toUpperCase()}`}{" "}
                · {events.length} steps
              </option>
            ))}
          </select>
        </label>
        {selected && (
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => onOpenJourney(selected)}
          >
            Inspect timeline <ArrowRight className="size-4" />
          </button>
        )}
        <p className="text-xs text-base-content/70">
          Observed pages only · inference never joins personal browsing
          histories
        </p>
      </div>
      <div
        className="overflow-auto rounded-lg border border-base-300 bg-base-200/30"
        tabIndex={0}
        aria-label="Website journey map; scroll to explore. Ordered paths and transition table below."
      >
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`Website map with ${visibleNodes.length} pages and directional transitions`}
        >
          <defs>
            <marker
              id={marker}
              markerWidth="7"
              markerHeight="7"
              refX="6"
              refY="3.5"
              orient="auto"
            >
              <path d="M0 0L7 3.5L0 7" fill="currentColor" />
            </marker>
          </defs>
          {graph.edges.map((edge) => {
            const from = positions.get(edge.from);
            const to = positions.get(edge.to);
            if (!from || !to) return null;
            const backwards = to.x <= from.x;
            const d =
              edge.from === edge.to
                ? `M${from.x + 180},${from.y + 20} C${from.x + 240},${from.y - 45} ${from.x + 50},${from.y - 45} ${from.x + 90},${from.y}`
                : backwards
                  ? `M${from.x + 90},${from.y + 56} C${from.x + 90},${from.y + 95} ${to.x + 90},${to.y + 95} ${to.x + 90},${to.y + 56}`
                  : `M${from.x + 185},${from.y + 28} C${from.x + 220},${from.y + 28} ${to.x - 35},${to.y + 28} ${to.x - 5},${to.y + 28}`;
            const highlighted = !selected || selectedEdges.has(edge.id);
            return (
              <path
                key={edge.id}
                d={d}
                fill="none"
                className={
                  highlighted ? "text-primary" : "text-base-content/20"
                }
                stroke="currentColor"
                strokeWidth={Math.min(7, 1.5 + Math.log2(edge.count))}
                opacity={highlighted ? 0.65 : 0.2}
                markerEnd={`url(#${marker})`}
              >
                <title>
                  {edge.from} → {edge.to}: {edge.count} transitions in{" "}
                  {edge.contexts.size} journeys
                </title>
              </path>
            );
          })}
          {visibleNodes.map((node) => {
            const p = positions.get(node.id)!;
            const active = !selected || selectedNodes.has(node.id);
            return (
              <g
                key={node.id}
                transform={`translate(${p.x},${p.y})`}
                opacity={active ? 1 : 0.45}
              >
                <rect
                  width="185"
                  height="56"
                  rx="7"
                  className="fill-base-100 stroke-base-300"
                  strokeWidth="1"
                />
                <text
                  x="12"
                  y="22"
                  className="fill-base-content text-xs font-medium"
                >
                  {node.path.length > 24
                    ? `${node.path.slice(0, 22)}…`
                    : node.path}
                </text>
                <text x="12" y="42" className="fill-base-content/70 text-xs">
                  {node.visits} views · {node.contexts.size} journeys
                </text>
                <title>{node.id}</title>
              </g>
            );
          })}
        </svg>
      </div>
      {graph.nodes.length > visibleNodes.length && (
        <p className="text-xs text-base-content/70">
          Map shows the first 48 pages; the complete observed transitions are in
          the table.
        </p>
      )}
      {selectedPages && (
        <div>
          <h3 className="mb-3 text-sm font-semibold">Every step, in order</h3>
          <ol className="flex flex-wrap gap-2">
            {selectedPages.map((page, i) => (
              <li
                key={`${page.receivedAt}-${page.sequence}-${i}`}
                className="flex items-center gap-2 text-sm"
              >
                <span className="rounded border border-base-300 px-3 py-2">
                  <span className="mr-2 text-base-content/60">{i + 1}.</span>
                  {page.path}
                </span>
                {i < selectedPages.length - 1 && (
                  <ArrowRight className="size-3 text-base-content/60" />
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
      <details className="rounded-lg border border-base-300">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
          Transition table · accessible map data
        </summary>
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>From page</th>
                <th>To page</th>
                <th className="text-right">Transitions</th>
                <th className="text-right">Journeys</th>
              </tr>
            </thead>
            <tbody>
              {graph.edges.map((e) => (
                <tr key={e.id}>
                  <td>{e.from}</td>
                  <td>{e.to}</td>
                  <td className="text-right tabular-nums">{e.count}</td>
                  <td className="text-right tabular-nums">{e.contexts.size}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
