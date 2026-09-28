# Review dispositions

Fresh full review returned `revise`. The Director accepts all four major findings and the verification gap. No plan gap or product decision is required.

- Unicode URL provenance ordering: valid; reproduced by the retained failing regression and a separate direct probe. Use a total code-unit comparator.
- Non-curated provider URL validation: valid; relative and oversized URLs bypass validation. Reuse the narrow observation schema before curation.
- Unbounded date expansion: valid; the bounded formatting-budget test reproduces expansion before containment validation. Check scalar date relationships before building any day list.
- Unicode key-page ID tie ordering: valid; the accepted string domain includes distinct IDs that compare equal under locale collation. Apply the same total comparator to traversal and final ties, and add a reordered-ID regression.
- Required verification failures: valid; remove unused exports/types without suppressing Knip, then rerun the focused tests and repository gates.

Repair round 1 is limited to these findings in the new adapter/detector/DTO and their regression tests. Preserve all `do_not_change` constraints in `review.json`. Existing failing assertions must remain; an assertion may accommodate the stricter validator's credential-error wording without reducing the required rejection behavior. No schema, provider, auth, UI, AI or scheduling expansion is authorized.

The existing binary-ordering defects are covered by executable regressions. No review-control-plane rule change is required for this repair.

## Repair round 1 changes

- The detector now uses a total code-unit comparator for raw observation provenance and page-ID ties. Scalar date validation precedes day-list allocation.
- The adapter validates every page/date row with the narrow observation schema before curation. Private DTO/detector schemas and types no longer have unused exports.
- Director verification retained the original failing cases. Provider-validation cases moved into `GrowthSearchPerformanceProviderValidation.test.ts` to satisfy file/function lint limits, without removing assertions. `GrowthSearchPerformanceAcceptance.test.ts` retains the Unicode-URL and bounded-window regressions.
- The Director added the Unicode-ID regression to `PriorityPageClickDeclineDetector.test.ts` after confirming it was absent from the implementation handoff. `GrowthSearchPerformanceSiteContext.test.ts` adds eight cases for separate site totals, omitted context, invalid rows, property drift and provider failures.
- Test mocks now declare their input types. The only new lint waiver captures `Date.prototype.toISOString` in a bounded-allocation test; the mock explicitly restores its receiver with `.call(this)`. No production lint or Knip rule was disabled.

During repair review, the Git index held the original reviewed candidate. The unstaged source/test diff, plus the two untracked test files, defined the repair-only review scope. No upstream normalizer behavior changed.
