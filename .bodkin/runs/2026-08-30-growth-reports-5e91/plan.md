# Goal

Implement BG-0110 as the Phase 1 gate: create and publish one project-scoped, versioned, frozen monthly Growth report snapshot with eight deterministic structured sections and normalized links to canonical Actions and terminal Measurement Results, then prove the existing Signal-to-Report chain end to end.

# Scope

- Record report identity, version, snapshot, content, provenance, publication and deletion decisions in ADR-027.
- Add mirrored D1/SQLite and Postgres report-header, section, Action-link and Measurement-Result-link tables/migrations.
- Add strict Zod contracts, a pure deterministic snapshot builder, project-scoped repository/writer and trusted internal create/read/publish services.
- Add a service-level Phase 1 gate fixture that manually completes `Signal → Insight → Recommendation → Action → Change → Measurement → Report`.

# Relevant areas/files

- Planned truth: PRD sections 14, 17 and 24; architecture sections 6.19–6.20; implementation item BG-0110; `UPSTREAM_MAP.md` Phase 1 step 6.
- Existing immutable graph patterns: `GrowthInsightsGraphWriter.ts`, `GrowthChangeEventsWriter.ts`, `GrowthMeasurementsWriter.ts`, `GrowthMeasurementsService.ts`.
- Canonical source parents: `growthActions`, `growthMeasurementPlans`, `growthMeasurementResults` and their project-leading keys.
- Provider paths: `src/db/runBatch.ts`, schema barrels, `src/db/schema-parity.test.ts`, D1 migration/query fixtures and provider-gated Postgres tests.

# Implementation approach

- Store one immutable snapshot row per `(project, monthly, period start, period end, version)`. The natural family/version coordinate is the idempotency key; do not add a second caller creation-key namespace.
- Freeze report timezone from current Growth settings, canonical cutoff/generation instants, a constant builder version, content schema version and creator identity. Server generation time and later publication metadata are excluded from the immutable fact hash.
- Use exactly eight section rows in canonical order: executive summary, performance, meaningful changes, work completed, results from earlier work, risks, opportunities and next month.
- Encode each section with one strict bounded content shape: summary plus explicitly positioned items; each item has a stable key, bounded prose, explicitly positioned scalar display facts, typed evidence references and at most one Action or Measurement Result source reference. No arbitrary keys or nested payloads are accepted.
- Derive sorted report-wide Action/Result link sets from section source references. Add every linked Result's owning Action, validate all sources in the same project, and persist normalized join rows. Frozen section content remains render-authoritative if later source deletion prunes a navigation link.
- Create header, all sections and all links in one provider-aware atomic write. Child inserts select only the winning header fact; direct composite source FKs make invalid/deleted/cross-project links roll back the transaction.
- Keep draft content immutable. Publishing validates the stored snapshot and performs a one-way versioned header projection from draft to published with server time and publisher identity. There is no unpublish or content update.

# Constraints

- Reuse project tenancy, Growth settings, actor/evidence vocabularies, hashes, typed errors, provider-aware transactions and existing source models.
- Use portable scalar/text columns and project-leading composite constraints for D1 and Postgres.
- Keep generated structured content bounded to 64 KiB per section and 256 KiB total; cap items, facts, evidence and unique source links.
- Do not weaken existing run/Recommendation/Action/Measurement deletion behavior or render reports from mutable live joins.

# Explicit non-goals

- Automatic source selection, historical time-travel queries, KPI/provider collection, monthly orchestration, AI narrative, model provenance, HTML/UI, share tokens, PDF/print, scheduling, Growth MCP, custom/weekly reports, report correction/supersession, client redaction or public authorization boundaries.

# Risks

- Arbitrary JSON would become a hidden application/database; use a closed versioned presentation schema and byte limits.
- Concurrent drift could attach children to the wrong report version; gate every child on the winning report fact and reread the complete graph.
- A Result may be linked without its owning Action; resolve Result parents and include/validate the Action link automatically.
- Source deletion must not rewrite a frozen narrative but must not block accepted run deletion; cascade only navigation joins while preserving source IDs/display facts inside frozen content.
- Current mutable Recommendation review state cannot be reconstructed at an arbitrary cutoff. Treat cutoff as the build instant for the explicit source bundle, not a historical query guarantee.
- Publish must not silently accept a damaged/incomplete graph; recompute and validate the snapshot before the one-way transition.

# Verification plan

- Contract/builder tests for dates/timestamps, fixed section set/order, strict item schema, source/section rules, deterministic ordering/hash input, byte/cardinality limits and actor/evidence vocabularies.
- A real-libSQL migration test beginning after migration 0048 with populated source data; inspect keys/checks/indexes, exercise cross-project constraints, lifecycle/JSON bounds and deletion directions, then run `PRAGMA foreign_key_check`.
- A production-provider real-libSQL repository test for atomic create, exact retry, drift isolation, source validation, read ordering, publish CAS and navigation-link pruning.
- A maximum-cardinality D1 create/publish case with 100 Actions and 50 terminal Results, asserting every emitted atomic-write statement stays at or below 100 bound parameters and same-cardinality manifest drift cannot publish.
- A service-level real-libSQL Phase 1 gate fixture using the existing services through Report creation/publication.
- Generate both migrations, run schema parity and focused Growth regressions, apply the complete Postgres tree to disposable Postgres 16 and execute provider-gated report concurrency/cascade tests.
- Run full root tests, `ci:check`, production build and `git diff --check`, then obtain fresh adversarial acceptance before commit.
