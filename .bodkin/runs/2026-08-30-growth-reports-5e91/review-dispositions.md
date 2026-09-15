# Review 1 dispositions

The fresh full-scope review returned `revise`.

- **Major: D1 publication parameter budget — valid.** The per-link EXISTS predicates scale linearly to roughly 507 bound values. Replace the Action/Result membership predicates with compact, parameter-bound transient ID manifests using the existing `GrowthMeasurementsWriterSql.ts` JSON-table idiom. Stored product relationships remain normalized join rows; no schema, persisted manifest, hash authority, or publication lifecycle change is needed.
- **Plan gap: maximum-cardinality provider test — valid.** Add a real-libSQL create/publish case at 100 Actions and 50 terminal Results and assert every emitted atomic-write statement has at most 100 bound parameters. Keep exact-membership rejection even for same-cardinality changed manifests.

This is repair round 2 (the first bounded cycle resolved pre-review source-deletion findings). The repair is limited to the publication SQL predicate and its tests/acceptance evidence. Preserve every `do_not_change` item in `review.json`. After independent verification, obtain a fresh repair-scope review; do not start a third automatic repair.

## Repair evidence

Both dispositions are implemented. Source manifest cost is constant (65 total publication parameters by independent inspection), with exact count/distinctness/membership checks. The D1 maximum-cardinality fixture and changed/duplicate-manifest cases pass; live Postgres changed-manifest/concurrency behavior passes. Independent round-2 verification returned **pass**, and full tests, static checks and build were refreshed. The final fresh repair-scope review returned **pass** with no findings or gaps; see `review-final.json`.
