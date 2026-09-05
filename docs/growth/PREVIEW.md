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

## Find ranking opportunities

The same authenticated card has a separate **Find ranking opportunities**
action. It reads two adjacent final 28-day Search Console windows and looks for
queries on configured priority pages that have a real matching baseline, at
least 50 current impressions and an average current position from 5 through 20.
The source read is bounded; an inventory that reaches its cap is labelled
incomplete and cannot create a suggestion.

A qualifying query saves its preceding/current position, impressions and clicks
as one reviewable rule-based opportunity. Open it under **Opportunities**, then
open **Review investigation** to inspect the exact saved query, page, site and
both periods before deciding whether to approve work. Growth does not claim a
cause or recommend a website edit from these numbers alone.

At most three suggestions are considered per run. Repeating the same
query/page opportunity saves the new facts but links them to the existing
suggestion instead of creating duplicate work. The retry key is independent of
the decline check, and ranking-opportunity Runs are deliberately not mixed into
the saved decline history. The disposable preview has no Google credentials,
so this action requires a connected real project for end-to-end verification.

## Find low-CTR opportunities

The next row, **Find low-CTR opportunities**, looks for queries on configured
priority pages that still rank from position 1 through 4 but are attracting a
meaningfully smaller share of clicks than in the preceding 28 days. Both final
28-day periods must contain at least 100 impressions for the exact query/page
pair, the average position cannot have worsened, and CTR must have fallen by at
least one percentage point and 25% relative to its own earlier rate.

This project-specific comparison deliberately avoids a generic expected-CTR
curve. A qualifying query saves CTR, clicks, impressions and average position
as one four-fact evidence set. Open the suggestion under **Opportunities** to
compare both periods and decide whether the page and search results warrant an
investigation. The detector does not claim that a title, snippet or page change
caused the decline.

The check considers at most three candidates, fails closed when its bounded
Search Console inventory is incomplete, and reuses an unresolved suggestion
for the same query and exact priority page rather than creating duplicate Work.
It has its own retry identity and does not appear in the saved decline-check
history. Like ranking opportunities, it needs a connected real project for a
live end-to-end result.

## Find persistent rank drops

**Find persistent rank drops** reads saved rank-tracking history. It does not
start a rank check or spend provider credits. A tracked keyword qualifies only
when the latest four completed full checks contain the same keyword and device,
the first check ranked a configured priority page, and each of the next three
checks is at least three positions worse than that baseline.

The check treats a missing rank as outside the configuration's tracked depth.
The saved evidence keeps that value as “outside top N” rather than assigning an
exact rank. Open a saved suggestion under **Opportunities** to inspect the
keyword, device, priority page and all four check dates before deciding whether
to investigate. The detector reports the observed sequence without claiming a
cause.

At most three drops are considered per run. A project needs a priority page, an
active rank-tracking configuration and four completed full checks. Subset and
failed runs do not count. Repeating the same unresolved configuration, keyword,
device and page combination links the new Signal to the existing suggestion.
The action has its own retry identity and works without a Search Console
connection.

## Find new critical audit issues

**Find new critical audit issues** compares saved site audits. It does not start
a crawl or use audit capacity. The latest completed audit is compared with the
latest earlier completed audit that used the same crawl start and page limit.
You need that compatible pair before the check can determine what is new.

The detector looks only at critical audit issues. Missing titles, server errors
and blocked pages are identified by issue type and affected page. Broken
internal links also include the broken target, so separate destinations on one
page stay separate. Status-code changes alone do not create another issue.

At most three new issues are considered per run. Open a saved suggestion under
**Opportunities** to see the affected page, broken target when applicable, and
both audit dates. The review path reloads the saved audits and confirms that the
issue was absent from the baseline. Repeating the same unresolved issue links
the new Signal to its existing suggestion instead of creating duplicate Work.
The check has its own retry identity and does not require Search Console, rank
tracking or configured priority pages.

## Saved opportunities

