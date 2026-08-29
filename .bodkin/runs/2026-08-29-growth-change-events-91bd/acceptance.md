# Required behaviour

- ADR-025 records Change Event ownership, exact source/type vocabularies, immutable core, canonical URLs, retry policy, independent Action-link semantics and deletion direction.
- A trusted service records a manual Change Event only for an existing, unarchived project and stamps source `manual`; missing, archived or foreign projects fail without inserting anything.
- Each Event requires a project-scoped caller key, bounded actor/description, offset-aware occurrence time, an optional bounded external reference and 1–100 affected exact URLs.
- URLs reuse Growth canonicalization: HTTPS output, lowercased and leading-`www`-stripped host, query/fragment/trailing-slash removal, preserved path case/encoding, allowed project subdomains, deterministic sort/dedupe and off-project rejection. A root URL remains exact, not site-wide.
- The parent and normalized URL set are one immutable atomic graph. The complete fact hash excludes generated ID/time. Exact semantic retries—including reordered/equivalent URL and timestamp forms—return the original graph; changed core facts or URLs conflict without adding losing children.
- Change Events can exist with no Actions. A separate project-scoped operation links one existing Event and Action. Exact link retry is harmless; missing/foreign coordinates fail without revealing another project or changing Action state/history.
- One Event can link many Actions and one Action can link many Events, including Actions from different runs in the same project. URL overlap and Action status are not linking requirements.
- Action links are append-only application associations and are excluded from the immutable Event hash. No event/URL update/delete or link removal API exists.
- Project deletion cascades the complete Change graph. Event deletion cascades only its URL/link children. Action, Recommendation or run deletion removes the affected links while the Event and URLs survive; unrelated Actions/runs/projects survive.
- Database constraints reject cross-project URL/link attachment, invalid source/type/actor vocabulary, malformed text bounds, duplicate Event keys, duplicate URLs and duplicate Action/Event coordinates on D1 and Postgres.

# Required checks

- Zod tests cover actor/type vocabularies, text/reference/date bounds, URL cardinality and link identifiers.
- Service tests cover project validation, source stamping, URL/timestamp normalization, exact retry/drift, complete graph reread, standalone creation, project isolation, idempotent Action linking and no Action lifecycle mutation.
- A migration-backed real-libSQL test starts after migration 0046 with populated Actions, applies the new migration, inspects composite keys/indexes, exercises raw checks/cross-project failures/deletion directions and ends with a clean `PRAGMA foreign_key_check`.
- A real-libSQL repository test exercises the production provider-aware writer, graph reads and link insert through actual Drizzle/runBatch behavior.
- Provider-gated Postgres evidence applies the complete migration tree to a fresh disposable database and exercises real concurrent same-key exact/drift creation, same-project links and cascades.
- `src/db/schema-parity.test.ts`, all focused Growth regressions, full root tests, `ci:check`, production build and `git diff --check` pass.
- Fresh adversarial review returns pass or every accepted finding is repaired and reverified within two rounds.

# Regression constraints

- Existing Growth settings, pages, runs, Signals, Insights, Recommendations and Action/event lifecycle remain green.
- No external boundary trusts caller-supplied project or actor identity in this slice; future UI/MCP surfaces derive both from authorization context.
- Existing auth, MCP, rank/audit models, schedulers, provider metering and upstream snapshots remain unchanged.
- No dependency, paid call, production migration, deployment or remote application state is introduced.

# Important edge cases

- The same creation key in two projects is independent; the same project/key with URL drift cannot contaminate the winner.
- Equivalent URL variants and reordered duplicates are one exact fact; cross-domain, credentialed and malformed URLs fail.
- A removed page URL is valid historical input and is not fetched.
- A standalone Event remains readable after links are added or linked Actions are deleted.
- Linking a cancelled or evaluated Action remains a valid historical association and does not reopen it.
- Deleting one run removes only links to its Actions; the Event, its URLs and links to Actions in surviving runs remain.

# Product / UX requirements

None. Manual form, UI, MCP and other public/API surfaces are explicitly deferred.

# Specialist review requirements

None. Fresh full-scope engineering review is required.
