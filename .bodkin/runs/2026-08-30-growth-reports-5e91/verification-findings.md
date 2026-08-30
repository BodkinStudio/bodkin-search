# Independent verification dispositions

Base commit: `7c0c1160dc152fd8f9b966914c3ef566d9c27034`.

The pre-review independent verifier returned two major findings. Both were accepted and repaired in one bounded verification repair cycle before fresh adversarial review.

1. **Draft source deletion blocked frozen reads and exact retries — valid, resolved.** The read-time graph check had required a complete source manifest for drafts even though source foreign keys prune navigation joins in every lifecycle state. Reads/retries now validate frozen content and surviving navigation independently. Publication reconstructs the complete live manifest from frozen sources and rejects a pruned draft before its atomic transition.
2. **Deleting a Result left an owner Action link that the reader rejected — valid, resolved.** A Result may be the only direct source, with its Action linked derivatively. Deleting the Result removes its join but leaves the live Action. The validator now permits at most one unexplained surviving Action per missing direct Result, while retaining project/live-link checks and source caps.

The first added service regression still named the Action directly and therefore did not reproduce the second bug. The verifier identified this evidence gap; the fixture was tightened so both Action presentation items have null sources and the Result is the only direct source. The expected Action link is therefore derived-only. The test now exercises Result-first deletion for both published and draft Reports, exact retries, preserved frozen content, rejection of draft publication, then later Action deletion.

Final independent verdict: **pass**; both majors resolved and no new material issue found.

Independent refreshed checks: focused D1 snapshot/service/repository (3 files, 4 tests), the updated derived-only service case, live Postgres Report concurrency/Result-first deletion, targeted Prettier, and type-aware Oxlint across the five repaired files (zero warnings/errors). Root verification then refreshed the six-file/317-test Report suite, all six live Postgres Growth suites (11 tests), the full root suite (1,490 tests), `ci:check`, and production build.

These findings are covered by executable regressions. No review-control-plane rule change was needed.

## Review repair round 2

The fresh adversarial review then found a D1 publication parameter-budget defect and a matching maximum-cardinality plan gap. Both were accepted. The writer now uses the existing Measurement writer's transient JSON-table parameter idiom for source membership, preserving normalized stored joins. Counts plus distinctness plus membership keep exact-set behavior; the eight-section publication statement now binds 65 values regardless of source cardinality.

The maximum-cardinality D1 fixture creates 100 Actions and 50 terminal Results, asserts every emitted atomic-write statement binds at most 100 values, rejects substituted and duplicate same-cardinality Action/Result manifests, then publishes the exact manifest. Postgres also rejects changed Action/Result manifests before concurrent first-wins publication.

Round-2 independent verdict: **pass**. The verifier independently ran the D1 repository plus Phase 1 service fixtures (2 files, 3 tests) and live Postgres publication regression (1 file, 1 test), found no new concrete defect, and confirmed both the accepted major and plan gap resolved. Root refreshed the six-file Report suite (318 tests), full root suite (1,491 tests), all six live Postgres suites (11 tests), `ci:check`, and production build. Fresh repair-scope review then returned **pass** with no findings or gaps.
