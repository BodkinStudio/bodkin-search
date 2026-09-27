import { describe, expect, it } from "vitest";
import { buildJourneyGraph, type JourneyPage } from "./journey-map";
const page = (
  contextId: string,
  path: string,
  sequence: number,
): JourneyPage => ({
  contextId,
  path,
  sequence,
  host: "example.com",
  receivedAt: "2026-09-15T12:00:00Z",
  organizationId: null,
  customerBinding: "anonymous",
});
describe("observed journey graph", () => {
  it("preserves revisits and never joins transitions between separate visitors", () => {
    const graph = buildJourneyGraph([
      page("a", "/", 0),
      page("a", "/pricing", 1),
      page("a", "/", 2),
      page("b", "/contact", 0),
    ]);
    expect(graph.edges.map((e) => [e.from, e.to, e.count])).toEqual([
      ["example.com/", "example.com/pricing", 1],
      ["example.com/pricing", "example.com/", 1],
    ]);
    expect(graph.nodes.find((n) => n.path === "/")?.visits).toBe(2);
    expect(graph.journeys.get("a")?.map((p) => p.path)).toEqual([
      "/",
      "/pricing",
      "/",
    ]);
  });
  it("counts traversals and unique contexts separately", () => {
    const graph = buildJourneyGraph([
      page("a", "/", 0),
      page("a", "/p", 1),
      page("b", "/", 0),
      page("b", "/p", 1),
    ]);
    expect(graph.edges[0]?.count).toBe(2);
    expect(graph.edges[0]?.contexts.size).toBe(2);
  });
});
