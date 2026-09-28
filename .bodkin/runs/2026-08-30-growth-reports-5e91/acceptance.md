# Required behaviour

- ADR-027 records monthly Report identity/versioning, frozen timezone/cutoff/builder/content versions, exact section vocabulary, bounded content semantics, Action/Result provenance, immutable drafts, one-way publication, retry rules and deletion direction.
- A Report version is unique by project, report type, inclusive period and positive caller-stable version. Creation freezes the current Growth report timezone, canonical data cutoff, server generation time, creator and a complete semantic fact hash.
- BG-0110 accepts `monthly` only. Weekly review/report cadence does not silently reuse the monthly section contract.
- Every Report has exactly eight sections once, ordered `executive_summary`, `performance`, `meaningful_changes`, `work_completed`, `results_from_earlier_work`, `risks`, `opportunities`, `next_month` at positions 0–7.
- Structured content is strict, versioned and bounded: one summary plus ordered stable-key items; ordered finite scalar/string/boolean/null display facts; typed evidence references; and at most one internal Action or terminal Measurement Result source per item. Unknown/arbitrary payload fields fail.
- Item/fact display order is explicit and canonical. Unordered evidence/source sets are deduplicated and sorted. Duplicate keys/positions/facts, invalid source-to-section usage, non-finite numbers, malformed dates/timestamps and oversized content fail before persistence.
- Report content may snapshot presentation data and source IDs, but operating relationships remain explicit: normalized same-project Report–Action and Report–Measurement-Result links are stored. Linking a Result also links its owning Action.
- Creating a new Report atomically writes the header, all eight sections and all normalized links. Invalid, deleted or cross-project sources leave no header or children. A losing concurrent fact cannot attach sections or links to the winner.
- Exact retry of the same family/version and complete fact returns the original graph. Any header, actor, cutoff, section byte, item order/fact/evidence/source drift conflicts.
- Draft content and source manifest are immutable from creation. No content/link update, unpublish or ordinary delete API exists.
- Publishing validates the stored snapshot, then atomically stamps `published` plus server time and publisher identity. Repeated or concurrent publication returns the first published projection without changing its actor/time; a damaged snapshot is not published.
- Reports render from frozen section content, never live source rows. Deleting an Action/Result may prune only its navigation join and never deletes or rewrites the Report; project deletion cascades the complete Report graph.
- Every read/write is project-scoped and composite constraints reject cross-project Reports, sections, Actions and Results.

# Required checks

- Zod/builder tests cover exact section vocabulary/order/cardinality, inclusive valid dates, canonical cutoff, version/actor bounds, strict unknown-key rejection, explicit positions, unique item/fact keys, finite values, evidence registry, section/source compatibility, Result-parent Action derivation, source/link caps and 64 KiB/256 KiB limits.
- Service tests cover frozen timezone, canonical fact/hash input, eligible/missing/foreign sources, exact/drift retries, no half-state, graph verification, publication idempotency/concurrency and source deletion without content drift.
- A migration-backed real-libSQL test starts after migration 0048 with populated Action/Result sources, applies the new migration, inspects project-leading keys/indexes, exercises raw vocabulary/lifecycle/JSON/length/version/cross-project constraints and deletion directions, and ends with a clean `PRAGMA foreign_key_check`.
- A real-libSQL repository test uses production Drizzle/runBatch code for atomic create/read/publish behavior, exact retry, concurrent/semantic drift isolation, source-link completeness and cascade pruning.
- The D1 repository fixture creates and publishes the allowed maximum of 100 Actions and 50 terminal Results, asserts every emitted statement uses at most 100 bound parameters, and rejects same-cardinality changed source manifests.
- A service-level real-libSQL gate test manually completes `Signal → Insight → Recommendation → Action → Change → Measurement → Report`, publishes it and proves the frozen report links the canonical Action and terminal Result.
- Provider-gated Postgres evidence applies the complete migration tree to fresh disposable Postgres 16 and exercises concurrent report drift/publication, source constraints and cascade behavior.
- `src/db/schema-parity.test.ts`, focused Growth regressions, full root tests, `ci:check`, production build and `git diff --check` pass.
- Fresh adversarial review returns pass or every accepted finding is repaired and reverified within two rounds.

# Regression constraints

- Existing settings, Runs, Signals, Insights, Recommendations, Actions/events, Change Events, Measurements and their exact retry/deletion semantics remain green.
- Report links must not introduce `RESTRICT` behavior that blocks accepted run/Recommendation/Action/Measurement deletion.
- Report generation makes no provider/network/paid call and does not treat `dataCutoffAt` as an unsupported historical-as-of query.
- No external boundary trusts caller-supplied project or actor identity in this slice; future server/UI/MCP surfaces derive both from authorization context.
- Existing auth, MCP, scheduler, workflow, provider, export/share and deployment code remain unchanged.
- No dependency, production migration, deployment or remote application state is introduced.

# Important edge cases

- Reordered section input canonicalizes to the fixed eight-section order, but changed item/fact positions are intentional presentation drift and conflict.
- Empty item lists are valid when the section summary explicitly says there was nothing material; at least one sourced item is required for a Report.
- A Measurement Result source must exist, be terminal and same-project; its owning Action is linked even if only the Result item names it.
- One Action/Result referenced by multiple items produces one normalized report-wide link.
- A cutoff after generation is rejected for a new snapshot; exact delayed retry retains the original generated timestamp.
- One changed structured-content byte, creator, evidence reference or source coordinate under the same Report family/version conflicts without extending the winning graph.
- Source deletion leaves drafts and published Reports readable and exactly retryable from frozen content; a pruned draft cannot publish. Deleting a Result-only direct source preserves its derived owner Action navigation while pruning the Result link.
- Project deletion removes all Report rows and links while unrelated projects survive.

# Product / UX requirements

None. Internal report UI, web rendering, sharing, print/PDF and client presentation are deferred.

# Specialist review requirements

None. Fresh full-scope engineering review is required.
