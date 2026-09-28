# Goal

Add a trustworthy internal monthly Growth summary that deterministically turns
saved Actions, linked Change Events and terminal Measurement Results into the
existing immutable eight-section Report snapshot, then renders that frozen
draft prominently inside Growth.

# Scope

- Define and document the first automatic monthly period/source policy.
- Build the previous completed calendar month in one pinned project report
  timezone, from one pinned server cutoff.
- Add bounded project/period source queries without provider or network calls.
- Compose all eight canonical sections with deterministic ordering, caps and
  honest coverage language.
- Create version 1 once through the existing Growth Reports service. The first
  successfully persisted coordinate wins; repeat and contending requests return
  that saved winner without regenerating or comparing later source snapshots.
- Add strict project-authorized read/create server boundaries with server-owned
  actor, cutoff, version, sections and source selection. Build/recovery may echo
  only the exact server-issued period/timezone expectation so retries cannot
  cross a report-month or settings-timezone rollover.
- Return an allowlisted client projection and render the current monthly summary
  as the first Growth section with explicit build and recovery states.

# Relevant areas/files

- `src/types/schemas/growth-reports.ts`: accepted monthly section and source
  contract.
- `src/server/features/growth/services/GrowthReportsService.ts`: immutable
  create/get and exact-retry boundary.
- Growth Action, Change Event and Measurement repositories/services: canonical
  saved facts used by the builder.
- `src/server/features/growth/services/GrowthEvidencePacket.ts`: established
  credential, email, narrative and display-URL projection rules to reuse.
- `src/serverFunctions/*` plus `requireProjectContext`: authorized server
  function convention.
- `src/client/features/growth/GrowthPreviewPage.tsx` and neighbouring Growth
  section components: established page hierarchy, tokens and request states.

# Pinned snapshot contract

At the start of a first-build request, capture one server `dataCutoffAt` and one
Growth settings projection: `reportTimezone`, persistence state and
`updatedAt`. Derive the previous completed calendar month from that timezone.
Every source query is project-scoped and accepts that cutoff.

This is an explicit bounded current-state read, not historical reconstruction:

- a Change Event is eligible only when `createdAt <= dataCutoffAt`;
- a Result is eligible only when `createdAt <= dataCutoffAt` and
  `evaluatedAt <= dataCutoffAt`;
- an Action is eligible only when `updatedAt <= dataCutoffAt`; an Action changed
  after the cutoff is omitted because its prior state cannot be reconstructed;
- period and due-date membership use `calendarDateInTimezone(timestamp,
reportTimezone)`, never a UTC date slice.

Carry the pinned settings projection through an internal Report-service option
and enforce it inside the existing transactional Report writer at the insert
serialization point. For a persisted settings row, the writer locks/reads and
requires the same `reportTimezone` and `updatedAt`; for default unpersisted
settings, it serializes against the project row and requires that no settings
row has appeared. Settings drift aborts with a retryable conflict; a Report can
never be stored with a timezone different from the one used to calculate its
period and classify its sources.

# Deterministic source policy

The builder uses these exact predicates, caps and stable sort keys. Date ranges
are inclusive unless stated otherwise. Stable ID is the final code-unit tie
breaker but never appears in the client DTO.

