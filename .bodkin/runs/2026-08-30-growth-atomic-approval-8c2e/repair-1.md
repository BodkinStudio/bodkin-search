# Verification repair

The first final-gate run passed all 189 regression tests across 33 files, including actual Postgres. Formatting and dependency checks passed. TypeScript reported that `saved` could be null inside the hoisted replay function declaration. The production bundle built, but its trailing type-check failed for the same two diagnostics.

Declare the local replay helper as a non-hoisted `const` arrow after the existing not-found guard. This lets TypeScript retain the captured value's narrowing. No approval, replay, query or UI behavior changes. Re-run the final gates and preserve the original database and UI limits in `runtime-evidence.md`.
