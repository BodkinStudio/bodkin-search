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

New checks also save rule-based investigation suggestions for detected declines. Growth does not generate AI diagnoses or schedule collection. Usefulness on a live site and the full Phase 2 gate remain unverified.

## Review an investigation and approve work

1. Select a completed saved check and open Review investigation beneath a decline. A new controlling suggestion contains the observed comparison and investigation steps. A repeated check instead explains that its new evidence is covered by an existing suggestion. Its cause remains unknown.
2. Check the existing Work list, choose a Due date (UTC), then select Approve investigation. Growth records an approved Action with a link to the saved recommendation and signal. It does not edit the website or mark the work implemented.
3. If the suggestion should not become work, choose a Dismissal reason and select Dismiss suggestion. The saved reason is shown and the suggestion becomes read-only.
4. To defer the decision, choose a future Snooze until (UTC) date and select Snooze suggestion. Snoozed suggestions do not wake automatically; select Review now to return one to the proposed review state.
5. Open View work to see an approved action. Open source check selects the check that produced it, including a check outside the latest-20 history list.

The Work section shows up to 50 recent investigations. Approval saves the accepted suggestion, action, due date and approving user in one transaction. Dismissal and snooze update only the saved suggestion; they do not create an Action. Concurrent approval and review share the same saved status/version guard, so only one decision wins. A failed approval transaction leaves the suggestion proposed with no action. Retries reuse one action identity per suggestion and preserve its original date and user. A different due date conflicts with an existing approval. A later check for the same explicit key page still saves its Signal, but reuses the first controlling suggestion instead of creating another one. The repeated check is read-only and does not copy the older rationale, steps or page evidence; it links to Work when the controller has an Action. An uncertain approval keeps its submitted date for Retry approval. An uncertain dismissal, snooze or Review now keeps the exact submitted review for Retry review. Refreshing or reloading reads saved state without submitting again.

An older accepted suggestion with no action needs administrator review. Its original due date and approving user were not stored, so Growth does not offer a retry that could replace them. This release does not repair those older records automatically.

Older completed checks without suggestions stay unchanged. A matching deterministic suggestion created before repeat suppression can be adopted only when that issue is checked again; unrelated same-page suggestions are ignored. The first suppression policy keeps every controller active, including dismissed, resolved and action-backed suggestions. Releasing one after material change or completed measurement remains a later policy decision. Assignment and measurement controls remain separate milestones. The disposable preview has no Google credentials; synthetic checks used for verification come from a local fixture, and do not prove a live collection.

## Finish an investigation

Open View work, then Mark done or update status on an investigation. Done is selected by default. Add an optional note and choose Mark done to record completion in one save, including when the work is still Approved or Ready. Use the status menu to record progress, a blocker or cancellation instead.

Done means the investigation work is finished; it does not edit the website or prove an SEO improvement. The Action keeps its internal implemented state and remains visible for later measurement. History records the actual transition once, without invented intermediate steps or an unrecorded start time. An uncertain response keeps the original status/version/note locked for an exact retry; refreshing or reloading does not submit work.

## Record a page change

View change log opens a manual record of work on configured priority pages. Choose a page, change type and UTC change date, then describe the work and save it. Saved entries are immutable; add a correction as another entry. The latest 50 entries distinguish the change date from the recording date. This workflow needs no Search Console connection and does not establish that a change caused a search result.
