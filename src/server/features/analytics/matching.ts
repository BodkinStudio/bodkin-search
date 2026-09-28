export type NetworkKey = { epoch: string; key: string };
export type EligibleClick = {
  id: string;
  contextId: string;
  projectId: string;
  environment: string;
  destination: string;
  receivedAt: string;
  networkKeys: NetworkKey[];
  attributionPermitted: boolean;
};
export type ProductEntry = {
  projectId: string;
  environment: string;
  destination: string;
  receivedAt: string;
  networkKeys: NetworkKey[];
  attributionPermitted: boolean;
  exactContextId?: string;
};
type AttributionMatch = {
  method: "exact" | "ip_time" | "unattributed";
  clickId?: string;
  candidateGroupCount: number;
  elapsedMs?: number;
  reason?:
    | "no_candidate"
    | "ambiguous"
    | "window_expired"
    | "permission_unavailable";
};

const keyId = (key: NetworkKey) => `${key.epoch}:${key.key}`;
const time = (value: string) => Date.parse(value);

/** Finds an attribution candidate without claiming or mutating anything. */
export function matchAttribution(
  clicks: EligibleClick[],
  entry: ProductEntry,
  maxWindowMs = 24 * 60 * 60 * 1000,
): AttributionMatch {
  if (!entry.attributionPermitted)
    return {
      method: "unattributed",
      candidateGroupCount: 0,
      reason: "permission_unavailable",
    };
  const entryTime = time(entry.receivedAt);
  if (!Number.isFinite(entryTime) || maxWindowMs <= 0)
    return {
      method: "unattributed",
      candidateGroupCount: 0,
      reason: "window_expired",
    };
  const relevant = clicks
    .filter(
      (click) =>
        click.projectId === entry.projectId &&
        click.environment === entry.environment &&
        click.destination === entry.destination &&
        click.attributionPermitted,
    )
    .filter((click) => {
      const elapsed = entryTime - time(click.receivedAt);
      return Number.isFinite(elapsed) && elapsed >= 0 && elapsed <= maxWindowMs;
    });
  const newest = (items: EligibleClick[]) =>
    items.toSorted((a, b) => time(b.receivedAt) - time(a.receivedAt))[0];
  if (entry.exactContextId) {
    const click = newest(
      relevant.filter(
        (candidate) => candidate.contextId === entry.exactContextId,
      ),
    );
    if (click)
      return {
        method: "exact",
        clickId: click.id,
        candidateGroupCount: 1,
        elapsedMs: entryTime - time(click.receivedAt),
      };
  }
  if (!entry.networkKeys.length)
    return {
      method: "unattributed",
      candidateGroupCount: 0,
      reason: "permission_unavailable",
    };
  const entryKeys = new Set(entry.networkKeys.map(keyId));
  const candidates = relevant.filter((click) =>
    click.networkKeys.some((key) => entryKeys.has(keyId(key))),
  );
  if (!candidates.length)
    return {
      method: "unattributed",
      candidateGroupCount: 0,
      reason: "no_candidate",
    };
  const groups = new Map<string, EligibleClick[]>();
  for (const click of candidates)
    groups.set(click.contextId, [
      ...(groups.get(click.contextId) ?? []),
      click,
    ]);
  if (groups.size !== 1)
    return {
      method: "unattributed",
      candidateGroupCount: groups.size,
      reason: "ambiguous",
    };
  const click = newest([...groups.values()][0]);
  return {
    method: "ip_time",
    clickId: click.id,
    candidateGroupCount: 1,
    elapsedMs: entryTime - time(click.receivedAt),
  };
}
