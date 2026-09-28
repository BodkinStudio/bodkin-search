# Goal

Harden the monthly Growth summary at the three boundaries discovered after the
parent run's repair cap: skipped local midnights, private email material in URL
facts and provider-dependent cap tie ordering.

# Scope

1. Replace the unchecked iterative local-midnight conversion with one shared,
   bounded deterministic search for the earliest UTC instant whose IANA
   calendar date is the requested date or the first existing date after it.
   Use that function for period start, period end-exclusive, cutoff start,
   next-month start and next-month end-exclusive. Keep all source membership and
   due-date comparisons as UTC half-open bounds.
2. Withhold direct Action or Change URL facts when their raw or decoded URL
   material contains an email address, while preserving the existing protocol,
   userinfo, credential, query and fragment protections.
3. Source entity IDs are server-created ASCII UUIDs. Before every `cap + 1`
   limit, apply `COLLATE BINARY` in SQLite/D1 and `COLLATE "C"` in Postgres to
   the final ID term; both match the builder's JavaScript code-unit comparator
   over that canonical ASCII domain. Fetch URL facts for every returned risk
   and next-month candidate so the defensive builder sort cannot select an item
   whose URL facts were omitted.
4. Add focused regression tests for a skipped-midnight timezone, direct URL
   privacy, settings drift at the writer boundary, cap/tie selection and
   provider-safe bounded reads.
5. Keep action outcomes accessible by focusing the visible live outcome message
   rather than a generically named container, make refresh confirmation neutral
   to state/coordinate changes, and cover normal, no-activity and rolled-over
   mutation success in the hook harness.

# Constraints

- Preserve the accepted monthly Report source policy, section caps, UI states,
  first-writer-wins recovery and existing OpenSEO Report semantics.
- Add no dependency, table, migration, provider call, scheduled work or public
  route.
- Keep SQLite/D1 and Postgres query generation compatible.
- Browser, HTTP, CDP, Playwright and screenshots remain prohibited.

# Verification

- Focused timezone tests cover the shared function's skipped-date fallback and
  every source-bound field, plus the previous-local-date overdue predicate.
- D1 and conditional live-Postgres repository fixtures assert the complete
  `cap + 1` sequence for case-varied ASCII IDs, not only SQL compilation.
- The live Postgres fixture races two coordinator builds with different bounded
  snapshots through the real settings lock and immutable Report graph, then
  proves both callers receive the exact persisted winner.
- Focused safe-projection, builder, repository, coordinator, writer,
  server-function and static UI tests.
- Type checking, full repository tests, `pnpm ci:check`, production build and
  `git diff --check`.
- Fresh adversarial code review and evidence-only acceptance audit.
