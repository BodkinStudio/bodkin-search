# Required behaviour

1. The publication request is strict and accepts only `projectId`, a complete
   real calendar month, a valid echoed IANA report timezone and literal version
   1. Partial/malformed coordinates, impossible dates, non-month ranges,
      invalid timezones, other versions and report IDs/types/status, actor fields,
      publication metadata or any unknown field are rejected before service work.
2. The server function uses the authorized context project/user. Browser input
   cannot select the persisted report ID, actor identity, report type,
   publication time or another project.
3. Publication resolves only the exact project-scoped monthly version-1
   coordinate, accepts the existing current/adjacent recovery window, requires
   the echoed timezone to match the frozen report, and never builds or falls
   through to another period when missing or stale.
4. The coordinator delegates to the existing core publisher with
   `actorType: user`, the authorized user ID and server time, then returns the
   strict monthly DTO. Repeated and concurrent publication preserve the first
   publisher/time and return the persisted winner.
5. A draft still requires its complete live normalized source manifest at
   publication time. The monthly coordinator propagates that core conflict and
   leaves the frozen draft readable and unchanged. An already-published report
   remains readable and exactly retryable through the monthly boundary with its
   original timestamp after later source pruning.
6. Draft DTOs contain no publication metadata. Published DTOs require one valid
   `publishedAt` timestamp. Neither lifecycle exposes report/source IDs,
   creator/publisher identity, hashes, evidence or internal builder metadata.
7. A draft renders one explicit `Publish summary` trigger. Its first activation
   snapshots that displayed period/timezone/version and only opens an inline,
   labelled confirmation explaining that publication is final, cannot be
   undone and does not share the report externally. Refresh and competing
   actions remain disabled while that confirmation owns the snapshot.
8. Confirmation receives programmatic focus; Cancel sends no mutation and
   restores focus to the trigger. Confirm dispatches once, disables competing
   refresh/action work and announces pending state accessibly.
9. Successful publication replaces the existing monthly-query cache with the
   authoritative published DTO, clears the exact-request lock, focuses a
   visible success status and offers no publish or unpublish control. The
   published timestamp is shown in the report metadata.
10. An ambiguous failure retains the exact submitted coordinate and focuses a
    visible alert. `Check saved summary` uses a publication-specific exact
    read-only boundary with no current-period fallback. Only the same published
    coordinate/version confirms success; a draft/missing/check failure retains
    the lock; `Retry same publication` sends the identical request.
11. Rendering, remounting, refreshing, opening/cancelling confirmation and
    checking recovery never publish automatically.
12. No dependency, migration, provider call, scheduled work, public route,
    share token, notification, MCP tool or new authorization system is added.
13. ADR-035 records that publication is authenticated, project-scoped,
    one-way internal approval of an already frozen report; it neither builds,
    regenerates, shares, sends nor externally exposes the report.

# Required checks

- Schema tests cover draft/published lifecycle metadata; impossible dates,
  incomplete/non-month periods, invalid IANA timezones and non-literal versions;
  and rejection of every privileged/unknown publication field.
- Coordinator tests cover delegation, safe projection, missing report,
  timezone mismatch, adjacent rollover, stale coordinate, idempotent winner
  recovery, source-pruned draft conflict and already-published/pruned retry with
  the original timestamp, without source/build work.
- Server-function tests prove authorized project/user override browser routing
  and reject forged actor/report fields before calling the service.
- Static render tests cover Draft, confirmation, pending and Published states,
  exact no-share copy, focus semantics, timestamp and absent unpublish action.
- Hook-interaction tests cover read-only render/refresh, snapshot-at-open,
  cache/rollover change before Confirm, two-step dispatch, duplicate prevention,
  Cancel focus restoration, success/cache/focus, ambiguous failure, exact
  check/retry, retained lock and published no-op.
- Documentation review confirms the ADR's internal-only publication semantics
  and the separation from build recovery, sharing and external delivery.
- Existing D1 and conditional Postgres generic publication tests remain green.
- Types, full tests, `pnpm ci:check`, production build and whitespace pass.

# Regression constraints

- Build/recovery behaviour, frozen report content, source selection, section
  ordering and existing Report writer semantics remain unchanged.
- Growth Work, Change Log, Measurement and other OpenSEO surfaces retain their
  APIs, query keys and behaviour.

# Important edge cases

- Double click and two users publishing concurrently.
- Lost response before/after the database commit.
- Month or report-timezone rollover while a draft remains open.
- Missing, deleted or cross-project report coordinate.
- Source deletion immediately before/during draft publication and after
  successful publication.
- Server clock earlier than report generation and malformed stored graphs.