The **Opportunities** section appears directly below the monthly summary. It
shows the top 20 unresolved saved, rule-based Recommendations for the current
project. Expand an entry to read its rationale, saved affected targets and
bounded next steps. This is a saved operating record, not a new live discovery
or a prediction of SEO outcome.

Proposed and snoozed entries with a qualified controller source can open the
existing **Review investigation** disclosure. Use that disclosure for approval,
dismissal, snoozing or returning a snoozed item to review. Accepted entries
without an Action, and older entries with no qualified review source, remain
useful read-only records. If more saved entries exist, the section says that
lower-priority entries are not shown yet; pagination is deliberately deferred.

## Review an investigation and approve work

1. Select a completed saved check and open Review investigation beneath a decline. A new controlling suggestion contains the observed comparison and investigation steps. A repeated check instead explains that its new evidence is covered by an existing suggestion. Its cause remains unknown.
2. Check the existing Work list, choose a Due date (UTC), then select Approve investigation. Growth records an approved Action with a link to the saved recommendation and signal. It does not edit the website or mark the work implemented.
3. If the suggestion should not become work, choose a Dismissal reason and select Dismiss suggestion. The saved reason is shown and the suggestion becomes read-only.
4. To defer the decision, choose a future Snooze until (UTC) date and select Snooze suggestion. Snoozed suggestions do not wake automatically; select Review now to return one to the proposed review state.
5. Open View work to see an approved action. Open source check selects the check that produced it, including a check outside the latest-20 history list.

The Work section shows up to 50 recent investigations. Approval saves the accepted suggestion, action, due date and approving user in one transaction. Dismissal and snooze update only the saved suggestion; they do not create an Action. Concurrent approval and review share the same saved status/version guard, so only one decision wins. A failed approval transaction leaves the suggestion proposed with no action. Retries reuse one action identity per suggestion and preserve its original date and user. A different due date conflicts with an existing approval. A later check for the same explicit key page still saves its Signal, but reuses the first controlling suggestion instead of creating another one. The repeated check is read-only and does not copy the older rationale, steps or page evidence; it links to Work when the controller has an Action. An uncertain approval keeps its submitted date for Retry approval. An uncertain dismissal, snooze or Review now keeps the exact submitted review for Retry review. Refreshing or reloading reads saved state without submitting again.

An older accepted suggestion with no action needs administrator review. Its original due date and approving user were not stored, so Growth does not offer a retry that could replace them. This release does not repair those older records automatically.

Older completed checks without suggestions stay unchanged. A matching deterministic suggestion created before repeat suppression can be adopted only when that issue is checked again; unrelated same-page suggestions are ignored. Dismissed, resolved and unfinished action-backed suggestions remain active controllers. Once the exact generated Work has been evaluated, a later saved decline can start one new investigation cycle; the prior controller and its suppressed evidence remain visible history. Assignment and measurement controls remain separate milestones. The disposable preview has no Google credentials; synthetic checks used for verification come from a local fixture, and do not prove a live collection.

## Finish an investigation

Open View work, then Mark done or update status on an investigation. Done is selected by default. Add an optional note and choose Mark done to record completion in one save, including when the work is still Approved or Ready. Use the status menu to record progress, a blocker or cancellation instead.

Done means the investigation work is finished; it does not edit the website or prove an SEO improvement. The Action keeps its internal implemented state and remains visible for later measurement. History records the actual transition once, without invented intermediate steps or an unrecorded start time. An uncertain response keeps the original status/version/note locked for an exact retry; refreshing or reloading does not submit work.

## Record a page change

View change log opens a manual record of work on configured priority pages. Choose a page, change type and UTC change date, then describe the work and save it. Saved entries are immutable; add a correction as another entry. The latest 50 entries distinguish the change date from the recording date. This workflow needs no Search Console connection and does not establish that a change caused a search result.

## Monthly review boundary

