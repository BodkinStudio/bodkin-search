import type {
  PromptExplorerSnapshot,
  PromptExplorerSnapshotSummary,
} from "@/types/schemas/ai-search";
import { formatModelLabel } from "@/client/features/ai-search/platformLabels";
import { safeHttpUrl } from "@/server/features/ai-search/safeUrl";

type PromptExplorerSavedSnapshotsProps = {
  projectId: string;
  snapshots: PromptExplorerSnapshotSummary[];
  isLoading: boolean;
  error: string | null;
  selectedIds: [string | null, string | null];
  onOpen: (snapshotId: string) => void;
  onSelect: (slot: 0 | 1, snapshotId: string) => void;
};

export function PromptExplorerSavedSnapshots({
  snapshots,
  isLoading,
  error,
  selectedIds,
  onOpen,
  onSelect,
}: PromptExplorerSavedSnapshotsProps) {
  return (
    <section
      aria-labelledby="saved-explorations-heading"
      className="rounded-lg border border-base-300 bg-base-100 p-5"
    >
      <h2 id="saved-explorations-heading" className="font-semibold">
        Saved explorations
      </h2>
      <p className="mt-1 text-sm text-base-content/65">
        Opening or comparing a saved response uses preserved server results and
        does not run a new prompt. The latest 50 saved explorations are shown.
      </p>
      {isLoading ? (
        <p className="mt-3 text-sm" role="status">
          Loading saved explorations…
        </p>
      ) : error ? (
        <p className="mt-3 text-sm text-error" role="alert">
          {error}
        </p>
      ) : snapshots.length === 0 ? (
        <p className="mt-3 text-sm text-base-content/65">
          No saved explorations yet.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {snapshots.map((snapshot) => (
            <li
              key={snapshot.id}
              className="rounded border border-base-200 p-3"
            >
              <p className="font-medium">{snapshot.prompt}</p>
              <p className="mt-1 text-xs text-base-content/60">
                Saved {new Date(snapshot.capturedAt).toLocaleString()} ·{" "}
                {snapshot.models.map(formatModelLabel).join(", ")}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => onOpen(snapshot.id)}
                >
                  Open saved response
                </button>
                <label className="label cursor-pointer gap-2 py-0 text-xs">
                  <input
                    type="radio"
                    name="snapshot-first"
                    aria-label={`Use ${snapshot.prompt} saved ${new Date(snapshot.capturedAt).toLocaleString()} as earlier snapshot`}
                    className="radio radio-xs"
                    checked={selectedIds[0] === snapshot.id}
                    onChange={() => onSelect(0, snapshot.id)}
                  />{" "}
                  Earlier
                </label>
                <label className="label cursor-pointer gap-2 py-0 text-xs">
                  <input
                    type="radio"
                    name="snapshot-second"
                    aria-label={`Use ${snapshot.prompt} saved ${new Date(snapshot.capturedAt).toLocaleString()} as later snapshot`}
                    className="radio radio-xs"
                    checked={selectedIds[1] === snapshot.id}
                    onChange={() => onSelect(1, snapshot.id)}
                  />{" "}
                  Later
                </label>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function SavedSnapshotMetadata({
  snapshot,
}: {
  snapshot: PromptExplorerSnapshot;
}) {
  return (
    <div className="space-y-2 text-sm">
      <p className="font-medium">{snapshot.prompt}</p>
      <p className="text-base-content/70">
        Saved {new Date(snapshot.fetchedAt).toLocaleString()} · Brand:{" "}
        {snapshot.highlightBrand ?? "None selected"} · Web search:{" "}
        {snapshot.webSearch ? "On" : "Off"} · Country:{" "}
        {snapshot.webSearchCountryCode ?? "Provider default"}
      </p>
      <ul className="space-y-1 text-base-content/70">
        {snapshot.results.map((result) => (
          <li key={result.model}>
            {formatModelLabel(result.model)}:{" "}
            {result.status === "error"
              ? "Unavailable"
              : `${result.modelName ?? "Model identity unknown"} · ${result.cacheProvenance?.source === "fresh" ? "Fresh response" : result.cacheProvenance?.source === "cached" ? "Cached response" : "Cache status unknown"} · Generated ${result.cacheProvenance?.generatedAt ? new Date(result.cacheProvenance.generatedAt).toLocaleString() : "at an unknown time"}`}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PromptExplorerSnapshotComparison({
  first,
  second,
}: {
  first: PromptExplorerSnapshot;
  second: PromptExplorerSnapshot;
}) {
  const compatible =
    first.prompt === second.prompt &&
    first.highlightBrand === second.highlightBrand &&
    first.webSearch === second.webSearch &&
    first.webSearchCountryCode === second.webSearchCountryCode &&
    first.results
      .map((r) => r.model)
      .toSorted()
      .join(",") ===
      second.results
        .map((r) => r.model)
        .toSorted()
        .join(",");
  const earlier = first.fetchedAt <= second.fetchedAt ? first : second;
  const later = earlier === first ? second : first;
  const observation = (value: boolean | null) =>
    !first.highlightBrand
      ? "No brand selected"
      : value === true
        ? "Brand reported"
        : value === false
          ? "Brand not reported"
          : "No brand observation returned";
  const sourceUrls = (
    citations: PromptExplorerSnapshot["results"][number] & {
      status: "success";
    },
  ) =>
    new Set(
      citations.citations
        .map((c) => safeHttpUrl(c.url))
        .filter((url): url is string => Boolean(url)),
    );
  return (
    <section
      aria-labelledby="saved-comparison-heading"
      className="rounded-lg border border-base-300 bg-base-100 p-5 space-y-4"
    >
      <h2 id="saved-comparison-heading" className="font-semibold">
        Saved snapshot comparison
      </h2>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="mb-2 font-medium">Earlier snapshot</h3>
          <SavedSnapshotMetadata snapshot={earlier} />
        </div>
        <div>
          <h3 className="mb-2 font-medium">Later snapshot</h3>
          <SavedSnapshotMetadata snapshot={later} />
        </div>
      </div>
      {first.id === second.id ? (
        <p role="alert">Choose two different snapshots.</p>
      ) : !compatible ? (
        <p className="text-sm text-warning" role="alert">
          These snapshots use different prompt, brand, web-search, country, or
          model settings. A direct comparison is unavailable.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <caption className="sr-only">
              Model observations and cited-source changes between saved
              snapshots
            </caption>
            <thead>
              <tr>
                <th scope="col">Model</th>
                <th scope="col">Earlier</th>
                <th scope="col">Later</th>
                <th scope="col">Cited sources</th>
              </tr>
            </thead>
            <tbody>
              {earlier.results.map((oldResult) => {
                const newResult = later.results.find(
                  (result) => result.model === oldResult.model,
                );
                let unavailable: string | null = null;
                if (
                  oldResult.status !== "success" ||
                  newResult?.status !== "success"
                )
                  unavailable = "Unavailable in one or both saved responses";
                else if (!oldResult.modelName || !newResult.modelName)
                  unavailable =
                    "Model identity unknown; direct comparison unavailable";
                else if (
                  oldResult.modelName !== newResult.modelName ||
                  oldResult.webSearch !== newResult.webSearch
                )
                  unavailable =
                    "Returned model or web-search settings differ; direct comparison unavailable";
                if (
                  unavailable ||
                  oldResult.status !== "success" ||
                  newResult?.status !== "success"
                )
                  return (
                    <tr key={oldResult.model}>
                      <th scope="row">{formatModelLabel(oldResult.model)}</th>
                      <td colSpan={3}>{unavailable}</td>
                    </tr>
                  );
                const oldUrls = sourceUrls(oldResult);
                const newUrls = sourceUrls(newResult);
                const added = [...newUrls].filter((url) => !oldUrls.has(url));
                const removed = [...oldUrls].filter((url) => !newUrls.has(url));
                return (
                  <tr key={oldResult.model}>
                    <th scope="row">{formatModelLabel(oldResult.model)}</th>
                    <td>{observation(oldResult.brandMentioned)}</td>
                    <td>{observation(newResult.brandMentioned)}</td>
                    <td>
                      <p>
                        {added.length} added, {removed.length} removed
                      </p>
                      {added.length + removed.length > 0 ? (
                        <ul className="mt-1 space-y-1">
                          {added.map((url) => (
                            <li key={url}>
                              <a
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="link break-all"
                              >
                                Added: {url}
                              </a>
                            </li>
                          ))}
                          {removed.map((url) => (
                            <li key={url}>
                              <a
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="link break-all"
                              >
                                Removed: {url}
                              </a>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-sm text-base-content/70">
        Brand matches can occur in answers or citations; they do not prove
        endorsement. These differences do not establish that your changes caused
        them. Cached responses may reuse an earlier generation, and saving them
        again is not a fresh independent measurement.
      </p>
    </section>
  );
}
