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

- Pricing is the one flagged page: 308 baseline clicks, 140 current-period clicks, 168 fewer clicks (-54.5%). The existing detector and packet builder produce these values from the fixed fixture.
- Switch from **Needs attention** to **All sample pages**. Inspect stable/growing pages, insufficient baseline traffic, a zero baseline and missing observations.
- Filter by page name or URL. A filter with no matches clears the detail and offers a reset.
- Open **Source details and limitations**. Numeric facts remain separate from current fictional context and a partial selected change log. The change is not presented as the cause of the decline.
- On a narrow screen, selecting a page moves to its detail; **Back to page list** returns to the list.
- Check keyboard access with Tab, Enter and Space through the filter, page buttons, return button and source disclosure. Native control semantics and focus transfer were verified; a complete keyboard-only browser run remains a manual smoke check.

The authenticated route also appears as **Growth preview** in existing project navigation. Its sample is identical for every project and never reads the selected project's provider data or commercial context.

This is an evidence-inspection checkpoint. It does not generate AI insights/recommendations, save runs/actions, schedule collection or establish usefulness on a live site. BG-0205 onward and the full Phase 2 gate remain open.
