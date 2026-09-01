# Required behaviour

1. One shared conversion maps period start, period end-exclusive, cutoff start,
   next-month start and next-month end-exclusive to their intended report
   calendar boundary even when an IANA zone skips midnight. A wholly skipped
   requested date resolves to the earliest instant of the first existing date
   after it. Due work on the previous local date remains strictly overdue.
2. Direct URL display facts never contain credentials, userinfo, query,
   fragment or raw/percent-encoded email material.
3. Every capped repository query orders canonical server-generated ASCII UUIDs
   with SQLite/D1 `BINARY` or Postgres `C` collation before limiting. Both
   providers return the same complete `cap + 1` sequence as JavaScript
   code-unit order, and all returned candidate Actions are eligible for bounded
   URL lookup.
4. Persisted and initially-absent settings projections still guard the atomic
   Report insert, including an explicit report/expectation timezone match.
5. The monthly UI remains read-only until an explicit build. Normal,
   no-activity and rolled-over mutation successes replace cached state, unlock
   safely and focus a visible live outcome message whose accessible name states
   what happened. Refresh confirmation does not claim content was unchanged.

# Required checks

- Skipped-midnight regressions exercise the shared conversion through every
  source-bound field, the previous-local-date overdue predicate and a wholly
  skipped-date fallback.
- URL tests cover raw and percent-encoded emails, userinfo, credentials,
  query/fragment stripping and safe URLs.
- D1 repository tests cover settings positive/negative controls, source
  predicates, disjoint queues, cap overflow, bounded IDs and the full
  case-varied ASCII cap-boundary sequence.
- An executable conditional live-Postgres fixture asserts the same complete
  case-varied ASCII sequence and settings-lock behavior when its disposable
  migrated database is configured; an unavailable local database is disclosed
  rather than replaced by syntax-only evidence.
- The live Postgres fixture starts two coordinator builds with different
  bounded snapshots, holds both at the real settings lock, and proves that one
  immutable coordinate is stored and returned identically to both callers.
- Hook-harness tests invoke normal, no-activity and changed-coordinate mutation
  success callbacks and assert cache, lock, copy and visible-message focus.
- Focused tests, types, full tests, `pnpm ci:check`, build and whitespace pass.

# Regression constraints

- No source-policy, period, cap, DTO, publication or Report immutability change.
- No dependency, schema, migration, auth, provider or scheduling change.

# Important edge cases

- Midnight skipped by DST; repeated midnight; month/year and leap boundaries.
- Email text in raw and encoded URL paths; credential-bearing and userinfo URLs.
- Equal sort fields with case-varied IDs at a cap boundary.
- Settings row updated or inserted after the service projection.

# Product / UX requirements

- Preserve the existing monthly-summary hierarchy, card language, native
  semantics and keyboard focus outcomes.

# Specialist review requirements

- Static product-UI/accessibility review only; rendered browser evidence remains
  waived by the user's explicit prohibition.
- Fresh Bodkin adversarial review and final acceptance audit.
