# Test-only lint repair

The refreshed full gate passed all 190 tests across 33 files, including Postgres, and the complete production build. CI passed formatting, dependency analysis and both TypeScript checks, then reported two errors in the new Postgres fixture: the outer `describe` callback exceeded the line limit after the fifth test was added, and an expected-row array used `sort` instead of `toSorted`.

Move the existing database lifecycle hooks to file scope, with the existing opt-in guard, and split the tests into two bounded groups. Use `toSorted` for the expected rows. Do not change application code or weaken assertions/lint rules. Run the five Postgres tests and complete `pnpm ci:check`; retain the independently executed 190-test and production-build results because their application source is unchanged. Preserve the pre-repair verification record and make the evidence merge explicit.

Mechanical follow-through in this same test-only cleanup: moving the opt-in guard makes the existing `testUrl!` assertion redundant. The five tests passed after the hook split; CI caught that now-unnecessary assertion. Remove the assertion (which TypeScript erases at runtime) and rerun CI. This changes no test behavior, assertions or application code and starts no new implementation scope.
