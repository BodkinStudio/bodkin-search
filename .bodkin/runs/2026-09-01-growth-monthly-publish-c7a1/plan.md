# Goal

Complete BG-0504 by exposing the existing one-way Growth Report publication
boundary as an explicit, authenticated Draft → Published action on the current
monthly summary.

# Scope

1. Add a strict monthly publication request containing only the project routing
   field and the complete server-issued report coordinate: a real completed
   calendar month, valid IANA report timezone and literal version 1.
2. Add a monthly coordinator that resolves that exact project-scoped report,
   refuses missing or mismatched coordinates, and delegates to the existing
   atomic `GrowthReportsService.publishGrowthReport` boundary with the
   authenticated user actor and server clock.
3. Add a project-authorized TanStack server function. Browser input must never
   select a report row ID, actor, publication timestamp, status or report type.
4. Tighten the allowlisted monthly DTO lifecycle: drafts carry no publication
   metadata; published reports require the safe server-stamped `publishedAt`
   timestamp. Continue withholding report/source IDs, hashes, evidence and all
   creator/publisher identity.
5. Add an inline two-step publication confirmation to the existing monthly
   summary. The first click freezes the exact displayed coordinate before
   showing confirmation and disables competing refresh/action work. State
   plainly that publication is final internal approval and does not share or
   send the report. Published reports show the timestamp and no
   publish/unpublish control.
6. Preserve that frozen coordinate through Confirm and any ambiguous response.
   Add a publication-specific exact, read-only status check which never falls
   through to the current build/read state; retry republishes the frozen
   coordinate unchanged. Do not alter the existing build-recovery fallback.
   No render, refresh, remount, cache event or recovery check may publish.
7. Record the authenticated publication boundary and internal-only meaning of
   `Published` in ADR-035.

# Existing substrate to reuse

- `GrowthReportsService.publishGrowthReport` and `GrowthReportsWriter` already
  provide frozen-graph validation, source-manifest validation, atomic
  first-publisher-wins semantics and idempotent repeated publication.
- `GrowthReportsService.getGrowthReportByCoordinate` already resolves the
  natural project/type/period/version coordinate.
- `requireProjectContext` already supplies the authorized project and user.
- The monthly coordinator already validates complete current/adjacent recovery
  months and projects a strict client DTO.
- The Growth UI already uses exact-request locks and explicit check/retry
  recovery for irreversible operations.

# Behavioural decisions

- Publication never builds, regenerates, edits, shares, sends, schedules or
  exposes a report. It only records one-way internal approval metadata on an
  already frozen version.
- The echoed version is the literal `1` supported by the monthly builder. The
  server still fixes report type to `monthly` and resolves the internal ID.
- A current or adjacent stored coordinate can be published so an open tab can
  complete safely across a month or timezone rollover. The echoed timezone
  must equal the stored frozen timezone. Older/nonexistent coordinates fail;
  they never fall through to the current report.
- An already-published report returns its original publisher/time unchanged.
  A draft whose normalized sources were pruned remains readable but the
  existing core boundary refuses publication.
- Confirmation is inline, not modal, so focus can move predictably to the
  confirmation heading and Cancel can restore the trigger.
- Opening confirmation snapshots the displayed coordinate. Even if query cache
  data changes before Confirm, only that snapshot may be published.

# Non-goals

- Report history, print/PDF, public sharing, notifications, client portal,
  narrative AI, scheduling, MCP and capability-role expansion.
- New dependencies, migrations, tables, repositories, auth systems, services
  or provider calls.
- Unpublish, correction, supersession, regeneration or version 2.

# Verification

- Focused schema, coordinator, server-function, render and hook-interaction
  tests, including forged fields, rollover, missing/mismatched coordinate,
  malformed dates/month/timezones, source pruning at the monthly boundary,
  double dispatch, cache rollover while confirming, confirmation focus/cancel,
  authoritative cache replacement, exact lost-response check/retry and
  published read-only state.
- Existing generic publication service/query tests remain green as regression
  evidence for atomicity, source pruning and provider parity.
- `pnpm types:check`, focused/full tests, `pnpm ci:check`, `pnpm build` and
  `git diff --check`.
- Fresh adversarial review and evidence-only acceptance audit. Browser, HTTP,
  CDP, Playwright and screenshots remain prohibited by the user.
