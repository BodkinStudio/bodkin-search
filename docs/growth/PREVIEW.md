# Growth sample preview

Run from the repository after installing its existing dependencies:

```sh
node scripts/growth-preview.mjs
```

Open [the local Growth preview](http://127.0.0.1:3217/p/growth-preview/growth) once Vite is ready. If that port is occupied, choose another with `--port 3218`. The launcher does not stop an existing server.

The launcher copies only Git-tracked application source and allowed assets into a temporary directory, links the installed packages and migrates a disposable local D1 database. Stage new source files before starting a preview; untracked files are deliberately excluded. It seeds a local sample workspace without a domain or provider connections. It does not copy `.env`, `.dev.vars`, the normal `.wrangler` database or cloud credentials. Package caches stay local to the preview. No dependencies are installed.

The server binds to `127.0.0.1` using OpenSEO's existing trusted-local `local_noauth` mode. Do not expose or tunnel this server. Stop with Ctrl+C to remove the disposable workspace and data. Restart after source edits because the preview runs from a snapshot.

The existing app may show a provider-key setup prompt. Dismiss it; no key is needed for Growth preview. Do not connect providers or create real project content in this disposable app.

The snapshot preserves the repository's ignore rules and excludes its own runtime files from Tailwind's source scan. Database and local worker-registry updates must not reload the page or reset its filters.

## What to check

Open **View synthetic sample evidence** to inspect the fixed demonstration:

- Pricing is the one flagged page: 308 baseline clicks, 140 current-period clicks, 168 fewer clicks (-54.5%). The existing detector and packet builder produce these values from the fixed fixture.
- Switch from **Needs attention** to **All sample pages**. Inspect stable/growing pages, insufficient baseline traffic, a zero baseline and missing observations.
- Filter by page name or URL. A filter with no matches clears the detail and offers a reset.
- Open **Source details and limitations**. Numeric facts remain separate from current fictional context and a partial selected change log. The change is not presented as the cause of the decline.
- On a narrow screen, selecting a page moves to its detail; **Back to page list** returns to the list.
- Check keyboard access with Tab, Enter and Space through the filter, page buttons, return button and source disclosure. Native control semantics and focus transfer were verified; a complete keyboard-only browser run remains a manual smoke check.

## Saved priority-page checks

The authenticated **Growth** route also includes a project-local **Check priority pages** section. It is separate from the sample preview.

- It reads only saved setup and the most recent 20 saved checks when the page opens. Opening, refreshing, selecting history, and expanding evidence do not call Google.
- A user must explicitly choose **Run check**. The server compares adjacent 28-day Search Console windows ending at least three Pacific calendar days before collection, persists the run and any detected declines, and keeps incomplete/capped results labelled as limited rather than healthy.
- Search Console must be connected and at least one key page must be configured in project context. A failed or interrupted run is never resumed; start a new check to try again. Retrying an uncertain submission reuses its request identity and replays the saved run instead of recollecting.
- An unresolved request is remembered per project in this tab's session storage, so reloading offers **Retry previous request**. It is cleared after a known terminal response or replaced by **Start new check**. If session storage is unavailable, no check is dispatched.
- Saved evidence preserves the numeric observation and provenance. Current project context is displayed as current context, not a historical snapshot. The fixed example.com sample remains synthetic and never writes into project storage.

The disposable preview has no Google credentials, so it can only demonstrate the setup and saved-result UI with local state. A live Google collection remains an external verification step.

This checkpoint saves runs and detected signals. It does not generate AI insights/recommendations, create actions, schedule collection or establish usefulness on a live site. BG-0205 onward and the full Phase 2 gate remain open.
