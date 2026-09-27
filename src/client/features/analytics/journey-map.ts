export interface JourneyPage {
  contextId: string;
  receivedAt: string;
  sequence: number;
  host: string | null;
  path: string | null;
  organizationId: string | null;
  customerBinding: "exact" | "anonymous";
}
export function buildJourneyGraph(pages: JourneyPage[]) {
  const journeys = new Map<string, JourneyPage[]>();
  for (const page of pages) {
    if (!page.path || !page.host) continue;
    const list = journeys.get(page.contextId) ?? [];
    list.push(page);
    journeys.set(page.contextId, list);
  }
  const nodes = new Map<
    string,
    {
      id: string;
      host: string;
      path: string;
      visits: number;
      contexts: Set<string>;
      firstStep: number;
    }
  >();
  const edges = new Map<
    string,
    {
      id: string;
      from: string;
      to: string;
      count: number;
      contexts: Set<string>;
    }
  >();
  for (const [contextId, events] of journeys) {
    const ordered = events.toSorted(
      (a, b) =>
        a.receivedAt.localeCompare(b.receivedAt) || a.sequence - b.sequence,
    );
    journeys.set(contextId, ordered);
    let previous: string | null = null;
    ordered.forEach((page, step) => {
      const id = `${page.host}${page.path}`;
      const node = nodes.get(id) ?? {
        id,
        host: page.host!,
        path: page.path!,
        visits: 0,
        contexts: new Set<string>(),
        firstStep: step,
      };
      node.visits++;
      node.contexts.add(contextId);
      node.firstStep = Math.min(node.firstStep, step);
      nodes.set(id, node);
      if (previous) {
        const edgeId = JSON.stringify([previous, id]);
        const edge = edges.get(edgeId) ?? {
          id: edgeId,
          from: previous,
          to: id,
          count: 0,
          contexts: new Set<string>(),
        };
        edge.count++;
        edge.contexts.add(contextId);
        edges.set(edgeId, edge);
      }
      previous = id;
    });
  }
  return {
    nodes: [...nodes.values()].toSorted(
      (a, b) =>
        a.firstStep - b.firstStep ||
        b.visits - a.visits ||
        a.id.localeCompare(b.id),
    ),
    edges: [...edges.values()],
    journeys,
  };
}
