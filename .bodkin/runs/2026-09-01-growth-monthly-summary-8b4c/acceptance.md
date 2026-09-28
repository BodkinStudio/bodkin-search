# Required behaviour

1. Growth derives the previous completed calendar month from one server-captured
   Growth settings projection and never writes on render, refresh or remount.
2. The first-build cutoff is captured once. Change `createdAt`, Result
   `createdAt/evaluatedAt` and Action `updatedAt` must not exceed it. Timestamp
   membership uses the same pinned IANA timezone, including DST boundaries.
3. A settings change between selection and the transactional Report insert
   aborts without writing, including creation of a formerly-unpersisted settings
   row. Stored timezone, period derivation and source membership use one value.
4. Version 1 is created once. Existing-coordinate reads do not rebuild. Two
   concurrent first builds with different cutoffs and candidate projections
   both return the single persisted winner, without comparing the loser or
   mutating the winner.
5. The browser supplies project routing and may echo only server-issued period
   start/end/timezone expectations for build/recovery. A recovery read is
   limited to calendar-month distance at most one from current; a write happens
   only when all echoed values remain current. Actor, actual timezone, cutoff,
   version, sections and sources are server-derived.
6. Source reads are project-isolated, bounded and deterministic. All ties end in
   code-unit ID order, section-cap overflow is frozen into the summary, and each
   item exposes at most five sorted safe URLs plus an overflow count.
7. Work completed contains Actions whose `implementedAt` is in the period,
   including implemented/measuring/evaluated rows, ordered by implementation,
   priority and ID, capped at 12.
8. Performance contains terminal Results evaluated in the period, ordered by
   evaluation and ID, capped at 20. It explicitly represents saved Growth
   Measurements, not whole-site KPIs.
9. Results from earlier work contains only those period Results whose owner
   Action was implemented before `periodStart`; same-period implementations
   remain in Performance only. It is independently tested and capped at 20.
10. Meaningful changes emits one item per period Change Event, ordered by
    happened time and ID, capped at 12. Exactly one valid same-project linked
    Action is sourced; zero or multiple links produce an unsourced item.
11. Risks contains blocked Actions plus approved/ready/in-progress Actions due
    strictly before the cutoff calendar date. A due date equal to the cutoff
    date is not overdue. Blocked sorts first; the section is capped at 12.
12. Next month contains remaining approved/ready/in-progress Actions due in the
    calendar month immediately following the report period. Opportunities
    contains remaining approved/ready Actions. Risk, Next and Opportunity sets
    are disjoint; implemented/measuring/evaluated/cancelled are excluded.
13. Executive summary is deterministic bounded counts without AI, causal or
    health claims. All eight canonical sections are frozen in canonical order,
    even when an item list is empty.
14. At least one selected Action or terminal Result direct source is required.
    Change-only or unsupported Recommendation activity returns no activity and
    persists nothing.
15. Every persisted display field crosses a named safe projection: generic
    Action text, Change description/URL, and Result summary. Credentials and
    emails are redacted; invalid, credential-bearing or userinfo URLs are
    withheld; query and fragment material is removed.
16. The client DTO is allowlisted and never includes source/evidence objects,
    row/source/actor IDs, hashes, internal keys, creator/publisher identity or
    builder/schema versions. React escaping remains a second layer, not the
    privacy boundary.
17. Growth presents `Monthly summary` first after the page header and covers
    loading, safe error/retry, no activity, ready, building, uncertain-save and
    frozen success states accessibly.
18. Success renders one semantic Report article with period, Draft/version,
    generated time, cutoff, timezone and all eight sections. It never implies
    editing, automatic refresh, publication, sharing or causation.
19. An uncertain request crossing local month or report-timezone rollover checks
    the original echoed coordinate. It returns an existing old winner; without
    one it returns current read state and performs no write or automatic build.

# Required checks

- Focused report schema, builder, repository/service, server-function and UI
  tests pass for both provider shapes where repository SQL is involved.
- Transactional writer tests cover both updated persisted settings and creation
  of initially-unpersisted settings, proving no mismatched timezone Report can
  persist.
- A contention test uses genuinely different concurrent source snapshots and
  proves both callers receive the same immutable winner.
- Month/timezone rollover tests prove an old winner remains discoverable and an
  unsaved stale expectation cannot create either old or new period.
- Source-policy tests cover every exact status/date predicate, due-date
  boundary, all tied sort keys, caps, Results-from-earlier-work distinction and
  zero/one/multiple Change-to-Action links. The two Result caps are independent,
  URL facts are capped, and repository ID batches stay provider-safe.
- Safe-projection tests seed credentials, emails and URLs with
  userinfo/query/fragment in every mutable narrative field and require their
  safe projection in persisted display text and HTML. Separate raw row IDs,
  hashes, evidence references and actor IDs are seeded in canonical non-display
  fields and must never be copied into display text or the DTO. Required source
  IDs may exist only in internal `source` coordinates and never in DTO or HTML.
- `pnpm ci:check`, serialized/full repository tests, `pnpm build` and whitespace
  checks pass.
- A fresh adversarial reviewer challenges tenancy, frozen retry/source races,
  settings/timezone pinning, source predicates, safe projection and UI recovery.
- A fresh acceptance audit verifies every criterion against code and executed
  evidence.

# Regression constraints

- Existing Report create/get/publish, source-pruning and exact-retry behaviour
  remains unchanged for direct internal callers.
- Existing Growth checks, investigations, Work, Change Log and Measurement
  flows retain their query keys, controls and behavior.
- No provider call, AI generation, scheduled job, MCP tool, dependency, public
  route, table or migration is added.
- SQLite/D1 and Postgres remain compatible.

# Important edge cases

- Month/year rollover, leap February and DST-offset boundary instants.
- Default unpersisted settings and a settings row created or updated mid-build.
- No eligible sources; only unsupported Change/Recommendation facts.
- Exactly-at-period-start, exactly-at-next-month, exactly-at-cutoff and
  exactly-due-on-cutoff rows.
- Action mutated after cutoff; deleted source; cross-project source rows.
- More candidates than each cap, equal date/priority ties and shuffled DB rows.
- Zero, one and multiple Action links for a Change Event.
- Lost response, duplicate click, existing draft after source drift and
  concurrent distinct first-build projections.
- Lost response immediately before a local month rollover, with and without a
  persisted old-period winner.
- Credentials, emails, markup and URLs with userinfo/query/fragment in every
  mutable narrative field, plus raw IDs/hashes/evidence/actors in non-display
  source fields.
- Empty sections and scalar facts containing zero, false and null.

# Product / UX requirements

- Preserve the existing flat Growth card system, DaisyUI controls, `base-*`
  tokens and concise explanatory voice.
- Use native headings, article/section/list/dl semantics, labelled controls,
  `role=status`/`role=alert`, disabled pending actions and escaped React text.
- Keep the report readable as prose, not a dense dashboard or raw data dump.
- Show every frozen section, even when it contains no items.

# Specialist review requirements

- Bodkin product-UI EXTEND review of hierarchy, states, accessibility and visual
  consistency. Rendered screenshot review is waived by the user's explicit
  browser-evidence prohibition; static render/interaction evidence is required
  instead and the waiver must be disclosed.
- Fresh Bodkin adversarial code review and final acceptance audit.
