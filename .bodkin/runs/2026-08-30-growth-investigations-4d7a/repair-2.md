# Final bounded repair batch

Director verification found five oxlint errors in the priority-check orchestration and its tests: an unused catch binding, a misplaced narrow-cast suppression, and unsafe inferred values in test mocks/matchers. The implementer is repairing those three files without broad refactoring.

Real browser approval saved the recommendation's accepted state but failed before creating the Action. The due date stayed frozen and explicit recovery controls remained available. The Director is isolating the Action creation error with the real D1 driver against a copy of the disposable synthetic database; no live project or provider is involved. This is not accepted as complete until the real browser retry, reload and source link pass.

Root cause verified by the real D1 diagnostic: a new `GROUP BY growth_actions…` was accidentally added to the existing `listRecommendationTargets` query, which does not join Actions. It belongs on the new `listInvestigationWork` query. The implementer moved it and added SQLite tests for both the target read and duplicate linked-insight work projection. The Director reran the real D1 diagnostic against the synthetic copy: approval succeeded. The Director also extended the existing SQLite integration to execute the whole check → proposal → approval → replay → work-list path and assert actor history, changed-date/foreign-project rejection and snapshot targets after setup deletion. Five tests passed; targeted lint passed.

The preview hot-reloaded after the query fix, clearing only in-memory form state. No approval was automatically resubmitted. The saved accepted-without-action state is being resumed explicitly through the UI.

Final outcome: explicit UI approval completed with the original 4 September due date. One Action and one creation event were persisted. A fresh narrow-width load read that Work item and its source link selected the exact saved check. The final focused suite, CI, production build and whitespace check all passed. Detailed browser evidence is in `browser-evidence.md`.

The first QA seed failure was a harness issue: its ordinary queries used the preview libSQL client, but the atomic batch helper still imported a different D1 client. Pointing both handles at the same disposable database yielded a completed check and a saved proposal. The earlier failed synthetic run remains immutable.
