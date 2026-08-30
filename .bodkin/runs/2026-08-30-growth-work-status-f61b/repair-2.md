# Postgres fixture correction

After the user-authorized Docker restart, the cached Postgres 16 image started normally and the existing migrations passed against a new disposable loopback-only database. The two opt-in Growth suites executed: six tests passed and one failed.

The failing saved-Work fixture created a recommendation targeting `https://example.com/newer` but reused Action input targeting `https://example.com/pricing`. The existing source-target guard correctly prevented that Action from being inserted. The full-list expectation also incorrectly omitted the original qualifying Action.

Scope: only `GrowthApprovalRepository.postgres.test.ts`. Match the new Action target to its saved recommendation, assert both Actions appear exactly once in the full list, and separately assert the latest-one list excludes the original Action before exercising its exact-ID lookup with the same limit. Do not change production ordering, source qualification, guards or list limits.

This is repair round 2 of the existing run. The backend implementer diagnosed the fixture read-only; the Director applies and verifies the correction. Re-run the two Postgres suites and check this file's formatting/lint. Previously passing application CI and SQLite/UI regressions remain applicable because application code is unchanged. A narrow independent repair/evidence review is required. The fresh rendered-UI gate remains unresolved.
