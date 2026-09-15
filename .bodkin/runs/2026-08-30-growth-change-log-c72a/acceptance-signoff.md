# Acceptance signoff

Accepted the bounded manual priority-page change-log milestone on 30 August 2026.

## Required behaviour and evidence

| Criterion                                                                                    | Evidence                                                                                                           |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Record a typed, dated note for a configured priority page without GSC                        | Schema and service tests; actual synthetic UI submission described in browser-verification.md                      |
| Derive project and actor from authenticated context; reject foreign pages and overrides      | Server-function middleware/authority tests and service scope tests                                                 |
| Persist immutable, project-scoped history with deterministic latest-50 ordering              | Repository query tests, service tests, real SQLite integration and a fresh browser document reading the saved note |
| Replay a frozen request safely, including after page removal; reject changed immutable facts | Existing writer regressions and new service/SQLite lifecycle tests                                                 |
| Validate dates and descriptions; show separate UTC changed/recorded dates                    | Schema tests, presentation/render tests and the persisted 29 August browser example                                |
| Read without provider calls or writes; avoid automatic resubmission on reload                | Read-path tests and fresh-document browser verification                                                            |
| Keep incumbent Growth checks/sample evidence intact and support narrow layouts               | Focused Growth regressions, five rendered captures and independent UI review                                       |

## Final checks and reviews

- Focused verification: **101 tests passed, 2 optional Postgres tests skipped**; 17 files passed and one gated file skipped.
- `pnpm ci:check`, production build and `git diff --check`: passed after all application edits.
- Independent engineering review: pass, no findings or verification gaps.
- Final independent rendered UI review: pass, after the scoped inline-error colour correction. This was the only application change after the engineering review; backend behaviour was unchanged.
- The final machine results are in verification.json and ui-preflight.json. Initial failures and their repairs are retained in verification-initial.json, repair-1.md and review-dispositions.md.

## Scope and limitations

The feature reuses the existing normalized Change Event storage, project auth, server-function/service/repository boundaries and OpenSEO UI. No dependencies, schema migrations, new auth/MCP system, provider calls or real-project mutations were added.

Entries cover one configured priority page, are immutable, and show the latest 50 manual events. They are explicitly not proof of SEO causality or evidence captured by a check. An uncertain save preserves its payload for an explicit retry; browser reload does not restore or resubmit it.

Browser verification used only the disposable QA project. The 390px evidence is a labelled iframe viewport, not native-device emulation. No live Postgres database or external SEO provider was exercised. The production build retains the existing large-chunk warning. Visual review confirmed readability; no numerical WCAG contrast claim is made.

No unresolved acceptance findings remain. No external push or deployment is included in this milestone.
