# Required behaviour

1. One supported persisted priority-page decline Signal produces a schema-valid packet with its original numeric values, source/Signal/Run/project IDs, capture time and explicit canonical current period. Numeric contradictions, unsupported detector versions/kinds, unsafe/nonfinite counts, invalid dates or assembly before capture fail; values are never silently corrected.
2. Source resolution first checks the existing active project/organisation relationship. Missing or foreign projects, Signals, Runs, key pages and selected Change Events fail without a packet. Every read is project-scoped and all returned identities are checked. The service performs no write, provider or AI call and relies on already-authorised internal callers rather than inventing auth.
3. Baseline dates are derived only from the supported detector's equal preceding-period rule and labelled as derived. Dates are scalar-bounded before expansion/helper use. Pacific source lag and event-day boundaries are respected.
4. Only the three allowed commercial sections and one subject's metadata are included. Missing context is explicit; current context carries update times and is not represented as historical. Writing preferences, custom sections, competitors, research logs, authors, actors, external refs and provider/account/credential fields are absent, including when seeded with canary secrets.
5. Canonical numbers/IDs are separate from all free text. Text is labelled untrusted; the packet is internal-review-only and makes no claim that arbitrary text is safe for model egress. Instruction-like source prose cannot alter numeric facts, IDs, limits or policy fields.
6. Recognisable credentials are omitted with safe metadata: mixed-case or quoted sensitive assignments, Basic/Bearer values, JWT-shaped values, common provider token prefixes, credential URLs and complete/incomplete PEM keys. Redaction runs before truncation; a credential late in a valid-length source field must not leak its prefix. Narrative URL query/fragment data and email addresses are omitted. Tests exercise every declared family and assert no secret in the complete serialised packet.
7. Text limits disclose truncation/redaction; raw source bounds and a hard 32,768 UTF-8 byte packet cap are enforced, including Unicode and maximum-list cases. Canonical numbers/IDs are not truncated. The subject URL is a safe display projection without query/fragment, marked as such; stable key-page ID remains canonical.
8. Optional known Change Event selection is bounded to 10 unique IDs with deterministic order. Only same-project, in-window, Growth-normalised subject candidates appear; unrelated/out-of-window events are counted as omitted. Matches explicitly retain the coarser normalised-URL limitation, including query and non-root-slash cases. Empty/absent selections never mean no confounders exist.
9. The packet explicitly discloses unavailable raw/source-property/site-total/impression context, GSC omissions, unassessed open Actions and unselected changes, and no causal conclusion. It cannot imply a complete source replay or site-wide comparison from an opaque digest.
10. Fixed inputs yield identical packet content/reference after input reordering. A changed included canonical fact or redacted-context output changes the reference; ignored/private source fields do not. The digest covers the final safe projection, never raw context or raw URLs. The pure builder does not mutate input or access a clock, environment, database, provider or model.

# Required checks

- Deterministic fixture-to-Signal-to-packet unit/service tests pass, with project/organisation isolation, current-context changes, late-secret redaction, ignored canaries and explicit partial coverage.
- Every declared privacy family, output byte bound, date-boundary and coarser URL matching case has executable evidence.
- Existing detector, Growth Run/Change Event, GSC helper and project-context tests pass unchanged apart from a version constant export.
- Director independently executes focused checks, `pnpm test:ci`, `pnpm ci:check`, production build and staged/unstaged whitespace checks.
- Fresh full review passes or all material findings are explicitly dispositioned, repaired and freshly re-reviewed. A fresh DEEP acceptance audit returns PASS.

# Regression constraints

No database schema/query implementation, URL normaliser behavior, auth/API/provider behavior, lifecycle mutation, dependency, public endpoint, AI egress or scheduling change. No live provider calls, production data changes, push or deployment.

# Important edge cases

- Unicode ordering and UTF-8 length, duplicate IDs, 0/10/11 selected changes, 45/46-day periods, leap/year/Pacific boundaries and malformed stored metadata.
- A recognised credential beyond the display truncation point; multiline or incomplete key material; URL credentials/query tokens; unknown fields with canary secrets.
- A key page removed since detection, commercial context changed since capture, and relevant changes just inside/outside comparison/current periods.
- Distinct query/trailing-slash subjects mapping to the same coarse Growth change URL.

# Product / UX requirements

None. Internal packet generation is not AI Insight generation and does not complete Gate 2.

# Specialist review requirements

No external specialist tool is required. Fresh backend/privacy adversarial review must assess the allowlist, trust/egress marker, secret-redaction claims and provenance limitations. The DEEP final acceptance audit must reconcile every declared privacy test family and bound.