| Section                   | Selection and ordering                                                                                                                                                                                                                                                                                                                         | Cap                                                                                                                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| Executive summary         | Generated counts from the bounded selected sets; no sourced item and no causal or whole-site claim.                                                                                                                                                                                                                                            | One item                                                                                                                                                                          |
| Performance               | Every terminal Result evaluated in the period, including Results for work implemented during the same period; order `evaluatedAt desc, id asc`. Describe only saved Growth Measurements.                                                                                                                                                       | 20                                                                                                                                                                                |
| Meaningful changes        | One item per Change Event whose `happenedAt` is in the period. Order `happenedAt desc, id asc`. Exactly one valid same-project linked Action in the bounded current link read becomes the source; zero or multiple linked Actions yields `source: null`. Link rows have no creation timestamp, so no historical link-membership claim is made. | 12                                                                                                                                                                                |
| Work completed            | Actions with non-null `implementedAt` in the period, including current `implemented`, `measuring` and `evaluated`; order `implementedAt desc, priorityScore desc, id asc`.                                                                                                                                                                     | 12                                                                                                                                                                                |
| Results from earlier work | Terminal Results evaluated in the period only when their owning Action's `implementedAt` calendar date is strictly before `periodStart`; order `evaluatedAt desc, id asc`. Same-period work remains in Performance only.                                                                                                                       | 20                                                                                                                                                                                |
| Risks                     | Current Actions with status `blocked`, plus Actions in `approved                                                                                                                                                                                                                                                                               | ready                                                                                                                                                                             | in_progress`whose due calendar date is strictly before the cutoff calendar date. Due on the cutoff date is not overdue. Order blocked first, then`dueAt asc, priorityScore desc, id asc`. | 12  |
| Next month                | Remaining non-blocked Actions in `approved                                                                                                                                                                                                                                                                                                     | ready                                                                                                                                                                             | in_progress`whose due date falls in the calendar month immediately after the report period; exclude anything already selected as a Risk. Order`dueAt asc, priorityScore desc, id asc`.    | 12  |
| Opportunities             | Remaining Actions in `approved                                                                                                                                                                                                                                                                                                                 | ready`after Risks and Next month. This is explicitly the approved/ready Action opportunity queue, not all proposed Recommendations. Order`priorityScore desc, dueAt asc, id asc`. | 12                                                                                                                                                                                        |

`implemented`, `measuring`, `evaluated` and `cancelled` never appear in Risks,
Next month or Opportunities. Those three sections are disjoint. Every capped
section reads at most `cap + 1`, selects the first `cap`, and freezes an explicit
“showing N of at least N+1” coverage note when overflow exists. At these caps,
the Report remains under the schema-wide 100 Action and 50 Result source limits.
Performance and Results-from-earlier-work have independent Result queries/caps;
their union may contain 40 Results. Each item displays at most five sorted safe
URLs and adds an `Additional URLs` numeric fact when more valid URLs exist.
Repository ID batches stay below provider parameter limits.

A build is eligible only when at least one selected Action or terminal Result
can be a direct Report source. Change-only activity and unsupported proposed
Recommendations do not qualify. Empty canonical sections remain present with
truthful summaries.

# Safe frozen-content and client contracts

All persisted display text is projected before the Report snapshot is built:

- Action title and description use an exported generic Growth display-text
  projection backed by the Evidence Packet's existing credential/email/URL
  sanitisation;
- Change Event description uses
  `growthEvidenceDisplayChangeDescription`;
- Change Event and Action target URLs use `growthEvidenceDisplayUrl`; invalid,
  credential-bearing or userinfo URLs are withheld, and query/fragment data is
  removed;
- Measurement Result summary uses
  `growthEvidenceDisplayMeasurementSummary`;
- dates, numbers, booleans and closed enums are generated display facts, not raw
  narrative.

The client DTO is a strict allowlist containing safe report metadata and each
section's type, title, summary and display facts. It omits item sources,
evidence references, all row/source/actor IDs, hashes, creator/publisher
identity, internal keys, and builder/content-schema versions. React renders the
allowlisted strings as text. Unsafe input is redacted, omitted or withheld by
the named projection; it never passes through merely because React escapes it.

# Contention, rollover and idempotency protocol

1. A normal read captures settings/server time, derives the current previous
   month and reads that exact monthly version-1 coordinate.
2. The UI echoes returned `periodStart`, `periodEnd` and `reportTimezone` only
   on explicit build or uncertain recovery. The service validates the complete
   calendar-month pair and permits a read only when its calendar-month index is
   at most one before or after the current derived coordinate.
3. Build/recovery first reads the echoed coordinate. If a winner exists, return
   it without reading or rebuilding sources, even just after month rollover.
4. If no winner exists and either echoed period or timezone no longer equals
   the current server-derived eligible values, return the current read state
   without writing. The UI replaces stale state and asks for a new explicit
   build decision.
