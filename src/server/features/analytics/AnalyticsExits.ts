import { analyticsChannels } from "@/shared/analytics/channels";
import type { AnalyticsQuery } from "@/types/schemas/analytics";
import { AnalyticsRepository as repo } from "./AnalyticsRepository";
import { firstTouch, groupBy } from "./journey-touch";

// Where visits end. A visit is one visitor's activity with no gap longer
// than 30 minutes, and the last page it viewed is where it ended. Each page
// is counted by the visits that saw it, the visits that ended on it, the
// visits that saw nothing else, and the visits that ended on it without
// acting. Shown for every visit and by the channel of the visitor's first
// touch, so a page that loses ad visitors is not hidden by organic ones.

const ACTIONS = new Set(["start_trial", "book_demo", "contact"]);

type Visit = {
  channel: string;
  /** Pages viewed, in order. */
  pages: string[];
  /** A call to action clicked or a sign-up in this visit, or a visitor who became a qualified lead. */
  acted: boolean;
};

function pagesWhereVisitsEnd(visits: Visit[], limit: number) {
  const rows = new Map<
    string,
    {
      path: string;
      visits: number;
      exits: number;
      onlyPage: number;
      leftWithoutActing: number;
    }
  >();
  for (const visit of visits) {
    const seen = new Set(visit.pages);
    const last = visit.pages.at(-1);
    for (const path of seen) {
      const row = rows.get(path) ?? {
        path,
        visits: 0,
        exits: 0,
        onlyPage: 0,
        leftWithoutActing: 0,
      };
      row.visits++;
      if (path === last) {
        row.exits++;
        if (seen.size === 1) row.onlyPage++;
        if (!visit.acted) row.leftWithoutActing++;
      }
      rows.set(path, row);
    }
  }
  return [...rows.values()]
    .map((row) => ({
      ...row,
      exitRate: Math.round((row.exits / row.visits) * 100),
    }))
    .toSorted(
      (a, b) => b.leftWithoutActing - a.leftWithoutActing || b.exits - a.exits,
    )
    .slice(0, limit);
}

export async function exitsReport(q: AnalyticsQuery) {
  const [events, outcomes] = await Promise.all([
    repo.events(q),
    repo.outcomes(q),
  ]);
  const leads = await repo.leadContextIds(q, outcomes);

  const visits: Visit[] = [];
  for (const [contextId, history] of groupBy(events, (e) => e.contextId)) {
    const channel = firstTouch(history)?.channel ?? "Direct";
    for (const session of groupBy(history, (e) => e.sessionId).values()) {
      const pages = session.flatMap((e) =>
        e.name === "page_view" && e.pagePath ? [e.pagePath] : [],
      );
      if (!pages.length) continue;
      visits.push({
        channel,
        pages,
        acted:
          leads.has(contextId) ||
          session.some(
            (e) =>
              e.name === "identity_known" ||
              (e.name === "acquisition_clicked" && ACTIONS.has(e.action ?? "")),
          ),
      });
    }
  }

  return {
    visits: visits.length,
    pages: pagesWhereVisitsEnd(visits, q.limit),
    byChannel: analyticsChannels
      .map((channel) => {
        const own = visits.filter((v) => v.channel === channel);
        return {
          channel,
          visits: own.length,
          pages: pagesWhereVisitsEnd(own, 5),
        };
      })
      .filter((row) => row.visits > 0),
    definitions: {
      visit:
        "One visitor's activity with no gap longer than 30 minutes. A visit still under way counts the page it has reached, and one that began before the period is counted from its first page inside it.",
      exits: "Visits whose last page viewed was this page.",
      exitRate: "Of the visits that saw this page, the share that ended on it.",
      onlyPage: "Visits that ended here having seen no other page.",
      leftWithoutActing:
        "Visits that ended here with no call to action clicked (start trial, book a demo, contact) and no sign-up, by a visitor who did not become a qualified lead in the period.",
    },
    window: repo.windowFor(q),
  };
}
