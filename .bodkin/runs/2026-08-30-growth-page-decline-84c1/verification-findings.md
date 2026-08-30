# Initial independent verification findings

This records the initial candidate, before repair round 1. The Director reproduced these failures before formal repair. Current results are in `verification.json`; the original command outcomes are preserved in `verification-initial.json`.

## Valid findings

1. Provenance is input-order dependent for valid Unicode URL aliases. `localeCompare` can return zero for distinct raw strings that normalize to the same key page. Reversing observations for the precomposed/decomposed accented-host aliases changes only the evidence reference. The stored Signal would then conflict on an exact semantic retry. The acceptance test retains this failing case. Use a total, locale-independent ordering for canonical provenance and deterministic tie-breaking.
2. Non-curated rows bypass the strict URL schema. The adapter validates them with the user-facing normalizer, which accepts bare hosts and unbounded paths, then drops them before snapshot validation. Both a relative provider URL and a URL beyond the DTO's 4,096-character bound return a successful empty snapshot. Validate the complete narrow row before curation.
3. Detector comparison/current windows are enumerated before containment is checked. A small valid source snapshot with a years-long comparison allocates dates before rejecting the window. The bounded regression probe intercepts date formatting after 200 calls, avoiding a large allocation. Resolve and bound date coordinates before any day expansion.
4. `pnpm ci:check` fails at Knip on six unused exported schemas and two unused exported types in the new modules. Remove unnecessary exports or reuse a schema where it validates a real boundary; do not add artificial imports or exclusions to silence the check.

## Passing evidence so far

- Existing GSC/key-page baseline: 5 files, 60 tests.
- First focused detector/adapter plus upstream regressions: 7 files, 66 tests.
- Initial full repository suite: 165 files, 1,497 tests; 6 Postgres-gated files and 11 tests skipped. Database behavior is unchanged in this slice.
- Production build and TypeScript pass.
- The first 12 expanded acceptance cases pass. Four later targeted regressions above fail, so the candidate remains unaccepted.
- A separate fixed-fixture probe confirms 308 to 140 clicks, delta -168, delta percent -54.54545454545454, priority 504 and critical severity.
- A bounded 24,300-observation/100-page diagnostic returns 90 Signals and 10 missing-data suppressions in 8,971 ms on this machine. This records scale behavior, not a production latency guarantee. No provider calls or application database changes occurred.

## Repair scope

Reconcile these findings with fresh full review, then issue one bounded repair against the same plan and acceptance. Do not weaken the regression tests, change upstream normalization semantics or expand into persistence/UI/AI.