5. Only when echoed period and timezone are current, treat the captured server
   time as `dataCutoffAt`, query sources and delegate the immutable write with
   the pinned settings expectation.
6. If create reports any error, read the echoed coordinate once. If a valid
   winner now exists, return it without comparing the losing build; otherwise
   rethrow. After success, return the stored allowlisted projection.

Direct callers of `GrowthReportsService.createGrowthReport` retain its accepted
exact-retry semantics. Only the monthly coordinator adopts first-writer-wins
recovery because it owns automatic source selection.

# Implementation sequence

1. Record ADR-035 with the pinned snapshot, exact source table, caps, safe
   projection and first-writer-wins coordinator policy.
2. Add bounded SQLite/Postgres-compatible source reads and a pure deterministic
   builder using only projected display values.
3. Add a monthly coordinator plus the minimal coordinate read and expected
   settings checks at the existing Report service boundary.
4. Add strict TanStack read/create server functions and the allowlisted DTO.
5. Add the internal report card/article and mechanical interaction/render
   tests, preserving the existing Growth visual system.

# Constraints

- Reuse OpenSEO tenancy, auth, database provider, Growth facts and Report
  persistence. Add no dependency, table, migration, auth system or separate
  Report service.
- Keep queries compatible with SQLite/D1 and Postgres.
- Browser input supplies project routing and may echo only server-issued period
  start/end/timezone expectations for build/recovery. The server validates them
  and writes only current eligible values. Actor, actual timezone, cutoff,
  version, sections, sources, narrative, builder/schema version and publication
  state remain server-owned.
- Page load and refresh are read-only. Building requires an explicit action.
- Browser/HTTP/CDP/Playwright/screenshots remain prohibited by the user;
  server-render and interaction tests replace rendered capture evidence.

# Explicit non-goals

- Provider collection, project-wide KPI claims or historical as-of queries.
- AI narrative, diagnosis or Measurement interpretation.
- Draft editing/regeneration, version 2, supersession, publish UI or unpublish.
- Report history navigation, weekly/custom reports, scheduling or orchestration.
- Share links, print/PDF, client portal, MCP, portfolio or alerts.
- Recommendation or Change Event Report-source schema changes.

# Verification plan

- Pure builder tests for every exact predicate, canonical order, caps/overflow,
  source compatibility, multi-linked Changes, earlier-work semantics, stable
  ties, five-URL item caps and truthful empty states.
- Snapshot tests for cutoff boundaries, action-update exclusion, month/year and
  DST rollover, plus persisted and initially-unpersisted settings races guarded
  at the transactional insert boundary.
- Contention test where two first builders have different cutoffs/source
  projections and both receive the single stored winner without mutation.
- Rollover tests where an uncertain old-period/old-timezone retry returns its
  saved winner, or, without one, returns current read state without writing.
- Safe-projection tests put credentials, emails and unsafe URLs into every
  mutable narrative field and assert sanitised persisted display text and HTML.
  Separately seed row IDs, hashes, evidence references and actor IDs in their
  canonical non-display fields and assert the builder never copies them into
  display text or the DTO. Required source IDs remain only in the Report
  schema's internal `source` fields and never enter the DTO.
- Server-function tests for forged authority fields and cross-project access.
- Static-render and hook-harness tests for no write on render/refetch, one
  explicit build, duplicate lock, uncertain recovery and all eight sections.
- Focused tests, `pnpm ci:check`, full repository tests, `pnpm build`,
  `git diff --check`, fresh adversarial review and acceptance audit.

# Risks

- Multi-read source data is not an as-of snapshot. Explicit cutoff exclusion and
  disclosure keep the claim honest but may omit an Action edited mid-build.
- Settings churn intentionally aborts the first build; a retry uses the new
  timezone and coordinate period.
- A first writer can win with an older bounded snapshot. The immutable v1 rule
  makes that visible through `dataCutoffAt`; later correction/versioning is a
  separate product decision.
- Capped sections are partial. Their frozen summaries always disclose overflow.
