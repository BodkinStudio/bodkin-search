# Work delivery checkpoint

Application code is implemented and synced to the existing synthetic preview at `http://127.0.0.1:3218/p/growth-check-qa/growth#growth-work`. This code checkpoint is based on `432c186`. Automated verification is complete; full UI acceptance remains blocked on fresh rendered evidence.

## What changed

Work now offers an explicit next-status selector and optional note inside a native disclosure, plus the latest 50 status events. It reuses the existing Action lifecycle and atomic event ledger. Exact-ID source qualification is independent of the Work list limit. Saved versions protect concurrent updates; uncertain submissions remain locked to their original intent until retry or an explicit recovery read. Only persisted current state is displayed. Implementation is not presented as evaluated impact or automatic website execution.

No migration, dependency, provider call, auth mechanism, MCP surface or unrelated product code was added. Project and actor identities remain server-derived; requested states and notes are validated. History omits raw actor IDs and internal hashes/keys.

## Executed evidence

- Director's focused Growth regressions: 146 passed. Includes a real SQLite check/approval/status/history roundtrip and UI state/submission contracts. The seven optional Postgres tests skipped in that run were subsequently executed separately: all seven passed after the Docker restart and fixture correction.
- Full `pnpm ci:check`: passed, including formatting, knip, both TypeScript configurations, type-aware lint and unchanged generated skills. It took about 20 minutes on this host; it was not rerun.
- UI mechanical detector: no findings. Whitespace and final changed-file formatting passed.
- Full Vite production bundle passed after the Docker restart: client 20.70 seconds, SSR 3 minutes 19 seconds. The earlier incomplete build is preserved in `verification-before-docker-restart.json`. CI already executed type-checking, so the bundle command did not repeat that step.
- Original focused engineering review and fresh repair/evidence review: no functional/code findings. The latest review, `review-repair-2.json`, retains only the rendered-UI gap; its strict verdict remains revise.

## Review dispositions and remaining gates

1. **Postgres evidence gap: covered.** After the user-authorized Docker restart, a fresh isolated Postgres 16 database accepted the existing migrations. Both Growth Postgres suites executed with seven passing tests. One initially failing fixture reused a target that did not match its new recommendation and omitted the original Action from its full-list expectation. Repair 2 corrects only the fixture, preserves source guards and proves both deduplication and exact-ID scope beyond a latest-one list. The failed and passing attempts are recorded in `verification.json`.
2. **CI/build evidence gap: covered.** CI, full client/SSR bundling and whitespace have passing Director evidence. Application code is unchanged since the earlier CI and 146-test run; the later test-fixture edit was separately executed and formatting/type-aware-lint checked.
3. **Rendered UI evidence gap: valid, blocked.** Bodkin UI classifies this as material EXTEND. Its preflight fails on missing fresh desktop/narrow captures. The browser previously denied the QA URL; no alternate browser, indirect access or URL-policy workaround was used. Static render/handler tests do not replace visual review. Obtain permitted screenshots and a fresh UI review before accepting the UI.

Both allowed repair rounds have been used: the existing preview test's missing server-function mock, then the Postgres fixture correction. Independent checks and the fresh repair review cover the corrected fixture. No further automatic code repair is available in this run. Preserve the reviewer's do-not-change constraints; do not reopen unrelated architecture or repeat completed checks after evidence-only updates.

## Runtime cleanup

Temporary container: `bodkin-growth-work-status-pg-f61b`, ID `6593032bfaedaacd55b87e5ecb6fdb42d5f96783142c64420fa50bfa66a5b41a`, loopback port 61863. Removal was requested with its synthetic volume; the client timed out, but a later exact-ID inspection confirmed the container no longer exists. No real database or environment file was modified. The cached image and other containers were left untouched. Fixtures/migrations retain everything needed to recreate synthetic test data.

The user subsequently authorized a Docker restart. `docker desktop restart --timeout 90` completed with exit 0; engine 29.7.2 became responsive. New temporary container `bodkin-growth-work-status-pg-f61b-retry1`, ID `7aa92e5f385ae1b69f68b30047ecee391571ffb89b385f55bfc2b5efcbbd1a27`, used loopback port 64713. After the passing migrations/tests, its exact-ID removal with `--force --volumes` completed with exit 0. Its synthetic data can be recreated from the migrations and fixtures; no unrelated containers, volumes or cached images were deleted.

All verification commands have ended. The existing local preview is still listening on port 3218. The user has been asked for fresh desktop and narrow-window screenshots with the Work status/history disclosure open. Once permitted captures are available, complete UI preflight and fresh specialist review. The run remains escalated solely for that evidence gate; a code checkpoint does not claim full UI acceptance.