The Monthly review card can prepare one explicit review attempt by composing the existing priority-page check, current due-Measurement queue and immutable monthly report builder. The card asks for inline confirmation before dispatch. Each attempt has its own browser-session retry key and `monthly_review` Run. An uncertain request can be replayed exactly or replaced only through the separate Start new review action. The detector remains a separate child Run, due Measurements remain human review work, and only an exact-period report counts as a successful report phase.

The same coordinator now runs unattended for Growth-enabled projects with monthly cadence. An hourly Worker check claims the project's configured report day in its report timezone and starts a retryable Workflow for the previous complete month. Scheduled Runs use a separate saved identity, and any draft created by them records system provenance. A monotonic settings revision and repeated archive checks prevent stale work from starting after a concurrent settings edit, disable or project archive.

The result shows the authoritative review period and status. A fresh manual response also shows the priority-page check, due-Measurement and monthly-summary outcomes; an exact replay deliberately shows only the saved coordinator status rather than reconstructing phase detail from current state. Scheduling does not evaluate Measurements, publish or share a report, invoke the separate ranking-opportunity, low-CTR, tracked-rank, audit or measurement-due checks, or generate AI interpretation. Docker deployments still need an external scheduled-event source.

## Weekly review boundary

Growth-enabled projects with weekly cadence now receive an unattended internal
review on their configured ISO weekday in the report timezone. The compact
result summarizes saved Measurement gains and losses from the preceding seven
complete local dates, newly controlled striking-distance opportunities,
currently blocked or overdue Work, currently due Measurements and one
deterministic focus.

The weekly review has its own persisted cursor, Workflow identity and
`weekly_review` Run. It reads saved evidence only: it does not call providers,
spend credits, evaluate Measurements, create Work, publish a report or send a
notification. Its Action and due-Measurement counts are current at execution
time rather than a frozen historical snapshot. The disposable preview has no
weekly-review UI; verify the scheduling and result contracts through the
automated repository tests.

## Inspect recent Growth runs

Open **Run inspector** near the end of the authenticated Growth page to load the
latest 20 saved Runs for that project. The collapsed developer view shows each
Run's status, period, duration, trigger, detector and analysis versions, saved
failure details, provider cost in stored minor units and distinct counts of
Signals, Insights, Recommendations and linked Actions. Linked Actions may have
been approved after the source Run completed.

The inspector is read-only and project-scoped. It does not expose evidence
references, cadence identities, prompts or provider payloads, and opening it
does not start or resume work. When more than 20 Runs exist, the view says that
older history is not shown.

The inspector also shows **Daily-monitor calibration** from up to the latest 200
investigation Recommendations created by the current priority-page click
decline, persistent tracked-rank drop and new critical audit issue detector
versions. It reports the bounded cohort overall and by persisted detector
version, including classification coverage: classified decisions divided by
the whole sampled cohort. Coverage is unavailable until a sample exists.

The observed signal-quality false-positive rate uses accepted investigations
and dismissals marked “irrelevant”, “insufficient evidence” or “wrong
diagnosis”. Other dismissal reasons, unresolved reviews and reconciled
Recommendations are shown separately and do not enter that rate. This is a
human-review proxy rather than ground truth; the view deliberately does not set
an acceptable threshold or declare the daily monitor ready. When more than 200
eligible Recommendations exist, it says that older outcomes are outside the
cohort.

The same inspector includes a separate **Monthly-cycle evidence** dossier. It
shows at most the six most recently started `growth-monthly-review-v1` Runs,
without collapsing retries that share a reporting period. For every visible
row it reads only the exact `priority-page-check:monthly_<parent-run-id>` child
Run, the exact project-scoped monthly report for the same period at version 1,
and the saved review outcomes for that child Run's Recommendations. It states
how many distinct monthly periods are visible and whether the latest two are
calendar-adjacent; fewer than two periods is explicitly insufficient evidence.

This is persisted operational evidence, not a Gate 4 pass/fail decision. A
missing child, report or Recommendation is shown as absent, and the saved data
does not capture substantial manual preparation. Human review and live
validation remain required.
