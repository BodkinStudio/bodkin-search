# Required behaviour

1. A deterministic fixture covers exactly 90 calendar dates and produces the same normalized snapshot and detector output on repeat or input reorder. It covers material decline, stable/growing pages, low volume, zero baseline, an absent day and optional site-wide decline.
2. Collection uses existing same-project GSC/key-page services only. Calls use explicit dates, ordered page/date dimensions, `web`, `final` and the existing 1,000-row cap. Pagination advances without overlap and stops on an empty response or the configured 1–25 call cap. Cap exhaustion remains explicit and suppresses Signals.
3. Returned source request/property must match the requested collection across all calls, including optional site context. Dates are valid inclusive Pacific calendar dates, no more than 90 days, with a three-day minimum source lag. Upstream-clamped windows fail; provider/auth errors are not translated to empty traffic.
4. Runtime validation rejects malformed metrics/keys/dates/URLs, duplicate raw URL/day rows, invalid metadata, cross-project key pages, duplicate key-page identities/canonical URLs and unsafe aggregate values. Provider tokens/account email are not copied into the DTO.
5. Mapping reuses the unchanged key-page normalizer. Protocol/www/root-slash aliases map as upstream expects; query strings, non-root trailing slashes, path case and distinct subdomains retain upstream distinctions. Raw URL provenance remains available. A long valid page URL does not overflow the existing Signal reference bounds.
6. Each key page yields a Signal or a specific suppression outcome. No rows, a missing day, capped retrieval, zero/low baseline and immaterial/non-declines cannot produce a decline Signal. Missing rows are never zero-filled. Observed zero-click rows are distinct from absent rows.
7. Detector periods are equal-length, immediately adjacent and contained in the snapshot. Snapshot/project identity and source freshness are validated even when the pure detector is called without the adapter. Malformed windows and foreign snapshot IDs fail before output.
8. Optional site context uses actual date-grouped property totals with matching project/property/window/capture metadata. Material equivalent site-wide declines suppress page-specific signals; a page substantially worse than the site can still emit. Requested-but-incomplete context suppresses output. No optional context is an explicit state, not invented zero totals.
9. Default threshold boundaries are inclusive and configurable values are validated. Critical severity requires both its relative and absolute thresholds. Priority uses commercial weight without altering baseline/current/deltas; null weight means 1. Stable ordering breaks ties by page ID.
10. Every emitted draft passes `recordGrowthSignalSchema`, contains finite exact scalar arithmetic and a canonical capture time, and uses a bounded deterministic evidence digest covering the source observation identity, windows and configuration. Reordered equivalent data retains identity; changed source facts/configuration change provenance. Confidence conveys no claim of causality or calibrated statistical probability.

# Required checks

- Focused DTO, fixture, adapter and detector tests pass, including at least one full 1,000-row page followed by another page/empty response and the configured cap boundary.
- Existing GSC request/range and project-context normalization tests pass.
- `pnpm test:ci`, `pnpm ci:check`, `pnpm build`, `git diff --check` and staged whitespace checks pass.
- Director independently executes verification. Fresh full review returns pass or all findings receive explicit dispositions and the required verified repair/re-review.

# Regression constraints

No existing URL normalization behavior, GSC client/auth behavior, schema/SQL, Growth lifecycle, public API, dependency, scheduling or deployment change. No live Google call, paid provider call or production data mutation during this run.

# Important edge cases

- Leap days, month/year boundaries and Pacific date boundaries; same-day windows are valid when their comparison is the previous day.
- Empty/partial/final data, terminal short page followed by an empty page, exact pagination cap, duplicate rows across pages and a mid-collection property change.
- Multiple raw aliases on one page/day, meaningful query URLs, root vs non-root slash semantics, long URLs and credential-bearing invalid URLs.
- At/below traffic/drop/severity thresholds, weighted ordering ties, invalid or zero thresholds, unsafe sums, future data and a mismatch in requested/returned dimensions, offsets or filters.

# Product / UX requirements

None. This internal slice does not complete the Phase 2 Recommendation/usefulness gate. Tests must not claim that a measured search decline identifies its cause.

# Specialist review requirements

None. Fresh backend/data-integrity review must inspect source coverage, temporal boundaries and provenance. No browser or live-provider test is required.
